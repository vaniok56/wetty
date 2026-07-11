import io from 'socket.io-client';
import { FileDownloader } from './download';
import { FlowControlClient } from './flowcontrol';
import type { Terminal } from '@xterm/xterm';
import type { Socket } from 'socket.io-client';

export type Status = 'connecting' | 'live' | 'reconnecting' | 'ended' | 'error';

export interface AttachedPayload {
  slug: string;
  tab: number;
  cols: number;
  rows: number;
  snapshot: string;
  created: boolean;
  tabs: number[];
}

export interface SessionHooks {
  onStatus: (status: Status) => void;
  onAttached: (payload: AttachedPayload) => void;
  onFatal: (reason: string) => void;
  onExit: (exitCode: number) => void;
}

const trim = (str: string): string => str.replace(/\/*$/, '');

export class Session {
  readonly socket: Socket;
  tab = 0;

  private readonly fc = new FlowControlClient();
  private readonly downloader = new FileDownloader();
  /**
   * Output emitted between the server taking our snapshot and us processing the
   * `attached` event. It is newer than the snapshot, so it must be written
   * after it — never before, or `term.reset()` would wipe it.
   */
  private pending: string[] = [];
  private attaching = false;
  private everAttached = false;

  constructor(
    private readonly term: Terminal,
    private readonly slug: string,
    base: string,
    private readonly hooks: SessionHooks,
  ) {
    this.socket = io(window.location.origin, {
      path: `${trim(base)}/socket.io`,
      reconnection: true,
      reconnectionDelay: 300,
      reconnectionDelayMax: 4000,
      // The phone will drop this socket every time it backgrounds. Keep trying.
      reconnectionAttempts: Infinity,
      timeout: 12_000,
    });

    this.socket.on('connect', () => this.attach(this.tab));
    this.socket.on('attached', (payload: AttachedPayload) =>
      this.handleAttached(payload),
    );
    this.socket.on('data', (data: string) => this.handleData(data));
    this.socket.on('fatal', (reason: string) => {
      this.hooks.onStatus('error');
      this.hooks.onFatal(reason);
    });
    this.socket.on('exit', ({ exitCode }: { exitCode: number }) => {
      this.hooks.onStatus('ended');
      this.hooks.onExit(exitCode);
    });
    this.socket.on('disconnect', () => {
      // Not an error. Backgrounding the tab causes exactly this, and the
      // session is still alive on the server.
      this.hooks.onStatus(this.everAttached ? 'reconnecting' : 'connecting');
    });
  }

  attach(tab: number, opts: { fresh?: boolean } = {}): void {
    this.tab = tab;
    this.attaching = true;
    this.pending = [];
    this.hooks.onStatus(this.everAttached ? 'reconnecting' : 'connecting');
    this.socket.emit('attach', {
      slug: this.slug,
      tab,
      cols: this.term.cols,
      rows: this.term.rows,
      fresh: Boolean(opts.fresh),
    });
  }

  /**
   * Throw away the current session on this tab and start a clean one. The server
   * kills the underlying tmux session, so anything running in it stops; a
   * brand-new empty shell takes its place.
   */
  restart(): void {
    this.term.reset();
    this.attach(this.tab, { fresh: true });
  }

  private handleAttached(payload: AttachedPayload): void {
    if (payload.tab !== this.tab) return;

    // Rebuild from the server's canonical view rather than trusting whatever
    // this terminal happens to be showing.
    this.term.reset();
    this.term.write(payload.snapshot, () => {
      for (const chunk of this.pending) this.term.write(chunk);
      this.pending = [];
      this.attaching = false;
      this.term.scrollToBottom();
    });

    this.everAttached = true;
    this.hooks.onStatus('live');
    this.hooks.onAttached(payload);
  }

  private handleData(data: string): void {
    const remaining = this.downloader.buffer(data);
    const consumed = data.length - remaining.length;
    if (consumed && this.fc.needsCommit(consumed)) {
      this.socket.emit('commit', this.fc.ackBytes);
    }
    if (!remaining) return;

    if (this.attaching) {
      this.pending.push(remaining);
      return;
    }
    if (this.fc.needsCommit(remaining.length)) {
      this.term.write(remaining, () =>
        this.socket.emit('commit', this.fc.ackBytes),
      );
    } else {
      this.term.write(remaining);
    }
  }

  send(data: string): void {
    if (data) this.socket.emit('input', data);
  }

  resize(cols: number, rows: number): void {
    this.socket.emit('resize', { cols, rows });
  }

  /** Tells the server whether anyone is actually looking, for push decisions. */
  setVisible(visible: boolean): void {
    if (this.socket.connected) this.socket.emit('visibility', visible);
  }

  kill(): void {
    this.socket.emit('kill');
  }

  reconnect(): void {
    if (!this.socket.connected) this.socket.connect();
  }

  /**
   * Recover from the error overlay. When the socket is still up — which it is
   * after the shell exits, since only the pty died — the old session is already
   * gone from the server, so a plain re-attach spawns a clean one. When the
   * socket is down instead, reconnecting re-attaches on its own and keeps any
   * still-alive session. (Plain `reconnect()` is a no-op while connected, which
   * is why the retry button did nothing after an exit.)
   */
  retry(): void {
    if (this.socket.connected) this.attach(this.tab);
    else this.socket.connect();
  }
}
