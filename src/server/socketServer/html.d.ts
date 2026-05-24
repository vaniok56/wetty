import type { TerminalTarget } from '../targets.js';
import type { RequestHandler } from 'express';
export declare const renderHome: (base: string, title: string, targets: TerminalTarget[]) => string;
export declare const renderTerminal: (base: string, title: string, target: TerminalTarget) => string;
export declare const html: (base: string, title: string, target: TerminalTarget) => RequestHandler;
