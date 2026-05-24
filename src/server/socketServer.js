import compression from 'compression';
import winston from 'express-winston';
import { logger } from '../shared/logger.js';
import { serveStatic } from './socketServer/assets.js';
import { html, renderHome } from './socketServer/html.js';
import { metricMiddleware, metricRoute } from './socketServer/metrics.js';
import { favicon, redirect } from './socketServer/middleware.js';
import { policies } from './socketServer/security.js';
import { listen } from './socketServer/socket.js';
import { loadSSL } from './socketServer/ssl.js';
export async function server(app, { base, port, host, title, allowIframe, socket }, ssl, targets = {}) {
    const basePath = base.replace(/\/+$/, '') || '';
    const rootPath = basePath || '/';
    logger().info('Starting server', {
        ssl,
        port,
        base: base || '/',
        basePath,
        title,
    });
    const targetList = Object.values(targets);
    app.set('trust proxy', true);
    app.disable('x-powered-by').use(metricMiddleware(basePath));
    app.use(winston.logger({
        winstonInstance: logger(),
        expressFormat: true,
        level: 'http',
    }));
    app
        .use(`${basePath}/client`, serveStatic('client'))
        .use(`${basePath}/metrics`, metricRoute)
        .use(compression())
        .use(await favicon(basePath))
        .use(redirect)
        .use(policies(allowIframe))
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
    })
        .get(`${basePath}/ssh/:user`, (_req, res) => {
        res.redirect(rootPath);
    });
    const sslBuffer = await loadSSL(ssl);
    return listen(app, host, port, basePath, sslBuffer, socket);
}
