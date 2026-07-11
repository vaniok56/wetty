import { FitAddon } from '@xterm/addon-fit';
import { ImageAddon } from '@xterm/addon-image';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { loadSettings } from './settings';

export interface TerminalHandle {
  term: Terminal;
  search: SearchAddon;
  /** Re-measure and reflow. Safe to call when the element is hidden. */
  fit: () => void;
}

const THEME = {
  background: '#05070a',
  foreground: '#c9d1d9',
  cursor: '#7ce2c3',
  cursorAccent: '#05070a',
  selectionBackground: 'rgba(138, 180, 255, 0.35)',
  black: '#0d1117',
  red: '#ff7b72',
  green: '#7ce2c3',
  yellow: '#e3b341',
  blue: '#8ab4ff',
  magenta: '#d2a8ff',
  cyan: '#76e3ea',
  white: '#c9d1d9',
  brightBlack: '#484f58',
  brightRed: '#ffa198',
  brightGreen: '#8ff0d0',
  brightYellow: '#f2cc60',
  brightBlue: '#a5c9ff',
  brightMagenta: '#e0bbff',
  brightCyan: '#9ceff5',
  brightWhite: '#f0f6fc',
};

export function createTerminal(container: HTMLElement): TerminalHandle {
  const settings = loadSettings();

  const term = new Terminal({
    allowProposedApi: true,
    scrollback: 5000,
    fontSize: settings.fontSize,
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
    theme: THEME,
    cursorBlink: true,
    scrollOnUserInput: true,
    // Without this, Alt-as-Meta shortcuts (Alt+f, Alt+b) are eaten on macOS.
    macOptionIsMeta: true,
    // In a full-screen app that captures the mouse (Claude Code, vim, htop),
    // xterm hands drags to the app and disables selection. On macOS this lets
    // Option+drag force a real selection anyway, so it can be copied. (Shift is
    // the equivalent on Windows/Linux and needs no option.)
    macOptionClickForcesSelection: true,
    // Chrome on Android reports a fractional devicePixelRatio; letting xterm
    // round the cell size keeps the grid from drifting a pixel per row.
    rescaleOverlappingGlyphs: true,
  });

  const fitAddon = new FitAddon();
  const search = new SearchAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(search);
  term.loadAddon(new WebLinksAddon());

  const unicode11 = new Unicode11Addon();
  term.loadAddon(unicode11);
  term.unicode.activeVersion = '11';

  term.open(container);

  // Renderer addons must be loaded after open(), since they need the element.
  // WebGL is a large win on mobile, but the context can be lost when the tab is
  // backgrounded — which is exactly what this app does all the time. Dispose on
  // loss and let xterm fall back to its DOM renderer rather than render nothing.
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch {
    /* no WebGL: the DOM renderer is still correct, just slower */
  }

  try {
    term.loadAddon(new ImageAddon());
  } catch {
    /* sixel support is optional */
  }

  const fit = (): void => {
    try {
      fitAddon.fit();
    } catch {
      /* zero-sized container during layout transitions */
    }
  };

  return { term, search, fit };
}
