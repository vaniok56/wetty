import type { IPtyForkOptions } from 'node-pty';

/**
 * Secrets that live in this process's environment but have no business being
 * inherited by a shell the user drives.
 */
const REDACT = /^(TUNNEL_TOKEN|VAPID_PRIVATE_KEY|VAPID_PUBLIC_KEY|SSHPASS)$/;

const inheritedEnv = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !REDACT.test(entry[0]),
    ),
  );

export const ptyOptions: IPtyForkOptions = {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
  env: inheritedEnv(),
};
