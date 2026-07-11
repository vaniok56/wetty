import compression from 'compression';
import winston from 'express-winston';
import { logger } from '../shared/logger.js';
import { serveStatic } from './socketServer/assets.js';
import { html, renderHome } from './socketServer/html.js';
import { manifest } from './socketServer/manifest.js';
import { metricMiddleware, metricRoute } from './socketServer/metrics.js';
import { favicon, redirect } from './socketServer/middleware.js';
import { policies } from './socketServer/security.js';
import { assetsPath } from './socketServer/shared/path.js';
import { listen } from './socketServer/socket.js';
import { loadSSL } from './socketServer/ssl.js';
import type { PushService } from './push.js';
import type { TerminalTarget } from './targets.js';
import type { SSL, SSLBuffer, Server } from '../shared/interfaces.js';
import type { Express } from 'express';
import type SocketIO from 'socket.io';

export async function server(
  app: Express,
  { base, port, host, title, allowIframe, socket }: Server,
  ssl: SSL | undefined,
  targets: Record<string, TerminalTarget>,
  push: PushService,
): Promise<SocketIO.Server> {
  const basePath = base.replace(/\/+$/, '') || '';
  const rootPath = basePath || '/';
  logger().info('Starting server', { ssl: Boolean(ssl), port, basePath, title });

  const targetList = Object.values(targets);
  app.set('trust proxy', true);
  app.disable('x-powered-by').use(metricMiddleware(basePath));

  app.use(
    winston.logger({
      winstonInstance: logger(),
      expressFormat: true,
      level: 'http',
    }),
  );

  app
    .use(`${basePath}/client`, serveStatic('client'))
    .use(`${basePath}/metrics`, metricRoute)
    .use(compression())
    .use(await favicon(basePath))
    .use(redirect)
    .use(policies(allowIframe));

  // Everything below must be registered before the `/:target` catch-all,
  // otherwise `sw.js` and `manifest.webmanifest` look like target slugs.
  push.routes(app, basePath);

  app.get(`${basePath}/manifest.webmanifest`, (_req, res) => {
    res.type('application/manifest+json').send(manifest(basePath, title));
  });

  // Served from the base path, not from /client, so its default scope covers
  // the whole app. A worker can only control pages at or below its own URL.
  app.get(`${basePath}/sw.js`, (_req, res) => {
    res.set('Service-Worker-Allowed', rootPath);
    res.set('Cache-Control', 'no-cache');
    res.type('application/javascript').sendFile(assetsPath('client', 'sw.js'));
  });

  app
    .get(rootPath, (_req, res) => {
      res.send(renderHome(basePath, title, targetList));
    })
    .get(`${basePath}/:target`, (req, res, next) => {
      const target = targets[req.params.target];
      if (!target) {
        next();
        return;
      }
      html(basePath, title, target)(req, res, next);
    });

  const sslBuffer: SSLBuffer = await loadSSL(ssl);
  return listen(app, host, port, basePath, sslBuffer, socket);
}
