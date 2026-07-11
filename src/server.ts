/**
 * terminal-cactuz server: a web terminal whose sessions outlive their sockets.
 */
import express from 'express';
import { Gauge, collectDefaultMetrics } from 'prom-client';
import { sshArgs, keyArgs } from './server/command.js';
import { PushService } from './server/push.js';
import { SessionRegistry, SessionError } from './server/sessions.js';
import { server } from './server/socketServer.js';
import { loadTerminalTargets } from './server/targets.js';
import {
  sshDefault,
  serverDefault,
  sessionDefault,
  pushDefault,
} from './shared/defaults.js';
import { logger as getLogger } from './shared/logger.js';
import type { Session } from './server/sessions.js';
import type { TerminalTarget } from './server/targets.js';
import type {
  SSH,
  SSL,
  Server,
  SessionConf,
  PushConf,
} from './shared/interfaces.js';
import type { Express } from 'express';
import type SocketIO from 'socket.io';

export * from './shared/interfaces.js';
export { logger as getLogger } from './shared/logger.js';

const connections = new Gauge({
  name: 'cactuz_socket_connections',
  help: 'number of active socket connections',
});
const liveSessions = new Gauge({
  name: 'cactuz_sessions',
  help: 'number of live terminal sessions, attached or detached',
});

export const start = (
  ssh: SSH = sshDefault,
  serverConf: Server = serverDefault,
  ssl: SSL | undefined = undefined,
  sessionConf: SessionConf = sessionDefault,
  pushConf: PushConf = pushDefault,
  targets: Record<string, TerminalTarget> = loadTerminalTargets(),
): Promise<SocketIO.Server> =>
  decorateServerWithSsh(
    express(),
    ssh,
    serverConf,
    ssl,
    sessionConf,
    pushConf,
    targets,
  );

export async function decorateServerWithSsh(
  app: Express,
  ssh: SSH = sshDefault,
  serverConf: Server = serverDefault,
  ssl: SSL | undefined = undefined,
  sessionConf: SessionConf = sessionDefault,
  pushConf: PushConf = pushDefault,
  targets: Record<string, TerminalTarget> = loadTerminalTargets(),
): Promise<SocketIO.Server> {
  const logger = getLogger();
  app.set('trust proxy', true);

  if (ssh.key && keyArgs(ssh.key).length) {
    logger.warn(
      'Password-less auth enabled using a private key. Anything that reaches ' +
        'this server can run remote commands without further authentication.',
      { key: ssh.key },
    );
  }

  collectDefaultMetrics();

  const push = new PushService(pushConf);
  const registry = new SessionRegistry(
    (target, tab, fresh) => sshArgs(target, ssh, tab, fresh),
    targets,
    sessionConf,
    (identity, title, body) => push.notify(identity, title, body),
  );

  const io = await server(app, serverConf, ssl, targets, push);

  io.on('connection', (socket: SocketIO.Socket) => {
    connections.inc();
    const identity = SessionRegistry.identify(socket);
    logger.info('Socket connected', { id: socket.id, identity });

    let current: Session | undefined;
    // Attaching is async, so a second `attach` can land mid-flight (tab switch,
    // fast reconnect). The sequence number keeps the newest request
    // authoritative instead of leaving `current` on a session the client left.
    let attachSeq = 0;

    const detach = (): void => {
      if (!current) return;
      current.detach(socket.id);
      current = undefined;
      liveSessions.set(registry.size);
    };

    socket.on('attach', (payload: unknown) => {
      const req = payload as {
        slug?: string;
        tab?: number;
        cols?: number;
        rows?: number;
        fresh?: boolean;
      };
      if (typeof req?.slug !== 'string') {
        socket.emit('fatal', 'attach: missing target');
        return;
      }
      attachSeq += 1;
      const seq = attachSeq;
      detach();

      registry
        .attach(socket, {
          slug: req.slug,
          tab: Number(req.tab ?? 0),
          cols: Number(req.cols ?? 80),
          rows: Number(req.rows ?? 24),
          fresh: Boolean(req.fresh),
        })
        .then(({ session, snapshot, created }) => {
          if (seq !== attachSeq) {
            // Superseded while spawning; release the attachment we just took.
            session.detach(socket.id);
            return;
          }
          current = session;
          liveSessions.set(registry.size);
          socket.emit('attached', {
            slug: session.target.slug,
            tab: session.tab,
            cols: session.cols,
            rows: session.rows,
            snapshot,
            created,
            tabs: registry.list(identity, session.target.slug),
          });
        })
        .catch((err: unknown) => {
          if (seq !== attachSeq) return;
          const message =
            err instanceof SessionError
              ? err.message
              : 'Could not start a session on this host.';
          logger.warn('Attach failed', { identity, slug: req.slug, err });
          socket.emit('fatal', message);
        });
    });

    socket.on('input', (data: string) => {
      if (typeof data === 'string') current?.write(data);
    });

    socket.on('resize', (size: { cols: number; rows: number }) => {
      if (size) current?.resize(Number(size.cols), Number(size.rows));
    });

    socket.on('commit', (size: number) => {
      current?.commit(socket.id, Number(size));
    });

    socket.on('visibility', (visible: boolean) => {
      current?.setVisible(socket.id, Boolean(visible));
    });

    // Explicit teardown: the user ended the session, so skip the grace hold.
    socket.on('kill', () => {
      if (!current) return;
      current.dispose('user-requested');
      current = undefined;
      liveSessions.set(registry.size);
      // Tell the user it's gone, so the UI shows the ended overlay instead of
      // silently freezing.
      socket.emit('exit', { exitCode: 0 });
    });

    socket.on('disconnect', (reason: string) => {
      logger.info('Socket disconnected', { id: socket.id, reason });
      connections.dec();
      detach();
    });
  });

  const shutdown = (signal: string): void => {
    logger.info('Shutting down', { signal });
    registry.disposeAll(`signal-${signal}`);
    process.exit(0);
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  return io;
}
