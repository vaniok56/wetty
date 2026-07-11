import express from 'express';
import webpush from 'web-push';
import { logger as getLogger } from '../shared/logger.js';
import type { PushConf } from '../shared/interfaces.js';
import type { Express, Request, Response } from 'express';

/** web-push is CommonJS; only the default export carries its functions. */
const { setVapidDetails, sendNotification } = webpush;

interface StoredSub {
  identity: string;
  subscription: webpush.PushSubscription;
}

/**
 * Subscriptions live in memory only. The client re-subscribes on every page
 * load, so a server restart costs at most one missed notification and saves us
 * a writable volume plus a store of push endpoints at rest.
 */
export class PushService {
  private readonly subs = new Map<string, StoredSub>();
  readonly enabled: boolean;

  constructor(private readonly conf: PushConf) {
    const { subject, publicKey, privateKey } = conf;
    if (!publicKey || !privateKey) {
      this.enabled = false;
      getLogger().info('Push disabled: VAPID keys not configured');
      return;
    }
    this.enabled = true;
    setVapidDetails(subject, publicKey, privateKey);
    getLogger().info('Push enabled');
  }

  routes(app: Express, basePath: string): void {
    const json = express.json({ limit: '4kb' });

    app.get(`${basePath}/api/push/key`, (_req: Request, res: Response) => {
      if (!this.enabled) {
        res.status(404).json({ error: 'push not configured' });
        return;
      }
      res.json({ publicKey: this.conf.publicKey });
    });

    app.post(
      `${basePath}/api/push/subscribe`,
      json,
      (req: Request, res: Response) => {
        if (!this.enabled) {
          res.status(404).end();
          return;
        }
        const sub = req.body as webpush.PushSubscription;
        if (!sub?.endpoint || typeof sub.endpoint !== 'string') {
          res.status(400).json({ error: 'missing endpoint' });
          return;
        }
        const header = req.headers['cf-access-authenticated-user-email'];
        const email = Array.isArray(header) ? header[0] : header;
        this.subs.set(sub.endpoint, {
          identity: email?.trim() || 'local',
          subscription: sub,
        });
        res.status(204).end();
      },
    );

    app.post(
      `${basePath}/api/push/unsubscribe`,
      json,
      (req: Request, res: Response) => {
        const endpoint = (req.body as { endpoint?: string })?.endpoint;
        if (endpoint) this.subs.delete(endpoint);
        res.status(204).end();
      },
    );
  }

  notify(identity: string, title: string, body: string): void {
    if (!this.enabled) return;
    const payload = JSON.stringify({ title, body });

    for (const [endpoint, stored] of this.subs) {
      if (stored.identity !== identity) continue;
      sendNotification(stored.subscription, payload).catch(
        (err: { statusCode?: number }) => {
          // 404/410 mean the browser threw the subscription away.
          if (err.statusCode === 404 || err.statusCode === 410) {
            this.subs.delete(endpoint);
            return;
          }
          getLogger().warn('Push delivery failed', {
            statusCode: err.statusCode,
          });
        },
      );
    }
  }
}
