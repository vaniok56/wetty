import fs from 'fs';
import isUndefined from 'lodash/isUndefined.js';
import { logger } from '../../shared/logger.js';

export function sshOptions(
  {
    pass,
    path,
    command,
    host,
    port,
    auth,
    knownHosts,
    config,
  }: Record<string, string>,
  key?: string,
): string[] {
  const cmd = parseCommand(command, path);
  // accept-new automatically adds new host keys to known_hosts
  const hostChecking = knownHosts !== '/dev/null' ? 'accept-new' : 'no';
  logger().info(`Authentication Type: ${auth}`);

  let keyArg: string[] = [];
  if (key && fs.existsSync(key)) {
    try {
      const content = fs.readFileSync(key, 'utf8').trim();
      if (content && content !== 'DUMMY KEY') {
        keyArg = ['-i', key];
      } else {
        logger().info('Key is dummy or empty, skipping -i');
      }
    } catch (e) {
      logger().warn('Could not read key file, skipping -i');
    }
  }

  return [
    ...pass ? ['sshpass', '-p', pass] : [],
    'ssh',
    '-t',
    ...config ? ['-F', config] : [],
    ...port ? ['-p', port] : [],
    ...keyArg,
    '-o', 'ConnectTimeout=10',
    '-o', `UserKnownHostsFile=${knownHosts}`,
    '-o', `StrictHostKeyChecking=${hostChecking}`,
    '-o', 'EscapeChar=none',
    '--',
    host,
    ...cmd ? [cmd] : [],
  ];
}

function parseCommand(command: string, path?: string): string {
  if (command === 'login' && isUndefined(path)) return '';
  return !isUndefined(path)
    ? `$SHELL -c "cd ${path};${command === 'login' ? '$SHELL' : command}"`
    : command;
}
