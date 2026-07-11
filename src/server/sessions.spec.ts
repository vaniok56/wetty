import 'mocha';
import { expect } from 'chai';

import { SessionRegistry, SessionError } from './sessions';
import type { Notifier } from './sessions';
import type { TerminalTarget } from './targets';
import type { SessionConf } from '../shared/interfaces';
import type { Socket } from 'socket.io';

const target: TerminalTarget = {
  slug: 'box',
  name: 'Box',
  host: '10.0.0.1',
  user: 'u',
  port: 22,
  tmux: false,
};
const targets = { box: target };

const conf = (over: Partial<SessionConf> = {}): SessionConf => ({
  graceMs: 60_000,
  scrollback: 1000,
  snapshotScrollback: 200,
  maxTabs: 4,
  maxSessions: 12,
  ...over,
});

interface FakeSocket {
  id: string;
  request: { headers: Record<string, string> };
  emit: (event: string, payload?: unknown) => boolean;
  received: Array<[string, unknown]>;
}

const fakeSocket = (id: string, email?: string): FakeSocket => {
  const received: Array<[string, unknown]> = [];
  return {
    id,
    request: {
      headers: email ? { 'cf-access-authenticated-user-email': email } : {},
    },
    emit(event: string, payload?: unknown) {
      received.push([event, payload]);
      return true;
    },
    received,
  };
};

const asSocket = (s: FakeSocket): Socket => s as unknown as Socket;
const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });
const noop: Notifier = () => undefined;

/** Run a shell script in the PTY instead of ssh. */
const sh = (script: string) => (): string[] => ['/bin/sh', '-c', script];

describe('SessionRegistry', () => {
  const live: SessionRegistry[] = [];
  const track = (r: SessionRegistry): SessionRegistry => {
    live.push(r);
    return r;
  };

  afterEach(() => {
    while (live.length) live.pop()?.disposeAll('test-teardown');
  });

  it('rejects an unknown target', async () => {
    const registry = track(
      new SessionRegistry(sh('sleep 5'), targets, conf(), noop),
    );
    try {
      await registry.attach(asSocket(fakeSocket('a')), {
        slug: 'nope',
        tab: 0,
        cols: 80,
        rows: 24,
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).to.be.instanceOf(SessionError);
      expect((err as Error).message).to.match(/Unknown target/);
    }
  });

  it('rejects a tab outside the configured range', async () => {
    const registry = track(
      new SessionRegistry(sh('sleep 5'), targets, conf({ maxTabs: 2 }), noop),
    );
    for (const tab of [-1, 2, 99]) {
      // eslint-disable-next-line no-await-in-loop
      await registry
        .attach(asSocket(fakeSocket('a')), { slug: 'box', tab, cols: 80, rows: 24 })
        .then(
          () => expect.fail(`tab ${tab} should be rejected`),
          (err: Error) => expect(err.message).to.match(/Tab out of range/),
        );
    }
  });

  it('reuses the session for the same identity, target and tab', async () => {
    const registry = track(
      new SessionRegistry(sh('sleep 5'), targets, conf(), noop),
    );
    const req = { slug: 'box', tab: 0, cols: 80, rows: 24 };

    const first = await registry.attach(asSocket(fakeSocket('a', 'me@x')), req);
    expect(first.created).to.equal(true);

    const second = await registry.attach(asSocket(fakeSocket('b', 'me@x')), req);
    expect(second.created).to.equal(false);
    expect(second.session).to.equal(first.session);
    expect(registry.size).to.equal(1);
  });

  // "New instance": kill the old session, spawn a clean one, tell the argv
  // factory to nuke the lingering tmux session.
  it('disposes and replaces the session on a fresh attach', async () => {
    const freshFlags: boolean[] = [];
    const argv = (_t: TerminalTarget, _tab: number, fresh: boolean): string[] => {
      freshFlags.push(fresh);
      return ['/bin/sh', '-c', 'sleep 5'];
    };
    const registry = track(new SessionRegistry(argv, targets, conf(), noop));
    const req = { slug: 'box', tab: 0, cols: 80, rows: 24 };

    const first = await registry.attach(asSocket(fakeSocket('a')), req);
    const second = await registry.attach(asSocket(fakeSocket('b')), {
      ...req,
      fresh: true,
    });

    expect(second.created, 'fresh should spawn a new session').to.equal(true);
    expect(second.session).to.not.equal(first.session);
    expect(first.session.exited, 'old session should be killed').to.equal(true);
    expect(freshFlags).to.deep.equal([false, true]);
    expect(registry.size).to.equal(1);
  });

  // One user must never land on another user's shell.
  it('isolates sessions per identity', async () => {
    const registry = track(
      new SessionRegistry(sh('sleep 5'), targets, conf(), noop),
    );
    const req = { slug: 'box', tab: 0, cols: 80, rows: 24 };
    const a = await registry.attach(asSocket(fakeSocket('a', 'alice@x')), req);
    const b = await registry.attach(asSocket(fakeSocket('b', 'bob@x')), req);

    expect(a.session).to.not.equal(b.session);
    expect(registry.size).to.equal(2);
  });

  it('gives separate tabs separate sessions', async () => {
    const registry = track(
      new SessionRegistry(sh('sleep 5'), targets, conf(), noop),
    );
    await registry.attach(asSocket(fakeSocket('a')), {
      slug: 'box', tab: 0, cols: 80, rows: 24,
    });
    await registry.attach(asSocket(fakeSocket('b')), {
      slug: 'box', tab: 1, cols: 80, rows: 24,
    });
    expect(registry.size).to.equal(2);
    expect(registry.list('local', 'box')).to.deep.equal([0, 1]);
  });

  it('enforces the global session cap', async () => {
    const registry = track(
      new SessionRegistry(sh('sleep 5'), targets, conf({ maxSessions: 1 }), noop),
    );
    await registry.attach(asSocket(fakeSocket('a', 'alice@x')), {
      slug: 'box', tab: 0, cols: 80, rows: 24,
    });
    await registry
      .attach(asSocket(fakeSocket('b', 'bob@x')), {
        slug: 'box', tab: 0, cols: 80, rows: 24,
      })
      .then(
        () => expect.fail('should have thrown'),
        (err: Error) => expect(err.message).to.match(/Too many active sessions/),
      );
  });
});

describe('Session persistence', () => {
  const live: SessionRegistry[] = [];

  afterEach(() => {
    while (live.length) live.pop()?.disposeAll('test-teardown');
  });

  /**
   * The headline requirement: run something, walk away, come back and find the
   * output that landed while nobody was attached.
   */
  it('replays output produced while no client was attached', async function () {
    this.timeout(10_000);
    const registry = new SessionRegistry(
      sh('printf "BEFORE\\r\\n"; sleep 0.5; printf "WHILE-AWAY\\r\\n"; sleep 5'),
      targets,
      conf(),
      noop,
    );
    live.push(registry);
    const req = { slug: 'box', tab: 0, cols: 80, rows: 24 };

    const sock1 = fakeSocket('sock1');
    const { session } = await registry.attach(asSocket(sock1), req);
    await sleep(200); // BEFORE has printed

    // The phone goes to sleep: socket dies, session must not.
    session.detach('sock1');
    expect(session.exited).to.equal(false);

    await sleep(600); // WHILE-AWAY prints with nobody attached

    const sock2 = fakeSocket('sock2');
    const { snapshot, created } = await registry.attach(asSocket(sock2), req);

    expect(created, 'should reattach, not respawn').to.equal(false);
    expect(snapshot).to.contain('BEFORE');
    expect(snapshot).to.contain('WHILE-AWAY');
  });

  it('keeps the pty alive across detach and does not respawn on reattach', async function () {
    this.timeout(10_000);
    const registry = new SessionRegistry(
      // A counter that only survives if the same shell keeps running.
      sh('i=0; while true; do i=$((i+1)); printf "tick$i\\r\\n"; sleep 0.15; done'),
      targets,
      conf(),
      noop,
    );
    live.push(registry);
    const req = { slug: 'box', tab: 0, cols: 80, rows: 24 };

    const { session } = await registry.attach(asSocket(fakeSocket('a')), req);
    await sleep(200);
    session.detach('a');
    await sleep(500);

    const { snapshot } = await registry.attach(asSocket(fakeSocket('b')), req);
    // A fresh shell would restart at tick1; a surviving one is well past it.
    expect(snapshot).to.match(/tick[4-9]|tick\d\d/);
    expect(registry.size).to.equal(1);
  });

  it('disposes a detached session once the grace period expires', async function () {
    this.timeout(10_000);
    const registry = new SessionRegistry(
      sh('sleep 30'),
      targets,
      conf({ graceMs: 150 }),
      noop,
    );
    live.push(registry);

    const { session } = await registry.attach(asSocket(fakeSocket('a')), {
      slug: 'box', tab: 0, cols: 80, rows: 24,
    });
    expect(registry.size).to.equal(1);

    session.detach('a');
    await sleep(500);

    expect(session.exited).to.equal(true);
    expect(registry.size).to.equal(0);
  });

  it('streams live output to attached clients', async function () {
    this.timeout(10_000);
    const registry = new SessionRegistry(sh('printf "hi\\r\\n"; sleep 5'), targets, conf(), noop);
    live.push(registry);

    const sock = fakeSocket('a');
    await registry.attach(asSocket(sock), { slug: 'box', tab: 0, cols: 80, rows: 24 });
    await sleep(300);

    const data = sock.received.filter(([ev]) => ev === 'data').map(([, d]) => d as string);
    expect(data.join('')).to.contain('hi');
  });

  it('drops the session and tells the client when the process exits', async function () {
    this.timeout(10_000);
    const registry = new SessionRegistry(sh('exit 0'), targets, conf(), noop);
    live.push(registry);

    const sock = fakeSocket('a');
    await registry.attach(asSocket(sock), { slug: 'box', tab: 0, cols: 80, rows: 24 });
    await sleep(400);

    expect(sock.received.some(([ev]) => ev === 'exit')).to.equal(true);
    expect(registry.size).to.equal(0);
  });

  // ssh dying instantly with a non-zero code is a connect failure, not a logout.
  it('reports an early non-zero exit as fatal, with the output as detail', async function () {
    this.timeout(10_000);
    const registry = new SessionRegistry(
      sh('printf "ssh: connect to host 10.0.0.1: No route to host\\r\\n" >&2; exit 255'),
      targets,
      conf(),
      noop,
    );
    live.push(registry);

    const sock = fakeSocket('a');
    await registry.attach(asSocket(sock), { slug: 'box', tab: 0, cols: 80, rows: 24 });
    await sleep(400);

    const fatal = sock.received.find(([ev]) => ev === 'fatal');
    expect(fatal, 'expected a fatal event').to.not.equal(undefined);
    expect(fatal?.[1] as string).to.contain('No route to host');
  });

  it('resizes the pty and the snapshot geometry on reattach', async function () {
    this.timeout(10_000);
    const registry = new SessionRegistry(sh('sleep 5'), targets, conf(), noop);
    live.push(registry);
    const base = { slug: 'box', tab: 0 };

    const { session } = await registry.attach(asSocket(fakeSocket('a')), {
      ...base, cols: 80, rows: 24,
    });
    expect(session.cols).to.equal(80);

    await registry.attach(asSocket(fakeSocket('b')), { ...base, cols: 40, rows: 12 });
    expect(session.cols).to.equal(40);
    expect(session.rows).to.equal(12);
  });

  it('stays silent on a bell while somebody is watching', async function () {
    this.timeout(10_000);
    const bells: string[] = [];
    const registry = new SessionRegistry(
      sh('sleep 0.2; printf "\\a"; sleep 5'),
      targets,
      conf(),
      (_identity, title) => bells.push(title),
    );
    live.push(registry);

    await registry.attach(asSocket(fakeSocket('a')), {
      slug: 'box', tab: 0, cols: 80, rows: 24,
    });
    await sleep(600);
    expect(bells, 'attached and visible: no push').to.deep.equal([]);
  });

  it('pushes when a bell rings and the only client has the page hidden', async function () {
    this.timeout(10_000);
    const bells: string[] = [];
    const registry = new SessionRegistry(
      sh('sleep 0.5; printf "\\a"; sleep 5'),
      targets,
      conf(),
      (_identity, title) => bells.push(title),
    );
    live.push(registry);

    const { session } = await registry.attach(asSocket(fakeSocket('a')), {
      slug: 'box', tab: 0, cols: 80, rows: 24,
    });
    // The socket is still up, but the phone screen is off.
    session.setVisible('a', false);
    await sleep(900);

    expect(bells).to.deep.equal(['Box']);
  });

  it('pushes a notification when a bell rings with the session detached', async function () {
    this.timeout(10_000);
    const bells: string[] = [];
    const registry = new SessionRegistry(
      sh('sleep 0.6; printf "\\a"; sleep 5'),
      targets,
      conf(),
      (_identity, title) => bells.push(title),
    );
    live.push(registry);

    const { session } = await registry.attach(asSocket(fakeSocket('a')), {
      slug: 'box', tab: 0, cols: 80, rows: 24,
    });
    session.detach('a'); // walk away before the bell
    await sleep(1000);

    expect(bells).to.deep.equal(['Box']);
  });
});
