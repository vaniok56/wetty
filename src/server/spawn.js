import isUndefined from 'lodash/isUndefined.js';
import pty from 'node-pty';
import { logger as getLogger } from '../shared/logger.js';
import { tinybuffer, FlowControlServer } from './flowcontrol.js';
import { xterm } from './shared/xterm.js';
import { envVersionOr } from './spawn/env.js';
export async function spawn(socket, args) {
    const logger = getLogger();
    const version = await envVersionOr(0);
    const cmd = version >= 9 ? ['-S', ...args] : args;
    logger.debug('Spawning PTY', { cmd });
    const term = pty.spawn('/usr/bin/env', cmd, xterm);
    const { pid } = term;
    const startedAt = Date.now();
    const email = socket.request.headers['cf-access-authenticated-user-email'];
    const address = args[0] === 'ssh' ? args[args.length - 1] : 'localhost';
    logger.info('Process Started on behalf of user', {
        pid,
        address,
        email,
    });
    let connected = false;
    let rawError = '';
    let idleTimer;
    const resetIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            socket.emit('error', 'Timed out due to inactivity after 30 minutes.');
            term.kill();
        }, 30 * 60 * 1000);
    };
    resetIdleTimer();
    term.onExit(({ exitCode }) => {
        clearTimeout(idleTimer);
        logger.info('Process exited', {
            exitCode,
            pid,
            email,
            connected,
            durationMs: Date.now() - startedAt,
        });
        if (!connected && rawError.trim()) {
            socket.emit('error', rawError.trim());
        }
        else {
            socket.emit('logout');
        }
        socket
            .removeAllListeners('disconnect')
            .removeAllListeners('resize')
            .removeAllListeners('input');
    });
    const send = tinybuffer(socket, 2, 524288);
    const fcServer = new FlowControlServer();
    term.onData((data) => {
        if (!connected && data.trim()) {
            if (/permission denied|could not resolve hostname|connection refused|timed out|host key verification failed|no route to host/i.test(data)) {
                rawError += data;
            }
            else {
                connected = true;
                socket.emit('login');
            }
        }
        else if (!connected && !data.trim()) {
            connected = true;
            socket.emit('login');
        }
        resetIdleTimer();
        send(data);
        if (fcServer.account(data.length)) {
            term.pause();
        }
    });
    socket
        .on('resize', ({ cols, rows }) => {
        resetIdleTimer();
        term.resize(cols, rows);
    })
        .on('input', input => {
        resetIdleTimer();
        if (!isUndefined(term))
            term.write(input);
    })
        .on('disconnect', () => {
        clearTimeout(idleTimer);
        term.kill();
        logger.info('Process exited', {
            code: 0,
            pid,
            email,
            durationMs: Date.now() - startedAt,
        });
    })
        .on('commit', size => {
        if (fcServer.commit(size)) {
            term.resume();
        }
    });
}
