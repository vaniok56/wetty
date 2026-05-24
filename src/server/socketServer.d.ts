import type { TerminalTarget } from './targets.js';
import type { SSL, Server } from '../shared/interfaces.js';
import type { Express } from 'express';
import type SocketIO from 'socket.io';
export declare function server(app: Express, { base, port, host, title, allowIframe, socket }: Server, ssl?: SSL, targets?: Record<string, TerminalTarget>): Promise<SocketIO.Server>;
