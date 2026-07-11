import fs from 'fs';
import { logger } from '../shared/logger.js';
import type { TerminalTarget } from './targets.js';
import type { SSH } from '../shared/interfaces.js';

/**
 * A key path is only usable if it exists and holds something other than the
 * placeholder the repo ships. Passing `-i` at a dummy key makes ssh fail in a
 * confusing way, so we'd rather omit the flag.
 */
export function keyArgs(key?: string): string[] {
  if (!key || !fs.existsSync(key)) return [];
  try {
    const content = fs.readFileSync(key, 'utf8').trim();
    if (!content || content === 'DUMMY KEY') {
      logger().info('SSH key is empty or a placeholder, not passing -i');
      return [];
    }
    return ['-i', key];
  } catch {
    logger().warn('Could not read SSH key file, not passing -i', { key });
    return [];
  }
}

/**
 * tmux is what actually makes a session survive us restarting, the network
 * dropping, or the phone sleeping for an hour. We attach-or-create a session
 * named after the target and tab, so reconnecting lands in the same place even
 * if this server lost all its own state in between.
 *
 * The whole thing is one argv element; ssh joins its trailing args with spaces
 * and hands them to the remote login shell, which is what interprets `$SHELL`
 * and `||`. If tmux isn't installed we fall through to a plain login shell
 * rather than failing the connection.
 */
export function remoteCommand(
  target: TerminalTarget,
  tab: number,
  fresh = false,
): string {
  if (!target.tmux) return '';
  const name = `cactuz-${target.slug}-${tab}`;
  // A chain of tmux commands, `\;`-separated (each `\;` reaches tmux as a literal
  // separator through the remote shell):
  //   set mouse on            → a wheel/touch drag scrolls tmux history (the
  //                             alternate screen has no xterm scrollback);
  //                             session-scoped so it can't affect other sessions.
  //   set -g set-clipboard on → a mouse drag-selection emits OSC 52, so it lands
  //                             on the *browser's* clipboard (client/app/osc52.ts).
  //   set allow-passthrough   → lets an inner app's DCS-wrapped OSC 52 (e.g.
  //                             Claude Code's own copy) pass through to us.
  // The optional ones come last so an old tmux erroring on them still gets mouse.
  const create =
    `tmux new-session -A -s ${name}` +
    ` \\; set mouse on \\; set -g set-clipboard on \\; set allow-passthrough on`;
  // `fresh` kills the existing session first, so "new instance" gives a truly
  // empty shell instead of reattaching to the old one. kill-session failing
  // (nothing to kill) is fine; the `;` runs new-session either way.
  const start = fresh
    ? `{ tmux kill-session -t ${name} 2>/dev/null; exec ${create}; }`
    : `exec ${create}`;
  return (
    `command -v tmux >/dev/null 2>&1 && ${start} || ` +
    `exec "\${SHELL:-/bin/sh}" -l`
  );
}

/**
 * Build the argv for one terminal session. The target is always known and
 * already validated, so there is no host/command guessing from the URL.
 */
export function sshArgs(
  target: TerminalTarget,
  { auth, pass, key, knownHosts, config }: SSH,
  tab: number,
  fresh = false,
): string[] {
  // `accept-new` trusts unseen hosts once; with /dev/null there is nothing to
  // remember, so checking would reject every connection.
  const hostChecking = knownHosts !== '/dev/null' ? 'accept-new' : 'no';
  const cmd = remoteCommand(target, tab, fresh);

  logger().debug('Building ssh command', { slug: target.slug, tab, auth });

  return [
    ...(pass ? ['sshpass', '-p', pass] : []),
    'ssh',
    '-q',
    '-t',
    ...(config ? ['-F', config] : []),
    '-p',
    String(target.port),
    ...keyArgs(key),
    '-o',
    'ConnectTimeout=10',
    // Detached sessions can idle for hours; keep the TCP path warm so the
    // remote doesn't reap us and NAT doesn't forget the mapping.
    '-o',
    'ServerAliveInterval=20',
    '-o',
    'ServerAliveCountMax=6',
    '-o',
    'TCPKeepAlive=yes',
    '-o',
    `UserKnownHostsFile=${knownHosts}`,
    '-o',
    `StrictHostKeyChecking=${hostChecking}`,
    // Without this, typing ~. at a line start silently kills the session.
    '-o',
    'EscapeChar=none',
    // Only fail-fast when we can actually authenticate non-interactively (a
    // real key, or a password via sshpass). With neither, leave BatchMode off
    // so ssh can prompt for a password in the terminal.
    ...(!pass && keyArgs(key).length ? ['-o', 'BatchMode=yes'] : []),
    '--',
    `${target.user}@${target.host}`,
    ...(cmd ? [cmd] : []),
  ];
}
