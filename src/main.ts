#!/usr/bin/env node

/**
 * terminal-cactuz CLI entrypoint.
 */
import { unlinkSync, existsSync, lstatSync } from 'fs';
import { createRequire } from 'module';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { start } from './server.js';
import { loadConfigFile, mergeCliConf } from './shared/config.js';
import { setLevel, logger } from './shared/logger.js';

/* eslint-disable @typescript-eslint/no-var-requires */
const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const opts = yargs(hideBin(process.argv))
  .scriptName(packageJson.name)
  .version(packageJson.version)
  .options('conf', {
    type: 'string',
    description: 'config file to load config from',
  })
  .option('ssl-key', { type: 'string', description: 'path to SSL key' })
  .option('ssl-cert', { type: 'string', description: 'path to SSL certificate' })
  .option('ssh-auth', {
    description: 'ssh auth method, e.g. "publickey" or "password"',
    type: 'string',
  })
  .option('ssh-pass', { description: 'ssh password', type: 'string' })
  .option('ssh-key', {
    description:
      'path to a client private key; anything reaching this server can then run remote commands',
    type: 'string',
  })
  .option('ssh-config', {
    description: 'alternative ssh configuration file, see "-F" in ssh(1)',
    type: 'string',
  })
  .option('known-hosts', {
    description: 'path to known hosts file',
    type: 'string',
  })
  .option('base', { alias: 'b', description: 'base path', type: 'string' })
  .option('port', { alias: 'p', description: 'listen port', type: 'number' })
  .option('host', { description: 'listen host', type: 'string' })
  .option('socket', { description: 'listen on a unix socket', type: 'string' })
  .option('allow-iframe', {
    description: 'allow embedding in an iframe, defaults to same origin only',
    type: 'boolean',
  })
  .option('log-level', { description: 'log level', type: 'string' })
  .option('help', { alias: 'h', type: 'boolean' })
  .conflicts('host', 'socket')
  .conflicts('port', 'socket')
  .parseSync();

function cleanup(): void {
  if (opts.socket) {
    const socket = opts.socket.toString();
    if (existsSync(socket) && lstatSync(socket).isSocket()) unlinkSync(socket);
  }
}

if (opts.help) {
  yargs.showHelp();
  process.exitCode = 0;
} else {
  process.on('exit', cleanup);
  loadConfigFile(opts.conf)
    .then(config => mergeCliConf(opts, config))
    .then(conf => {
      setLevel(conf.logLevel);
      return start(conf.ssh, conf.server, conf.ssl, conf.session, conf.push);
    })
    .catch((err: Error) => {
      logger().error('error in server', { err });
      process.exitCode = 1;
    });
}
