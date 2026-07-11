import 'mocha';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';

import {
  createTerminalTargets,
  getTerminalTarget,
  loadTerminalTargets,
  RESERVED_SLUGS,
  SLUG_RE,
} from './targets';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTargets() {
  return createTerminalTargets({
    raspik4b: { name: 'raspik4b', host: '192.168.100.105', user: 'raspik4b', port: 22, tmux: true },
    raspik:   { name: 'raspik',   host: '192.168.100.51',  user: 'vaniok56', port: 22, tmux: true },
  });
}

// Write JSON5 to a temp file, point TARGETS_FILE at it, return cleanup fn.
function useTmpFile(content: string): void {
  const tmp = path.join(os.tmpdir(), `targets-spec-${process.pid}-${Date.now()}.json5`);
  fs.writeFileSync(tmp, content, 'utf-8');
  process.env.TARGETS_FILE = tmp;
  // cleanup is handled in afterEach
}

// ─── createTerminalTargets / getTerminalTarget / getTerminalTargetFromReferer ──

describe('createTerminalTargets / getTerminalTarget', () => {
  it('injects slug field from map key', () => {
    const result = makeTargets();
    expect(result.raspik4b).to.deep.equal({
      slug: 'raspik4b', name: 'raspik4b', host: '192.168.100.105', user: 'raspik4b', port: 22, tmux: true,
    });
  });

  it('getTerminalTarget returns undefined for unknown slug', () => {
    expect(getTerminalTarget(makeTargets(), 'missing')).to.equal(undefined);
  });
});

// ─── SLUG_RE and RESERVED_SLUGS ─────────────────────────────────────────────

describe('SLUG_RE', () => {
  const valid = ['a', 'abc', 'raspik4b', 'my-box', 'box-01', '0box'];
  const invalid = ['', 'A', 'ABC', 'my box', '-box', 'box_1', 'BOX', 'Box'];
  for (const s of valid) it(`accepts "${s}"`, () => expect(SLUG_RE.test(s)).to.equal(true));
  for (const s of invalid) it(`rejects "${s}"`, () => expect(SLUG_RE.test(s)).to.equal(false));
});

describe('RESERVED_SLUGS', () => {
  for (const s of ['client', 'metrics', 'ssh', 'favicon.ico']) {
    it(`includes "${s}"`, () => expect(RESERVED_SLUGS.has(s)).to.equal(true));
  }
});

// ─── loadTerminalTargets ─────────────────────────────────────────────────────

describe('loadTerminalTargets', () => {
  const originalEnv = process.env.TARGETS_FILE;

  afterEach(() => {
    // delete the temp file if it was created
    const f = process.env.TARGETS_FILE;
    if (f && f !== originalEnv) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    // restore env
    if (originalEnv === undefined) {
      delete process.env.TARGETS_FILE;
    } else {
      process.env.TARGETS_FILE = originalEnv;
    }
  });

  // ── happy path ─────────────────────────────────────────────────────────

  it('loads valid 3-machine file and returns correct map', () => {
    useTmpFile(`[
      { slug: 'raspik4b', name: 'raspik4b', host: '192.168.100.105', user: 'raspik4b', port: 22 },
      { slug: 'raspik',   name: 'raspik',   host: '192.168.100.51',  user: 'vaniok56', port: 22 },
      { slug: 'reactor',  name: 'Reactor',  host: '192.168.100.129', user: 'vaniok56', port: 22 },
    ]`);
    const result = loadTerminalTargets();
    expect(Object.keys(result)).to.have.members(['raspik4b', 'raspik', 'reactor']);
    expect(result.reactor).to.deep.equal({
      slug: 'reactor', name: 'Reactor', host: '192.168.100.129', user: 'vaniok56', port: 22, tmux: true,
    });
  });

  it('defaults port to 22 when omitted', () => {
    useTmpFile(`[{ slug: 'box', name: 'Box', host: '10.0.0.1', user: 'admin' }]`);
    expect(loadTerminalTargets().box.port).to.equal(22);
  });

  // ── tmux ────────────────────────────────────────────────────────────────

  it('defaults tmux to true when omitted', () => {
    useTmpFile(`[{ slug: 'box', name: 'Box', host: '10.0.0.1', user: 'admin' }]`);
    expect(loadTerminalTargets().box.tmux).to.equal(true);
  });

  it('honours tmux: false', () => {
    useTmpFile(`[{ slug: 'box', name: 'Box', host: '10.0.0.1', user: 'u', tmux: false }]`);
    expect(loadTerminalTargets().box.tmux).to.equal(false);
  });

  it('throws on non-boolean tmux', () => {
    useTmpFile(`[{ slug: 'box', name: 'Box', host: '10.0.0.1', user: 'u', tmux: 'yes' }]`);
    expect(() => loadTerminalTargets()).to.throw(/tmux "yes": must be true or false/);
  });

  it('accepts JSON5 comments and trailing commas', () => {
    useTmpFile(`[
      // this is a comment
      { slug: 'box', name: 'Box', host: '10.0.0.1', user: 'admin', port: 22, },
    ]`);
    const result = loadTerminalTargets();
    expect(Object.keys(result)).to.deep.equal(['box']);
  });

  it('injects slug field into returned TerminalTarget', () => {
    useTmpFile(`[{ slug: 'alpha', name: 'Alpha', host: '10.0.0.1', user: 'u' }]`);
    expect(loadTerminalTargets().alpha.slug).to.equal('alpha');
  });

  it('accepts port at min (1) and max (65535) boundaries', () => {
    useTmpFile(`[
      { slug: 'box1', name: 'B1', host: '10.0.0.1', user: 'u', port: 1 },
      { slug: 'box2', name: 'B2', host: '10.0.0.2', user: 'u', port: 65535 },
    ]`);
    const result = loadTerminalTargets();
    expect(result.box1.port).to.equal(1);
    expect(result.box2.port).to.equal(65535);
  });

  // ── file / parse errors ─────────────────────────────────────────────────

  it('throws on missing file', () => {
    process.env.TARGETS_FILE = '/nonexistent/path/targets.json5';
    expect(() => loadTerminalTargets()).to.throw(/cannot read \/nonexistent\/path\/targets\.json5/);
  });

  it('throws on invalid JSON5', () => {
    useTmpFile(`this is not { valid json5 [ }`);
    expect(() => loadTerminalTargets()).to.throw(/is not valid JSON5/);
  });

  // ── structure errors ────────────────────────────────────────────────────

  it('throws when top-level value is an object (not array)', () => {
    useTmpFile(`{ slug: 'box', name: 'Box', host: '10.0.0.1', user: 'u' }`);
    expect(() => loadTerminalTargets()).to.throw(/must be a JSON5 array/);
  });

  it('throws when top-level value is a string', () => {
    useTmpFile(`"hello"`);
    expect(() => loadTerminalTargets()).to.throw(/must be a JSON5 array/);
  });

  it('throws on empty array', () => {
    useTmpFile(`[]`);
    expect(() => loadTerminalTargets()).to.throw(/has no machines/);
  });

  it('throws when an entry is a primitive (not object)', () => {
    useTmpFile(`["oops"]`);
    expect(() => loadTerminalTargets()).to.throw(/entry #1.*must be an object/s);
  });

  it('throws when an entry is null', () => {
    useTmpFile(`[null]`);
    expect(() => loadTerminalTargets()).to.throw(/entry #1.*must be an object/s);
  });

  // ── unknown keys ────────────────────────────────────────────────────────

  it('throws on unknown key (catches typo "prot")', () => {
    useTmpFile(`[{ slug: 'box', name: 'Box', host: '10.0.0.1', user: 'u', prot: 22 }]`);
    expect(() => loadTerminalTargets()).to.throw(/unknown field.*"prot"/);
  });

  it('throws on unknown key "usr"', () => {
    useTmpFile(`[{ slug: 'box', name: 'Box', host: '10.0.0.1', usr: 'u' }]`);
    expect(() => loadTerminalTargets()).to.throw(/unknown field.*"usr"/);
  });

  // ── slug validation ─────────────────────────────────────────────────────

  it('throws on missing slug', () => {
    useTmpFile(`[{ name: 'Box', host: '10.0.0.1', user: 'u' }]`);
    expect(() => loadTerminalTargets()).to.throw(/slug.*required/);
  });

  it('throws on uppercase slug', () => {
    useTmpFile(`[{ slug: 'Box', name: 'Box', host: '10.0.0.1', user: 'u' }]`);
    expect(() => loadTerminalTargets()).to.throw(/slug "Box".*must match/);
  });

  it('throws on slug with space', () => {
    useTmpFile(`[{ slug: 'my box', name: 'My Box', host: '10.0.0.1', user: 'u' }]`);
    expect(() => loadTerminalTargets()).to.throw(/slug "my box".*must match/);
  });

  it('throws on slug with underscore', () => {
    useTmpFile(`[{ slug: 'my_box', name: 'My Box', host: '10.0.0.1', user: 'u' }]`);
    expect(() => loadTerminalTargets()).to.throw(/slug "my_box".*must match/);
  });

  it('throws on slug starting with hyphen', () => {
    useTmpFile(`[{ slug: '-box', name: 'Box', host: '10.0.0.1', user: 'u' }]`);
    expect(() => loadTerminalTargets()).to.throw(/slug "-box".*must match/);
  });

  it('throws on reserved slug "ssh"', () => {
    useTmpFile(`[{ slug: 'ssh', name: 'SSH', host: '10.0.0.1', user: 'u' }]`);
    expect(() => loadTerminalTargets()).to.throw(/slug "ssh".*reserved/);
  });

  it('throws on reserved slug "client"', () => {
    useTmpFile(`[{ slug: 'client', name: 'C', host: '10.0.0.1', user: 'u' }]`);
    expect(() => loadTerminalTargets()).to.throw(/slug "client".*reserved/);
  });

  it('throws on reserved slug "metrics"', () => {
    useTmpFile(`[{ slug: 'metrics', name: 'M', host: '10.0.0.1', user: 'u' }]`);
    expect(() => loadTerminalTargets()).to.throw(/slug "metrics".*reserved/);
  });

  it('throws on duplicate slug', () => {
    useTmpFile(`[
      { slug: 'box', name: 'Box A', host: '10.0.0.1', user: 'u' },
      { slug: 'box', name: 'Box B', host: '10.0.0.2', user: 'u' },
    ]`);
    expect(() => loadTerminalTargets()).to.throw(/slug "box".*duplicate/);
  });

  // ── required field validation ────────────────────────────────────────────

  it('throws on missing name', () => {
    useTmpFile(`[{ slug: 'box', host: '10.0.0.1', user: 'u' }]`);
    expect(() => loadTerminalTargets()).to.throw(/name.*required/);
  });

  it('throws on missing host', () => {
    useTmpFile(`[{ slug: 'box', name: 'Box', user: 'u' }]`);
    expect(() => loadTerminalTargets()).to.throw(/host.*required/);
  });

  it('throws on missing user', () => {
    useTmpFile(`[{ slug: 'box', name: 'Box', host: '10.0.0.1' }]`);
    expect(() => loadTerminalTargets()).to.throw(/user.*required/);
  });

  it('throws on empty-string name', () => {
    useTmpFile(`[{ slug: 'box', name: '', host: '10.0.0.1', user: 'u' }]`);
    expect(() => loadTerminalTargets()).to.throw(/name.*required/);
  });

  // ── port validation ──────────────────────────────────────────────────────

  it('throws on port 0', () => {
    useTmpFile(`[{ slug: 'box', name: 'Box', host: '10.0.0.1', user: 'u', port: 0 }]`);
    expect(() => loadTerminalTargets()).to.throw(/port "0".*1 and 65535/);
  });

  it('throws on port 65536', () => {
    useTmpFile(`[{ slug: 'box', name: 'Box', host: '10.0.0.1', user: 'u', port: 65536 }]`);
    expect(() => loadTerminalTargets()).to.throw(/port "65536".*1 and 65535/);
  });

  it('throws on float port', () => {
    useTmpFile(`[{ slug: 'box', name: 'Box', host: '10.0.0.1', user: 'u', port: 22.5 }]`);
    expect(() => loadTerminalTargets()).to.throw(/port "22\.5".*1 and 65535/);
  });

  it('throws on string port', () => {
    useTmpFile(`[{ slug: 'box', name: 'Box', host: '10.0.0.1', user: 'u', port: '22' }]`);
    expect(() => loadTerminalTargets()).to.throw(/port "22".*1 and 65535/);
  });

  // ── aggregated errors ────────────────────────────────────────────────────

  it('reports errors from multiple entries in one throw', () => {
    useTmpFile(`[
      { slug: 'Box', name: 'Box', host: '10.0.0.1', user: 'u' },
      { slug: 'box2', name: '', host: '10.0.0.2', user: 'u' },
    ]`);
    expect(() => loadTerminalTargets()).to.throw(/2 invalid entries/);
  });

  it('error message contains both entry labels', () => {
    useTmpFile(`[
      { slug: 'BAD', name: 'Bad', host: '10.0.0.1', user: 'u' },
      { name: 'Missing Slug', host: '10.0.0.2', user: 'u' },
    ]`);
    let msg = '';
    try { loadTerminalTargets(); } catch (e) { msg = (e as Error).message; }
    expect(msg).to.match(/entry #1/);
    expect(msg).to.match(/entry #2/);
  });
});
