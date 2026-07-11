import path from 'path';
import fs from 'fs-extra';
import JSON5 from 'json5';
import isUndefined from 'lodash/isUndefined.js';
import {
  sshDefault,
  serverDefault,
  sessionDefault,
  pushDefault,
  defaultLogLevel,
} from './defaults.js';
import type { Config, SSH, Server, SSL } from './interfaces';
import type winston from 'winston';
import type { Arguments } from 'yargs';

type ConfValue = boolean | string | number | undefined | unknown;

const LOG_LEVELS = [
  'error',
  'warn',
  'info',
  'http',
  'verbose',
  'debug',
  'silly',
];

function parseLogLevel(
  confLevel: typeof winston.level,
  optsLevel: unknown,
): typeof winston.level {
  const logLevel = isUndefined(optsLevel) ? confLevel : `${optsLevel}`;
  return LOG_LEVELS.includes(logLevel)
    ? (logLevel as typeof winston.level)
    : defaultLogLevel;
}

/**
 * Session and push settings come from the environment only; they are
 * deployment concerns rather than per-invocation flags.
 */
export async function loadConfigFile(filepath?: string): Promise<Config> {
  const base: Config = {
    ssh: sshDefault,
    server: serverDefault,
    logLevel: defaultLogLevel,
    session: sessionDefault,
    push: pushDefault,
  };
  if (isUndefined(filepath)) return base;

  const content = await fs.readFile(path.resolve(filepath));
  const parsed = JSON5.parse(content.toString()) as Partial<Config>;
  return {
    ...base,
    ssh: isUndefined(parsed.ssh)
      ? sshDefault
      : { ...sshDefault, ...parsed.ssh },
    server: isUndefined(parsed.server)
      ? serverDefault
      : { ...serverDefault, ...parsed.server },
    ssl: parsed.ssl,
    logLevel: parseLogLevel(defaultLogLevel, parsed.logLevel),
  };
}

/** Merge CLI args over a config, ignoring flags the user did not pass. */
const overlay = <T extends SSH | Server>(
  target: T,
  source: Record<string, ConfValue>,
): T =>
  Object.entries(source).reduce<T>(
    (acc, [k, v]) => (isUndefined(v) ? acc : { ...acc, [k]: v }),
    target,
  );

export function mergeCliConf(opts: Arguments, config: Config): Config {
  const ssl = {
    key: opts['ssl-key'],
    cert: opts['ssl-cert'],
    ...config.ssl,
  } as SSL;

  return {
    ...config,
    ssh: overlay(config.ssh, {
      auth: opts['ssh-auth'],
      pass: opts['ssh-pass'],
      key: opts['ssh-key'],
      config: opts['ssh-config'],
      knownHosts: opts['known-hosts'],
    }),
    server: overlay(config.server, {
      base: opts.base,
      host: opts.host,
      socket: opts.socket,
      port: opts.port,
      title: opts.title,
      allowIframe: opts['allow-iframe'],
    }),
    ssl: isUndefined(ssl.key) || isUndefined(ssl.cert) ? undefined : ssl,
    logLevel: parseLogLevel(config.logLevel, opts['log-level']),
  };
}
