/* eslint-disable max-classes-per-file -- Session, SessionRegistry and
   SessionError are one cohesive unit; splitting them buys nothing. */
import serializeAddon from '@xterm/addon-serialize';
import headless from '@xterm/headless';
import pty from 'node-pty';
import { logger as getLogger } from '../shared/logger.js';
import { FlowControlServer, tinybuffer } from './flowcontrol.js';
import { ptyOptions } from './shared/xterm.js';
import type { TerminalTarget } from './targets.js';
import type { SessionConf } from '../shared/interfaces.js';
import type { Socket } from 'socket.io';

// Both packages are CommonJS and ship no `exports` map, so Node cannot detect
// their named exports from an ES module. Default-import the namespace instead.
const { Terminal } = headless;
const { SerializeAddon } = serializeAddon;

type HeadlessTerminal = InstanceType<typeof Terminal>;

/** A connect failure usually shows up as ssh dying almost immediately. */
const CONNECT_FAILURE_WINDOW_MS = 15_000;
/** Terminals ring the bell far more often than a human wants to be buzzed. */
const BELL_THROTTLE_MS = 30_000;
const EARLY_OUTPUT_LIMIT = 4096;

export interface AttachRequest {
  slug: string;
  tab: number;
  cols: number;
  rows: number;
  /** Kill any existing session for this key and start a clean one. */
  fresh?: boolean;
}

export interface Notifier {
  (identity: string, title: string, body: string): void;
}

/** Injected so sessions can be exercised without a real SSH host. */
export interface ArgvFactory {
  (target: TerminalTarget, tab: number, fresh: boolean): string[];
}

interface Client {
  socket: Socket;
  /** Per-client, because a slow phone must not stall a fast laptop. */
  fc: FlowControlServer;
  send: (data: string) => void;
  visible: boolean;
}

export class SessionError extends Error {}

/**
 * NUL separator: a slug matches ^[a-z0-9-]+$ and an email address cannot
 * contain a NUL, so no identity can forge a key belonging to another user.
 */
const keyFor = (identity: string, slug: string, tab: number): string =>
  [identity, slug, tab].join('\u0000');

/**
 * One PTY, one server-side terminal emulator, any number of attached sockets.
 *
 * The emulator is the point: replaying the raw byte stream into a fresh xterm
 * is wrong (it may have switched to the alternate screen, or positioned the
 * cursor against scrollback we have since dropped). Instead we keep a
 * canonical terminal here, and hand reattaching clients a self-consistent
 * snapshot of its current state. This is how VS Code's pty host works.
 */
export class Session {
  readonly createdAt = Date.now();
  cols: number;
  rows: number;
  exited = false;
  exitCode = 0;

  private readonly term: HeadlessTerminal;
  private readonly serializer: InstanceType<typeof SerializeAddon>;
  private readonly proc: pty.IPty;
  private readonly clients = new Map<string, Client>();
  /** Clients whose ack backlog is over the high-water mark. */
  private readonly starved = new Set<string>();
  private graceTimer?: NodeJS.Timeout;
  private lastBellAt = 0;
  private earlyOutput = '';

  constructor(
    readonly key: string,
    readonly identity: string,
    readonly target: TerminalTarget,
    readonly tab: number,
    private readonly conf: SessionConf,
    argv: string[],
    private readonly notify: Notifier,
    private readonly onDispose: (session: Session) => void,
  ) {
    this.cols = 80;
    this.rows = 24;

    this.term = new Terminal({
      cols: this.cols,
      rows: this.rows,
      scrollback: conf.scrollback,
      allowProposedApi: true,
    });
    this.serializer = new SerializeAddon();
    this.term.loadAddon(this.serializer);
    this.term.onBell(() => this.handleBell());

    getLogger().info('Spawning session', {
      key,
      slug: target.slug,
      tab,
      identity,
    });
    this.proc = pty.spawn(argv[0], argv.slice(1), {
      ...ptyOptions,
      cols: this.cols,
      rows: this.rows,
    });

    this.proc.onData(data => this.handleData(data));
    this.proc.onExit(({ exitCode }) => this.handleExit(exitCode));
  }

  get attachedCount(): number {
    return this.clients.size;
  }

  private handleData(data: string): void {
    this.term.write(data);

    if (this.earlyOutput.length < EARLY_OUTPUT_LIMIT) {
      this.earlyOutput += data;
    }

    for (const client of this.clients.values()) {
      client.send(data);
      if (client.fc.account(data.length)) this.starved.add(client.socket.id);
    }
    // With nobody attached there is no socket to back up, and the headless
    // terminal consumes synchronously — so never pause in that case.
    if (this.starved.size > 0) this.proc.pause();
  }

  private handleExit(exitCode: number): void {
    this.exited = true;
    this.exitCode = exitCode;

    const quick = Date.now() - this.createdAt < CONNECT_FAILURE_WINDOW_MS;
    const failedToConnect = quick && exitCode !== 0;

    getLogger().info('Session process exited', {
      key: this.key,
      exitCode,
      failedToConnect,
      durationMs: Date.now() - this.createdAt,
    });

    for (const client of this.clients.values()) {
      if (failedToConnect) {
        client.socket.emit('fatal', this.earlyOutput.trim() || 'ssh exited');
      } else {
        client.socket.emit('exit', { exitCode });
      }
    }
    this.dispose('process-exit');
  }

  private handleBell(): void {
    // Somebody is looking at the screen; they don't need a push notification.
    const watched = [...this.clients.values()].some(c => c.visible);
    if (watched) return;

    const now = Date.now();
    if (now - this.lastBellAt < BELL_THROTTLE_MS) return;
    this.lastBellAt = now;

    this.notify(
      this.identity,
      this.target.name,
      'Your terminal is asking for attention.',
    );
  }

  /** Flush the parser, then serialize. Writes are queued, not immediate. */
  private flush(): Promise<void> {
    return new Promise(resolve => {
      this.term.write('', () => resolve());
    });
  }

  async snapshot(): Promise<string> {
    await this.flush();
    return this.serializer.serialize({
      scrollback: this.conf.snapshotScrollback,
    });
  }

  /**
   * Last attach wins, matching tmux's `window-size latest`. Resizing before we
   * snapshot means the snapshot already matches the geometry the client is
   * about to render into; the remote app's own SIGWINCH repaint lands after.
   */
  resize(cols: number, rows: number): void {
    if (!cols || !rows) return;
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.term.resize(cols, rows);
    if (this.exited) return;
    try {
      this.proc.resize(cols, rows);
    } catch (err) {
      getLogger().debug('resize on dead pty', { key: this.key, err });
    }
  }

  write(input: string): void {
    if (!this.exited) this.proc.write(input);
  }

  async attach(socket: Socket, cols: number, rows: number): Promise<string> {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = undefined;
    }
    this.resize(cols, rows);

    // Snapshot *before* registering the client, and register with no await in
    // between. Otherwise output arriving mid-serialize is both baked into the
    // snapshot and streamed to the socket, and the client renders it twice.
    // Node is single-threaded, so "no await" really does mean atomic here.
    const snapshot = await this.snapshot();
    this.clients.set(socket.id, {
      socket,
      fc: new FlowControlServer(),
      send: tinybuffer(socket, 2, 524288),
      visible: true,
    });
    return snapshot;
  }

  detach(socketId: string): void {
    if (!this.clients.delete(socketId)) return;
    this.relieve(socketId);

    if (this.clients.size === 0 && !this.exited) {
      getLogger().info('Session detached, holding', {
        key: this.key,
        graceMs: this.conf.graceMs,
      });
      this.graceTimer = setTimeout(
        () => this.dispose('grace-expired'),
        this.conf.graceMs,
      );
    }
  }

  /** A client acknowledged `size` bytes; it may no longer be the bottleneck. */
  commit(socketId: string, size: number): void {
    const client = this.clients.get(socketId);
    if (!client) return;
    if (client.fc.commit(size)) this.relieve(socketId);
  }

  private relieve(socketId: string): void {
    if (!this.starved.delete(socketId)) return;
    if (this.starved.size === 0 && !this.exited) this.proc.resume();
  }

  setVisible(socketId: string, visible: boolean): void {
    const client = this.clients.get(socketId);
    if (client) client.visible = visible;
  }

  dispose(reason: string): void {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = undefined;
    }
    getLogger().info('Disposing session', { key: this.key, reason });
    if (!this.exited) {
      this.exited = true;
      try {
        this.proc.kill();
      } catch {
        /* already gone */
      }
    }
    this.clients.clear();
    this.starved.clear();
    this.term.dispose();
    this.onDispose(this);
  }
}

/**
 * Sessions are keyed by (who, which host, which tab) rather than by socket id
 * or an opaque token. That means a reconnecting browser finds its session
 * again without holding any state, and one user can never land on another's
 * shell.
 */
export class SessionRegistry {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly buildArgv: ArgvFactory,
    private readonly targets: Record<string, TerminalTarget>,
    private readonly conf: SessionConf,
    private readonly notify: Notifier,
  ) {}

  get size(): number {
    return this.sessions.size;
  }

  static identify(socket: Socket): string {
    const header = socket.request.headers['cf-access-authenticated-user-email'];
    const email = Array.isArray(header) ? header[0] : header;
    return email?.trim() || 'local';
  }


  async attach(
    socket: Socket,
    req: AttachRequest,
  ): Promise<{ session: Session; snapshot: string; created: boolean }> {
    const target = this.targets[req.slug];
    if (!target) throw new SessionError(`Unknown target: ${req.slug}`);

    const tab = Number(req.tab);
    if (!Number.isInteger(tab) || tab < 0 || tab >= this.conf.maxTabs) {
      throw new SessionError(`Tab out of range: ${req.tab}`);
    }

    const cols = clampDim(req.cols, 80);
    const rows = clampDim(req.rows, 24);
    const identity = SessionRegistry.identify(socket);
    const key = keyFor(identity, target.slug, tab);

    const existing = this.sessions.get(key);
    if (existing && !existing.exited) {
      // "New instance": drop the old session and fall through to spawn a fresh
      // one whose remote command also kills the lingering tmux session.
      if (req.fresh) {
        existing.dispose('user-restart');
      } else {
        const snapshot = await existing.attach(socket, cols, rows);
        return { session: existing, snapshot, created: false };
      }
    }

    if (this.sessions.size >= this.conf.maxSessions) {
      throw new SessionError('Too many active sessions on this server');
    }

    const session = new Session(
      key,
      identity,
      target,
      tab,
      this.conf,
      this.buildArgv(target, tab, Boolean(req.fresh)),
      this.notify,
      disposed => {
        // Guard against a stale dispose evicting a session that replaced it.
        if (this.sessions.get(disposed.key) === disposed) {
          this.sessions.delete(disposed.key);
        }
      },
    );
    this.sessions.set(key, session);
    const snapshot = await session.attach(socket, cols, rows);
    return { session, snapshot, created: true };
  }

  /** Sessions belonging to `identity`, for the tab strip. */
  list(identity: string, slug: string): number[] {
    return [...this.sessions.values()]
      .filter(s => s.identity === identity && s.target.slug === slug)
      .map(s => s.tab)
      .sort((a, b) => a - b);
  }

  disposeAll(reason: string): void {
    for (const session of [...this.sessions.values()]) session.dispose(reason);
  }
}

function clampDim(value: number, fallback: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 1000);
}
