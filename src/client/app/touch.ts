import { clampFont, MIN_FONT, MAX_FONT } from './settings';
import type { Terminal } from '@xterm/xterm';

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;
const WORD = /[A-Za-z0-9_./~:@%+-]/;
/** Finger travel per forwarded wheel notch when a mouse-tracking app scrolls. */
const WHEEL_STEP_PX = 24;
/** deltaY per synthetic wheel event; must exceed the tallest cell so xterm forwards it. */
const WHEEL_DELTA = 100;
/** The finger sits a bit below the text when holding a selection handle. */
const HANDLE_GRAB_OFFSET_PX = 20;

interface Cell {
  col: number;
  /** Absolute row in the buffer, i.e. including scrollback. */
  row: number;
}

/**
 * Cell geometry straight off `.xterm-screen`, which is exactly `cols` wide and
 * `rows` tall. Avoids reaching into xterm's private `_core._renderService`.
 */
function cellAt(term: Terminal, clientX: number, clientY: number): Cell | null {
  const screen = term.element?.querySelector('.xterm-screen') as HTMLElement | null;
  if (!screen) return null;
  const rect = screen.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const cellW = rect.width / term.cols;
  const cellH = rect.height / term.rows;
  const col = Math.floor((clientX - rect.left) / cellW);
  const row = Math.floor((clientY - rect.top) / cellH);

  return {
    col: Math.min(term.cols - 1, Math.max(0, col)),
    row:
      Math.min(term.rows - 1, Math.max(0, row)) + term.buffer.active.viewportY,
  };
}

function wordBoundsAt(
  term: Terminal,
  cell: Cell,
): { start: number; length: number } {
  const line = term.buffer.active.getLine(cell.row);
  const text = line?.translateToString(false) ?? '';
  if (!WORD.test(text[cell.col] ?? '')) return { start: cell.col, length: 1 };

  let start = cell.col;
  let end = cell.col;
  while (start > 0 && WORD.test(text[start - 1])) start -= 1;
  while (end < text.length - 1 && WORD.test(text[end + 1])) end += 1;
  return { start, length: end - start + 1 };
}

export interface TouchActions {
  onFontSize: (size: number) => void;
  onSelection: (hasSelection: boolean, x: number, y: number) => void;
  /** Raw bytes to the shell — used to drive tmux's own mouse selection. */
  send: (data: string) => void;
}

const distance = (touches: TouchList): number => {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
};

export function initTouch(
  wrap: HTMLElement,
  term: Terminal,
  actions: TouchActions,
): void {
  let pressTimer = 0;
  let startX = 0;
  let startY = 0;
  let wheelAnchorY = 0;
  let anchor: Cell | null = null;
  let selecting = false;
  let tmuxSelecting = false;
  let draggingHandle: 'start' | 'end' | null = null;

  let pinchBase = 0;
  let pinchFont = 0;
  let pinchRaf = 0;

  const cancelPress = (): void => {
    if (pressTimer) window.clearTimeout(pressTimer);
    pressTimer = 0;
  };

  const endSelect = (): void => {
    selecting = false;
    anchor = null;
    wrap.style.touchAction = '';
  };

  const beginSelect = (x: number, y: number): void => {
    const cell = cellAt(term, x, y);
    if (!cell) return;
    const { start, length } = wordBoundsAt(term, cell);
    term.select(start, cell.row, length);
    anchor = { col: start, row: cell.row };
    selecting = true;
    // Stop the viewport scrolling out from under the drag.
    wrap.style.touchAction = 'none';
    try {
      navigator.vibrate?.(15);
    } catch {
      /* unsupported */
    }
    actions.onSelection(true, x, y);
  };

  const extendSelect = (x: number, y: number): void => {
    if (!anchor) return;
    const cell = cellAt(term, x, y);
    if (!cell) return;
    const { cols } = term;
    const a = anchor.row * cols + anchor.col;
    const b = cell.row * cols + cell.col;
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    term.select(from % cols, Math.floor(from / cols), to - from + 1);
    actions.onSelection(true, x, y);
  };

  // Drive tmux's own mouse selection with SGR mouse events (button 0). This is
  // how a long-press-drag selects while mouse mode is on (where xterm's own
  // selection is disabled): tmux copies on release, emitting OSC 52 back to the
  // clipboard. btn 0 = press, 32 = drag/motion; `M` press, `m` release.
  const tmuxMouse = (btn: number, x: number, y: number, press: boolean): void => {
    const cell = cellAt(term, x, y);
    if (!cell) return;
    const col = cell.col + 1;
    const row = cell.row - term.buffer.active.viewportY + 1;
    actions.send(`\x1b[<${btn};${col};${row}${press ? 'M' : 'm'}`);
  };

  // ── selection handles ("waterdrops") ──────────────────────────────────────
  // After a long-press selects a word, two draggable handles let the selection
  // be adjusted by touch — xterm ships no such affordance. Touch devices only.
  const touchDevice =
    window.matchMedia?.('(pointer: coarse)').matches ?? 'ontouchstart' in window;

  const makeHandle = (which: 'start' | 'end'): HTMLDivElement => {
    const h = document.createElement('div');
    h.className = `sel-handle sel-handle-${which}`;
    h.hidden = true;
    wrap.appendChild(h);
    return h;
  };
  const handles = { start: makeHandle('start'), end: makeHandle('end') };

  /** Top-left pixel of a cell relative to `wrap`, plus the cell height. */
  const cellPixel = (
    col0: number,
    rowAbs: number,
  ): { x: number; y: number; h: number } | null => {
    const screen = term.element?.querySelector(
      '.xterm-screen',
    ) as HTMLElement | null;
    if (!screen) return null;
    const r = screen.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const viewRow = rowAbs - term.buffer.active.viewportY;
    return {
      x: r.left - w.left + col0 * (r.width / term.cols),
      y: r.top - w.top + viewRow * (r.height / term.rows),
      h: r.height / term.rows,
    };
  };

  const placeHandle = (h: HTMLDivElement, col0: number, rowAbs: number): void => {
    const p = cellPixel(col0, rowAbs);
    if (!p || p.y < -p.h || p.y > wrap.clientHeight) {
      h.hidden = true;
      return;
    }
    h.style.left = `${Math.round(p.x)}px`;
    h.style.top = `${Math.round(p.y + p.h)}px`;
    h.hidden = false;
  };

  const positionHandles = (): void => {
    const pos = term.getSelectionPosition();
    if (!pos) return;
    placeHandle(handles.start, pos.start.x - 1, pos.start.y);
    placeHandle(handles.end, Math.max(0, pos.end.x - 1), pos.end.y);
  };

  const refreshHandles = (): void => {
    if (!touchDevice || draggingHandle) return;
    if (!term.hasSelection() || !term.getSelectionPosition()) {
      handles.start.hidden = true;
      handles.end.hidden = true;
      return;
    }
    positionHandles();
  };

  const bindHandle = (which: 'start' | 'end'): void => {
    const h = handles[which];
    h.addEventListener(
      'touchstart',
      event => {
        const pos = term.getSelectionPosition();
        if (!pos) return;
        event.preventDefault();
        event.stopPropagation();
        cancelPress();
        draggingHandle = which;
        // Anchor on the endpoint that stays put; the dragged one follows.
        const fixed = which === 'start' ? pos.end : pos.start;
        const fixedCol = which === 'start' ? fixed.x - 2 : fixed.x - 1;
        anchor = { col: Math.max(0, fixedCol), row: fixed.y };
      },
      { passive: false },
    );
    h.addEventListener(
      'touchmove',
      event => {
        if (draggingHandle !== which) return;
        event.preventDefault();
        event.stopPropagation();
        const t = event.touches[0];
        extendSelect(t.clientX, t.clientY - HANDLE_GRAB_OFFSET_PX);
        positionHandles();
      },
      { passive: false },
    );
    const done = (event: TouchEvent): void => {
      if (draggingHandle !== which) return;
      event.stopPropagation();
      draggingHandle = null;
      anchor = null;
      refreshHandles();
    };
    h.addEventListener('touchend', done);
    h.addEventListener('touchcancel', done);
  };
  bindHandle('start');
  bindHandle('end');
  term.onSelectionChange(() => refreshHandles());
  term.onScroll(() => refreshHandles());

  wrap.addEventListener(
    'touchstart',
    event => {
      if (event.touches.length === 2) {
        cancelPress();
        endSelect();
        if (tmuxSelecting) {
          // Don't leave tmux with the button held; release before pinching.
          tmuxMouse(0, startX, startY, false);
          tmuxSelecting = false;
          wrap.style.touchAction = '';
        }
        pinchBase = distance(event.touches);
        pinchFont = term.options.fontSize ?? 14;
        event.preventDefault();
        return;
      }
      if (event.touches.length !== 1) return;

      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      wheelAnchorY = touch.clientY;
      cancelPress();
      pressTimer = window.setTimeout(() => {
        pressTimer = 0;
        if (term.modes.mouseTrackingMode !== 'none') {
          // Mouse mode owns the screen: xterm's selection is disabled, so start
          // a tmux selection instead. The drag extends it; releasing copies it.
          tmuxSelecting = true;
          wrap.style.touchAction = 'none';
          tmuxMouse(0, startX, startY, true);
          try {
            navigator.vibrate?.(15);
          } catch {
            /* unsupported */
          }
        } else {
          beginSelect(startX, startY);
        }
      }, LONG_PRESS_MS);
    },
    { passive: false },
  );

  wrap.addEventListener(
    'touchmove',
    event => {
      if (event.touches.length === 2 && pinchBase > 0) {
        event.preventDefault();
        const scale = distance(event.touches) / pinchBase;
        const next = clampFont(pinchFont * scale);
        if (next !== term.options.fontSize && !pinchRaf) {
          pinchRaf = requestAnimationFrame(() => {
            pinchRaf = 0;
            if (next >= MIN_FONT && next <= MAX_FONT) actions.onFontSize(next);
          });
        }
        return;
      }

      if (tmuxSelecting) {
        event.preventDefault();
        const t = event.touches[0];
        tmuxMouse(32, t.clientX, t.clientY, true); // 32 = drag with button 0
        return;
      }

      if (selecting) {
        event.preventDefault();
        extendSelect(event.touches[0].clientX, event.touches[0].clientY);
        return;
      }

      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const moved =
        Math.abs(touch.clientX - startX) > MOVE_TOLERANCE_PX ||
        Math.abs(touch.clientY - startY) > MOVE_TOLERANCE_PX;
      // A drag means the user wants to scroll, not to select.
      if (pressTimer && moved) cancelPress();

      // When a full-screen app (tmux with mouse on, vim, less, htop) owns the
      // screen, xterm's own viewport is empty, so a drag would scroll nothing.
      // Translate the drag into wheel notches the app understands. Plain shells
      // report no mouse tracking and keep xterm's native touch scrolling here.
      if (moved && term.modes.mouseTrackingMode !== 'none') {
        // Own the whole drag so the browser can't also deliver it to the app as
        // a click-drag selection between notches.
        event.preventDefault();
        const steps = Math.trunc((touch.clientY - wheelAnchorY) / WHEEL_STEP_PX);
        if (steps !== 0) {
          wheelAnchorY += steps * WHEEL_STEP_PX;
          // Finger down (steps > 0) reveals older output, i.e. scroll back.
          const deltaY = steps > 0 ? -WHEEL_DELTA : WHEEL_DELTA;
          const target = (event.target as HTMLElement | null) ?? wrap;
          for (let n = 0; n < Math.abs(steps); n += 1) {
            target.dispatchEvent(
              new WheelEvent('wheel', {
                deltaY,
                deltaMode: 0,
                bubbles: true,
                cancelable: true,
                clientX: touch.clientX,
                clientY: touch.clientY,
              }),
            );
          }
        }
      }
    },
    { passive: false },
  );

  const finish = (event: TouchEvent): void => {
    cancelPress();
    if (pinchBase > 0) pinchBase = 0;
    if (tmuxSelecting) {
      const t = event.changedTouches[0];
      // Releasing the button is what makes tmux copy the selection (→ OSC 52).
      if (t) tmuxMouse(0, t.clientX, t.clientY, false);
      tmuxSelecting = false;
      wrap.style.touchAction = '';
    }
    if (selecting) endSelect();
  };
  wrap.addEventListener('touchend', finish);
  wrap.addEventListener('touchcancel', finish);

  // A plain tap anywhere on the terminal should raise the keyboard. This has to
  // happen inside a real user gesture or iOS silently ignores the focus().
  wrap.addEventListener('click', event => {
    // Desktop focus is handled by xterm's own mousedown; only touch needs this
    // nudge to raise the soft keyboard. Running it on a mouse click can collapse
    // a freshly dragged selection, so gate it to touch pointers.
    const pointer = event as PointerEvent;
    const isTouch = pointer.pointerType
      ? pointer.pointerType === 'touch'
      : window.matchMedia('(pointer: coarse)').matches;
    if (!isTouch) return;
    if (term.hasSelection()) return;
    if ((event.target as HTMLElement)?.closest('.findbar')) return;
    term.focus();
  });
}
