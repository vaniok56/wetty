import '../assets/scss/main.scss';

import {
  copySelection,
  copyText,
  pasteFromClipboard,
  toast,
} from './app/clipboard';
import { dom, pageConfig } from './app/dom';
import { initKeybar } from './app/keybar';
import { applyModifiers } from './app/keys';
import { initLifecycle } from './app/lifecycle';
import { getLastClipboardText, initOsc52 } from './app/osc52';
import { initPwa } from './app/pwa';
import { initSearch } from './app/search';
import { Session } from './app/session';
import { clampFont, loadSettings, saveSettings } from './app/settings';
import { initTabs } from './app/tabs';
import { createTerminal } from './app/term';
import { initTouch } from './app/touch';
import {
  friendlyMessage,
  hideOverlay,
  initOverlay,
  setStatus,
  showOverlay,
} from './app/ui';
import { initViewport, isKeyboardOpen } from './app/viewport';

const settings = loadSettings();
const { term, search, fit } = createTerminal(dom.terminal);

// Let the remote (tmux `set-clipboard on`, or an app's own copy) push a
// selection onto the system clipboard via OSC 52 — the piece that makes
// drag-to-select reach the clipboard even while mouse mode is on for scrolling.
// The write lands on Chrome/Firefox (desktop + Android); on iOS the text is
// stashed for the Copy button, so we only toast on a real success.
initOsc52(term, () => toast('copied'));

// Desktop copy/paste. xterm keeps its own selection model — not the browser's —
// so the OS shortcuts can't reach it unless we bridge them here. Plain Ctrl+C is
// deliberately left alone so it still sends SIGINT; only the copy *combo*
// (Cmd+C on macOS, Ctrl+Shift+C elsewhere) is intercepted, and only to copy.
term.attachCustomKeyEventHandler(event => {
  if (event.type !== 'keydown') return true;
  const k = event.key.toLowerCase();
  const combo = event.metaKey || (event.ctrlKey && event.shiftKey);
  if (k === 'c') {
    // Cmd+C / Ctrl+Shift+C always copy. Plain Ctrl+C copies only when there is a
    // selection — otherwise it must stay SIGINT. copySelection clears the
    // selection, so the next Ctrl+C goes back to interrupting.
    const plainCtrlC =
      event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey;
    if ((combo || plainCtrlC) && term.hasSelection()) {
      event.preventDefault();
      void copySelection(term);
      return false;
    }
    // Swallow the copy combo even with no selection, so it never sends meta-c.
    return !combo;
  }
  if (k === 'v' && combo) {
    event.preventDefault();
    void pasteFromClipboard(term);
    return false;
  }
  return true;
});

let lastCols = 0;
let lastRows = 0;

// The tab strip and the session each need the other. Indirecting through a
// mutable handler lets `tabs` exist first, so the Session hooks can close over
// it without a forward reference.
let selectTab: (tab: number) => void = () => undefined;
const tabs = initTabs(tab => selectTab(tab));

const session = new Session(term, pageConfig.slug, pageConfig.base, {
  onStatus: setStatus,
  onAttached: payload => {
    hideOverlay();
    tabs.select(payload.tab);
    tabs.markLive(payload.tabs);
    lastCols = payload.cols;
    lastRows = payload.rows;
    term.focus();
  },
  onFatal: reason => showOverlay(friendlyMessage(reason), reason),
  onExit: exitCode =>
    showOverlay(
      'Session ended.',
      exitCode
        ? `The shell exited with code ${exitCode}. Reconnect to start a fresh one.`
        : 'The shell exited. Reconnect to start a fresh one.',
    ),
});

selectTab = tab => {
  term.reset();
  session.attach(tab);
};

/** Fit, then tell the server, but only when the grid actually changed. */
const reflow = (): void => {
  fit();
  if (term.cols === lastCols && term.rows === lastRows) return;
  lastCols = term.cols;
  lastRows = term.rows;
  session.resize(term.cols, term.rows);
};

const setFontSize = (size: number): void => {
  const next = clampFont(size);
  if (next === term.options.fontSize) return;
  term.options.fontSize = next;
  settings.fontSize = next;
  saveSettings(settings);
  reflow();
};

const searchControl = initSearch(search, () => term.focus());

/**
 * The keybar Copy button. Prefer xterm's own selection (non-mouse-mode); else
 * copy whatever tmux last handed us via OSC 52 — done here, inside the tap, so
 * WebKit/iOS (which refuses the async OSC 52 write) copies it too.
 */
const copyNow = (): void => {
  if (term.hasSelection()) {
    void copySelection(term);
    return;
  }
  const stashed = getLastClipboardText();
  if (stashed) void copyText(stashed);
  else toast('nothing selected');
};

const mods = initKeybar(
  dom.keybar,
  {
    send: data => session.send(data),
    appCursorMode: () => term.modes.applicationCursorKeysMode,
    scrollToBottom: () => term.scrollToBottom(),
    copy: copyNow,
    paste: () => {
      void pasteFromClipboard(term);
    },
    toggleSearch: () => searchControl.toggle(),
    changeFont: delta => setFontSize((term.options.fontSize ?? 14) + delta),
    scrollTop: () => term.scrollToTop(),
    restart: () => session.restart(),
    kill: () => session.kill(),
    // A utility tap must not change the keyboard's state. If it's open, keep
    // focus so it stays open; if it's closed, blur so a still-focused textarea
    // can't have Android re-summon it. That makes ⋯ and the tools truly neutral.
    releaseKeyboard: () => {
      if (!isKeyboardOpen()) term.blur();
    },
  },
  expanded => {
    settings.keybarExpanded = expanded;
    saveSettings(settings);
    // The bar just changed height; the terminal owns the remaining space.
    requestAnimationFrame(reflow);
  },
  settings.keybarExpanded,
);

/**
 * The one place modifiers meet real input. On Android the typed character only
 * exists here — `keydown` carries keyCode 229 and key "Unidentified" — so Ctrl
 * and Alt are folded in at the data layer rather than via synthetic key events.
 */
term.onData(data => {
  const out = applyModifiers(data, mods.active());
  mods.consume();
  session.send(out);
});

term.onResize(({ cols, rows }) => {
  lastCols = cols;
  lastRows = rows;
  session.resize(cols, rows);
});

initTouch(dom.wrap, term, {
  onFontSize: setFontSize,
  onSelection: () => {
    /* selection is copied via the keybar Copy key */
  },
  // Raw bytes to the shell — lets a long-press-drag drive tmux's mouse selection.
  send: data => session.send(data),
});

initViewport(reflow);
initOverlay(() => session.retry());
initLifecycle(session);
initPwa(pageConfig.base);

// xterm measures character width via `measureText('W')`, which uses the
// WOFF2 fallback metrics if JetBrains Mono has not finished loading yet.
// That gives `Viewport._currentRowHeight` the wrong value on first paint:
// every wheel notch is computed against the fallback cell height, the
// `_handleScroll` math returns NaN, and the terminal refuses to scroll
// until a layout flush (e.g. expanding the keybar) triggers a fresh
// measurement. Wait for the document fonts to settle, then fit.
const initialFit = (): void => {
  const fonts = (document as Document & {
    fonts?: { ready?: Promise<unknown>; addEventListener?: (t: string, h: EventListener) => void };
  }).fonts;
  if (fonts?.ready && typeof fonts.ready.then === 'function') {
    fonts.ready
      .catch(() => undefined)
      .then(() => reflow());
    // Re-fit on any future font change (e.g. lazy-loaded extra weight).
    fonts.addEventListener?.('loadingdone', () => reflow());
  } else {
    reflow();
  }
};
initialFit();
term.focus();
