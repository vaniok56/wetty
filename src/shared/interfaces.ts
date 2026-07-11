import type winston from 'winston';

export interface SSH {
  [s: string]: string | number | boolean | undefined;
  auth: string;
  knownHosts: string;
  pass?: string;
  key?: string;
  config?: string;
}

export interface SSL {
  key: string;
  cert: string;
}

export interface SSLBuffer {
  key?: Buffer;
  cert?: Buffer;
}

export interface Server {
  [s: string]: string | number | boolean;
  port: number;
  host: string;
  socket: string | boolean;
  title: string;
  base: string;
  allowIframe: boolean;
}

/**
 * Terminal sessions outlive the socket that created them, so these bound how
 * long an unattached session survives and how much of it we replay on reattach.
 */
export interface SessionConf {
  /** Keep a PTY alive this long after the last client detaches. */
  graceMs: number;
  /** Rows retained by the server-side headless terminal. Drives memory use. */
  scrollback: number;
  /** Rows of scrollback replayed into a reattaching client. */
  snapshotScrollback: number;
  /** Concurrent tabs per (identity, target). */
  maxTabs: number;
  /** Hard cap on live sessions across the whole server. */
  maxSessions: number;
}

export interface PushConf {
  publicKey?: string;
  privateKey?: string;
  subject: string;
}

export interface Config {
  ssh: SSH;
  server: Server;
  logLevel: typeof winston.level;
  ssl?: SSL;
  session: SessionConf;
  push: PushConf;
}
