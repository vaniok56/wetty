import { applyModifiers, ctrlByte, keySequence, ESC } from './keys';
import type { Mods } from './keys';

export type ModName = 'ctrl' | 'alt' | 'shift';
export type ModState = 'off' | 'armed' | 'locked';

/** Two taps within this window latch the modifier on. */
const LOCK_WINDOW_MS = 350;

export interface KeybarActions {
  send: (data: string) => void;
  appCursorMode: () => boolean;
  scrollToBottom: () => void;
  copy: () => void;
  paste: () => void;
  toggleSearch: () => void;
  changeFont: (delta: number) => void;
  scrollTop: () => void;
  restart: () => void;
  kill: () => void;
  /** Drop focus off the terminal so a utility tap doesn't raise the keyboard. */
  releaseKeyboard: () => void;
}

/** A finger that travels more than this between down and up was scrolling. */
const TAP_SLOP_PX = 10;
/** How long an armed destructive key waits for its confirming second tap. */
const CONFIRM_MS = 3000;

/**
 * Sticky modifiers, Termux-style:
 *   tap        -> armed (applies to the next key only)
 *   tap twice  -> locked (stays until tapped off)
 *   tap again  -> off
 */
export class Modifiers {
  private state: Record<ModName, ModState> = {
    ctrl: 'off',
    alt: 'off',
    shift: 'off',
  };

  private lastTap: Record<ModName, number> = { ctrl: 0, alt: 0, shift: 0 };

  constructor(private readonly onChange: (name: ModName, s: ModState) => void) {}

  tap(name: ModName): void {
    const now = performance.now();
    const quick = now - this.lastTap[name] < LOCK_WINDOW_MS;
    this.lastTap[name] = now;

    const current = this.state[name];
    if (current === 'locked') this.state[name] = 'off';
    else if (current === 'armed') this.state[name] = quick ? 'locked' : 'off';
    else this.state[name] = 'armed';

    this.onChange(name, this.state[name]);
  }

  active(): Mods {
    return {
      ctrl: this.state.ctrl !== 'off',
      alt: this.state.alt !== 'off',
      shift: this.state.shift !== 'off',
    };
  }

  /** One-shot modifiers fire once; locked ones persist. */
  consume(): void {
    for (const name of ['ctrl', 'alt', 'shift'] as ModName[]) {
      if (this.state[name] === 'armed') {
        this.state[name] = 'off';
        this.onChange(name, 'off');
      }
    }
  }

  clear(): void {
    for (const name of ['ctrl', 'alt', 'shift'] as ModName[]) {
      if (this.state[name] !== 'off') {
        this.state[name] = 'off';
        this.onChange(name, 'off');
      }
    }
  }
}

const buzz = (ms = 8): void => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
};

export function initKeybar(
  root: HTMLElement,
  actions: KeybarActions,
  onExpandChange: (expanded: boolean) => void,
  startExpanded: boolean,
): Modifiers {
  const paint = (name: ModName, state: ModState): void => {
    const btn = root.querySelector<HTMLElement>(`[data-mod="${name}"]`);
    btn?.setAttribute('data-state', state);
  };
  const mods = new Modifiers(paint);

  const secondary = root.querySelector<HTMLElement>('.secondary');
  const expander = root.querySelector<HTMLElement>('[data-action="expand"]');
  const setExpanded = (expanded: boolean): void => {
    if (secondary) secondary.hidden = !expanded;
    expander?.setAttribute('aria-expanded', String(expanded));
    onExpandChange(expanded);
  };
  setExpanded(startExpanded);

  // Two-tap confirmation for destructive keys: the first tap arms the button,
  // a second tap within CONFIRM_MS commits, and anything else disarms it.
  let pending: { btn: HTMLElement; label: string; timer: number } | null = null;
  const disarm = (): void => {
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pending.btn.textContent = pending.label;
    pending.btn.classList.remove('confirming');
    pending = null;
  };
  const confirmTap = (btn: HTMLElement, run: () => void): void => {
    if (pending?.btn === btn) {
      disarm();
      run();
      return;
    }
    disarm();
    const label = btn.textContent ?? '';
    btn.textContent = 'Confirm?';
    btn.classList.add('confirming');
    pending = { btn, label, timer: window.setTimeout(disarm, CONFIRM_MS) };
  };

  const fire = (btn: HTMLElement): void => {
    const { mod, key, ctrl, send, action } = btn.dataset;

    // Any tap other than the armed button's own second tap disarms it.
    if (pending && pending.btn !== btn) disarm();

    if (mod) {
      mods.tap(mod as ModName);
      buzz(12);
      return;
    }

    buzz();

    if (key) {
      const seq = keySequence(key, mods.active(), actions.appCursorMode());
      mods.consume();
      if (seq) {
        actions.send(seq);
        actions.scrollToBottom();
      }
      return;
    }

    if (ctrl) {
      // A dedicated ^C key means Ctrl regardless of what is armed; Alt still
      // composes, since ESC-prefixed control bytes are meaningful.
      const base = ctrlByte(ctrl);
      if (base) {
        const { alt } = mods.active();
        mods.consume();
        actions.send(alt ? ESC + base : base);
        actions.scrollToBottom();
      }
      return;
    }

    if (send !== undefined) {
      const out = applyModifiers(send, mods.active());
      mods.consume();
      actions.send(out);
      actions.scrollToBottom();
      return;
    }

    // Everything below is a utility button, not a keystroke. These must not keep
    // the soft keyboard up — on Android a tap on a still-focused terminal
    // re-summons it, which is exactly the "⋯ opens the keyboard" complaint.
    // Search re-focuses its own input, and New shell re-focuses on reattach, so
    // releasing here is safe for those too.
    actions.releaseKeyboard();

    switch (action) {
      case 'expand':
        setExpanded(secondary?.hidden ?? true);
        break;
      case 'copy':
        actions.copy();
        break;
      case 'paste':
        mods.clear();
        actions.paste();
        break;
      case 'search':
        actions.toggleSearch();
        break;
      case 'font-inc':
        actions.changeFont(1);
        break;
      case 'font-dec':
        actions.changeFont(-1);
        break;
      case 'scroll-top':
        actions.scrollTop();
        break;
      case 'scroll-bottom':
        actions.scrollToBottom();
        break;
      case 'restart':
        confirmTap(btn, actions.restart);
        break;
      case 'kill':
        confirmTap(btn, actions.kill);
        break;
      default:
        break;
    }
  };

  // Fire on pointer *up*, not down, and only when the finger didn't travel —
  // otherwise the second row (which scrolls horizontally) would trigger the key
  // under wherever you first touched, so you could never scroll without pressing
  // something. preventDefault on pointerdown keeps focus on xterm's helper
  // textarea (so the soft keyboard stays up); per the pointer-events spec it
  // does not block scrolling, which touch-action: pan-x governs instead.
  let active: {
    id: number;
    btn: HTMLElement;
    x: number;
    y: number;
    moved: boolean;
  } | null = null;

  root.addEventListener(
    'pointerdown',
    event => {
      const btn = (event.target as HTMLElement)?.closest<HTMLElement>('.key');
      if (!btn) return;
      event.preventDefault();
      active = {
        id: event.pointerId,
        btn,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
    },
    { passive: false },
  );

  root.addEventListener('pointermove', event => {
    if (!active || event.pointerId !== active.id) return;
    if (
      Math.abs(event.clientX - active.x) > TAP_SLOP_PX ||
      Math.abs(event.clientY - active.y) > TAP_SLOP_PX
    ) {
      active.moved = true;
    }
  });

  root.addEventListener('pointerup', event => {
    if (!active || event.pointerId !== active.id) return;
    const { btn, moved } = active;
    active = null;
    if (!moved) fire(btn);
  });

  // The browser took the gesture over as a scroll; it was never a tap.
  const cancel = (event: PointerEvent): void => {
    if (active && event.pointerId === active.id) active = null;
  };
  root.addEventListener('pointercancel', cancel);

  // Long-pressing a key would otherwise raise the text-selection menu.
  root.addEventListener('contextmenu', event => event.preventDefault());

  return mods;
}
