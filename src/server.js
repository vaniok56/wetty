import express from 'express';
import gc from 'gc-stats';
import { Gauge, collectDefaultMetrics } from 'prom-client';
import { getCommand } from './server/command.js';
import { gcMetrics } from './server/metrics.js';
import { server } from './server/socketServer.js';
import { spawn } from './server/spawn.js';
import { defaultTerminalTargets } from './server/targets.js';
import { sshDefault, serverDefault, forceSSHDefault, defaultCommand, } from './shared/defaults.js';
import { logger as getLogger } from './shared/logger.js';
export * from './shared/interfaces.js';
export { logger as getLogger } from './shared/logger.js';
const wettyConnections = new Gauge({
    name: 'wetty_connections',
    help: 'number of active socket connections to wetty',
});
export const start = (ssh = sshDefault, serverConf = serverDefault, command = defaultCommand, forcessh = forceSSHDefault, ssl = undefined, targets = defaultTerminalTargets()) => decorateServerWithSsh(express(), ssh, serverConf, command, forcessh, ssl, targets);
export async function decorateServerWithSsh(app, ssh = sshDefault, serverConf = serverDefault, command = defaultCommand, forcessh = forceSSHDefault, ssl = undefined, targets = defaultTerminalTargets()) {
    const logger = getLogger();
    app.set('trust proxy', true);
    if (ssh.key) {
        logger.warn(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
! Password-less auth enabled using private key from ${ssh.key}.
! This is dangerous, anything that reaches the wetty server
! will be able to run remote operations without authentication.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
    }
    collectDefaultMetrics();
    gc().on('stats', gcMetrics);
    const io = await server(app, serverConf, ssl, targets);
    io.on('connection', async (socket) => {
        logger.info('Connection accepted.');
        wettyConnections.inc();
        try {
            const args = await getCommand(socket, ssh, command, forcessh, targets);
            logger.debug('Command Generated', { cmd: args.join(' ') });
            await spawn(socket, args);
        }
        catch (error) {
            logger.info('Disconnect signal sent', { err: error });
            wettyConnections.dec();
        }
    });
    return io;
}
