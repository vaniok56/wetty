import 'mocha';
import { once } from 'events';
import { rm } from 'fs/promises';
import http from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { expect } from 'chai';
import express from 'express';

import { PushService } from './push';
import { server } from './socketServer';
import type { TerminalTarget } from './targets';
import type SocketIO from 'socket.io';

interface TestResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

const target: TerminalTarget = {
  slug: 'raspik',
  name: 'Raspik',
  host: '192.0.2.1',
  user: 'test',
  port: 22,
  tmux: true,
};

describe('HTTP server', () => {
  const socketPath = join(tmpdir(), `terminal-cactuz-${process.pid}.sock`);
  let io: SocketIO.Server;

  const request = (
    path: string,
    method = 'GET',
    body = '',
  ): Promise<TestResponse> =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          socketPath,
          path,
          method,
          headers: body
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(body),
              }
            : undefined,
        },
        res => {
          const chunks: Buffer[] = [];
          res.on('data', chunk => chunks.push(Buffer.from(chunk)));
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks).toString(),
            }),
          );
        },
      );
      req.on('error', reject);
      req.end(body);
    });

  before(async () => {
    await rm(socketPath, { force: true });
    io = await server(
      express(),
      {
        base: '/wetty/',
        port: 0,
        host: '127.0.0.1',
        socket: socketPath,
        title: 'Test terminal',
        allowIframe: false,
      },
      undefined,
      { raspik: target },
      new PushService({ subject: 'mailto:test@example.com' }),
    );
    if (!io.httpServer.listening) await once(io.httpServer, 'listening');
  });

  after(async () => {
    await new Promise<void>(resolve => {
      io.close(() => resolve());
    });
    await rm(socketPath, { force: true });
  });

  it('serves root and target pages with security headers', async () => {
    const root = await request('/wetty');
    const terminal = await request('/wetty/raspik');
    const missing = await request('/wetty/missing');

    expect(root.status).to.equal(200);
    expect(root.body).to.contain('host_registry');
    expect(terminal.status).to.equal(200);
    expect(terminal.body).to.contain('data-slug="raspik"');
    expect(terminal.headers['content-security-policy']).to.contain(
      "script-src 'self'",
    );
    expect(missing.status).to.equal(404);
  });

  it('keeps trailing-slash redirects local', async () => {
    const response = await request('/wetty/raspik/?x=1');

    expect(response.status).to.equal(301);
    expect(response.headers.location).to.equal('/wetty/raspik?x=1');
  });

  it('serves Prometheus metrics', async () => {
    const response = await request('/wetty/metrics');

    expect(response.status).to.equal(200);
    expect(response.headers['content-type']).to.contain('text/plain');
    for (const name of [
      'cactuz_socket_connections',
      'cactuz_sessions',
      'http_requests_total',
      'http_request_duration_seconds',
    ]) {
      expect(response.body).to.contain(name);
    }
  });

  it('serves PWA and static assets with expected types', async () => {
    const worker = await request('/wetty/sw.js');
    const manifest = await request('/wetty/manifest.webmanifest');
    const script = await request('/wetty/client/main.js');
    const css = await request('/wetty/client/main.css');
    const icon = await request('/wetty/client/icons/icon-192.png');
    const fontName = /url\(["']?(?:\.\/)?([^"')]+\.woff2)["']?\)/.exec(
      css.body,
    )?.[1];

    expect(worker.status).to.equal(200);
    expect(worker.headers['content-type']).to.contain('application/javascript');
    expect(worker.headers['cache-control']).to.equal('no-cache');
    expect(manifest.headers['content-type']).to.contain(
      'application/manifest+json',
    );
    expect(script.headers['content-type']).to.contain('text/javascript');
    expect(css.headers['content-type']).to.contain('text/css');
    expect(icon.headers['content-type']).to.contain('image/png');
    expect(fontName).to.not.equal(undefined);

    const font = await request(`/wetty/client/${fontName}`);
    expect(font.headers['content-type']).to.contain('font/woff2');
  });

  it('rejects push JSON larger than 4 KB', async () => {
    const response = await request(
      '/wetty/api/push/subscribe',
      'POST',
      JSON.stringify({ endpoint: 'x'.repeat(4097) }),
    );

    expect(response.status).to.equal(413);
  });

  it('rejects an invalid base path before listening', async () => {
    try {
      await server(
        express(),
        {
          base: '//evil.example',
          port: 0,
          host: '127.0.0.1',
          socket: false,
          title: 'Test terminal',
          allowIframe: false,
        },
        undefined,
        { raspik: target },
        new PushService({ subject: 'mailto:test@example.com' }),
      );
      expect.fail('invalid base should be rejected');
    } catch (err) {
      expect((err as Error).message).to.contain('Invalid server base path');
    }
  });
});
