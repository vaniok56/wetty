import 'mocha';
import { once } from 'events';
import { expect } from 'chai';
import express from 'express';
import ioClient from 'socket.io-client';

import { decorateServerWithSsh } from '../server';
import { PushService } from './push';
import { server as createServer } from './socketServer';
import type { TerminalTarget } from './targets';
import type { SessionConf, Server } from '../shared/interfaces';
import type { AddressInfo } from 'net';
import type { Socket } from 'socket.io-client';

interface Attached {
  snapshot: string;
  created: boolean;
}

const target: TerminalTarget = {
  slug: 'box',
  name: 'Box',
  host: '192.0.2.1',
  user: 'test',
  port: 22,
  tmux: false,
};

const sessionConf: SessionConf = {
  graceMs: 5000,
  scrollback: 1000,
  snapshotScrollback: 200,
  maxTabs: 4,
  maxSessions: 2,
};

const shell = [
  "printf 'READY\\r\\n'",
  'sleep 1',
  "printf 'WHILE-AWAY\\r\\n'",
  'while IFS= read -r line; do stty size; printf \'OUT:%s\\r\\n\' "$line"; done',
].join('; ');

const event = <T>(socket: Socket, name: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out on ${name}`)), 3000);
    socket.once(name, value => {
      clearTimeout(timer);
      resolve(value as T);
    });
  });

const connect = async (url: string, base: string): Promise<Socket> => {
  const socket = ioClient(url, {
    path: `${base}/socket.io`,
    reconnection: false,
    transports: ['websocket'],
  });
  await event(socket, 'connect');
  return socket;
};

describe('Socket.IO integration', () => {
  const connectRoot = async (): Promise<void> => {
    const io = await createServer(
      express(),
      {
        base: '/',
        port: 0,
        host: '127.0.0.1',
        socket: false,
        title: 'Test terminal',
        allowIframe: false,
      },
      undefined,
      { box: target },
      new PushService({ subject: 'mailto:test@example.com' }),
    );
    if (!io.httpServer.listening) await once(io.httpServer, 'listening');
    const { port } = io.httpServer.address() as AddressInfo;
    const client = await connect(`http://127.0.0.1:${port}`, '');
    client.disconnect();
    await new Promise<void>(resolve => {
      io.close(() => resolve());
    });
  };

  const exercise = async (base: string): Promise<void> => {
    const conf: Server = {
      base,
      port: 0,
      host: '127.0.0.1',
      socket: false,
      title: 'Test terminal',
      allowIframe: false,
    };
    const io = await decorateServerWithSsh(
      express(),
      undefined,
      conf,
      undefined,
      sessionConf,
      { subject: 'mailto:test@example.com' },
      { box: target },
      () => ['/bin/sh', '-c', shell],
    );
    if (!io.httpServer.listening) await once(io.httpServer, 'listening');
    const { port } = io.httpServer.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}`;
    let client = await connect(url, base);

    const firstAttached = event<Attached>(client, 'attached');
    client.emit('attach', { slug: 'box', tab: 0, cols: 80, rows: 24 });
    expect((await firstAttached).created).to.equal(true);

    client.disconnect();
    await new Promise(resolve => {
      setTimeout(resolve, 1200);
    });
    client = await connect(url, base);
    const reattached = event<Attached>(client, 'attached');
    client.emit('attach', { slug: 'box', tab: 0, cols: 80, rows: 24 });
    const { snapshot } = await reattached;
    expect(snapshot).to.contain('READY');
    expect(snapshot).to.contain('WHILE-AWAY');
    expect(snapshot.indexOf('READY')).to.be.lessThan(
      snapshot.indexOf('WHILE-AWAY'),
    );

    let output = '';
    const resizedOutput = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out on data')), 3000);
      client.on('data', (data: string) => {
        output += data;
        if (!output.includes('OUT:hello')) return;
        clearTimeout(timer);
        resolve(output);
      });
    });
    client.emit('resize', { cols: 100, rows: 30 });
    client.emit('input', 'hello\n');
    expect(await resizedOutput).to.match(/30\s+100[\s\S]*OUT:hello/);

    const exit = event(client, 'exit');
    client.emit('kill');
    await exit;
    client.disconnect();
    await new Promise<void>(resolve => {
      io.close(() => resolve());
    });
  };

  it('connects on root and subpath and preserves a detached session', async function () {
    this.timeout(10_000);
    await connectRoot();
    await exercise('/wetty');
  });
});
