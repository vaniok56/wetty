import http from 'http';
import https from 'https';
import isUndefined from 'lodash/isUndefined.js';
import { Server } from 'socket.io';
import { logger } from '../../shared/logger.js';
export const listen = (app, host, port, path, { key, cert }, socket) => {
    const server = !isUndefined(key) && !isUndefined(cert)
        ? https.createServer({ key, cert }, app)
        : http.createServer(app);
    if (socket) {
        server.listen(socket, () => {
            logger().info('Server listening on Unix socket', { socket });
        });
    }
    else {
        server.listen(port, host, () => {
            logger().info('Server started', {
                port,
                connection: !isUndefined(key) && !isUndefined(cert) ? 'https' : 'http',
            });
        });
    }
    return new Server(server, {
        path: '/socket.io',
        pingInterval: 3000,
        pingTimeout: 7000,
    });
};
