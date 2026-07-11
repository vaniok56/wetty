import { isDev } from './env.js';
import type { SSH, Server, SessionConf, PushConf } from './interfaces';

const int = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const sshDefault: SSH = {
  auth: process.env.SSHAUTH || 'publickey',
  pass: process.env.SSHPASS || undefined,
  key: process.env.SSHKEY || undefined,
  knownHosts: process.env.KNOWNHOSTS || '/dev/null',
  config: process.env.SSHCONFIG || undefined,
};

export const serverDefault: Server = {
  base: process.env.BASE || '/',
  port: int(process.env.PORT, 3001),
  host: '0.0.0.0',
  socket: false,
  title: process.env.TITLE || 'terminal.cactuz.icu',
  allowIframe: process.env.ALLOWIFRAME === 'true',
};

export const sessionDefault: SessionConf = {
  graceMs: int(process.env.SESSION_GRACE_MINUTES, 720) * 60 * 1000,
  scrollback: int(process.env.SESSION_SCROLLBACK, 5000),
  snapshotScrollback: int(process.env.SESSION_SNAPSHOT_SCROLLBACK, 1000),
  maxTabs: int(process.env.SESSION_MAX_TABS, 4),
  maxSessions: int(process.env.SESSION_MAX_SESSIONS, 12),
};

export const pushDefault: PushConf = {
  publicKey: process.env.VAPID_PUBLIC_KEY || undefined,
  privateKey: process.env.VAPID_PRIVATE_KEY || undefined,
  subject: process.env.VAPID_SUBJECT || 'mailto:admin@localhost',
};

export const defaultLogLevel = isDev ? 'debug' : 'http';
