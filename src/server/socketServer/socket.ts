import http from 'http';
import https from 'https';
import isUndefined from 'lodash/isUndefined.js';
import { Server } from 'socket.io';

import { logger } from '../../shared/logger.js';
import type { SSLBuffer } from '../../shared/interfaces.js';
import type express from 'express';

export const listen = (
  app: express.Express,
  host: string,
  port: number,
  path: string,
  { key, cert }: SSLBuffer,
  socket?: string | boolean,
): Server => {
  const secure = !isUndefined(key) && !isUndefined(cert);
  const server = secure
    ? https.createServer({ key, cert }, app)
    : http.createServer(app);

  if (socket) {
    server.listen(socket, () => {
      logger().info('Server listening on Unix socket', { socket });
    });
  } else {
    server.listen(port, host, () => {
      logger().info('Server started', {
        port,
        connection: secure ? 'https' : 'http',
      });
    });
  }

  return new Server(server, {
    // Previously hardcoded to '/socket.io', which broke any non-root BASE.
    path: `${path}/socket.io`,
    // The old 3s/7s pair declared a phone dead seven seconds after Chrome
    // froze the tab. Sessions now survive that, but there is still no reason
    // to tear the socket down so eagerly. These are socket.io's defaults.
    pingInterval: 25_000,
    pingTimeout: 20_000,
    // Reattach snapshots are a single large frame; compress them.
    perMessageDeflate: { threshold: 1024 },
    maxHttpBufferSize: 8e6,
    // Deliberately NOT using connectionStateRecovery: it is best-effort, capped
    // at ~2 minutes, and would replay buffered packets on top of the snapshot
    // we already send on reattach. Our own attach protocol is authoritative.
  });
};
