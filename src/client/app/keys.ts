/**
 * Terminal key encoding.
 *
 * Everything here is deliberately DOM-free and pure, because it is the part of
 * the mobile keyboard that is hardest to test by hand and easiest to get subtly
 * wrong. Sequences follow xterm's ctlseqs and xterm.js's own Keyboard.ts.
 */

export const ESC = '\x1b';

export interface Mods {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

/** xterm's PC-style modifier parameter: 1 + shift + 2*alt + 4*ctrl + 8*meta. */
export function modParam(m: Mods): number {
  return (
    1 + (m.shift ? 1 : 0) + (m.alt ? 2 : 0) + (m.ctrl ? 4 : 0) + (m.meta ? 8 : 0)
  );
}

const hasMods = (m: Mods): boolean =>
  Boolean(m.ctrl || m.alt || m.shift || m.meta);

/** Final byte of the CSI sequence for cursor-ish keys. */
const CURSOR: Record<string, string> = {
  up: 'A',
  down: 'B',
  right: 'C',
  left: 'D',
  home: 'H',
  end: 'F',
};

/** Keys encoded as CSI <n> ~ */
const TILDE: Record<string, number> = {
  insert: 2,
  delete: 3,
  pageup: 5,
  pagedown: 6,
};

const F1_F4: Record<string, string> = { f1: 'P', f2: 'Q', f3: 'R', f4: 'S' };

/** Note the gaps: there is no 16 and no 22. */
const F5_F12: Record<string, number> = {
  f5: 15,
  f6: 17,
  f7: 18,
  f8: 19,
  f9: 20,
  f10: 21,
  f11: 23,
  f12: 24,
};

const CTRL_DIGITS: Record<string, string> = {
  '2': '\x00',
  '3': '\x1b',
  '4': '\x1c',
  '5': '\x1d',
  '6': '\x1e',
  '7': '\x1f',
  '8': '\x7f',
};

/**
 * Ctrl + character, i.e. the C0 control byte. For `@ A-Z [ \ ] ^ _` this is
 * just `code & 0x1f`; the rest are xterm conventions.
 */
export function ctrlByte(ch: string): string | undefined {
  if (ch.length !== 1) return undefined;
  const code = ch.toUpperCase().charCodeAt(0);
  // eslint-disable-next-line no-bitwise -- a C0 control byte *is* `char & 0x1f`
  if (code >= 0x40 && code <= 0x5f) return String.fromCharCode(code & 0x1f);
  if (ch === ' ') return '\x00';
  if (ch === '?') return '\x7f';
  return CTRL_DIGITS[ch];
}

/**
 * Resolve a named key against the armed modifiers.
 *
 * `appCursor` must be the terminal's current DECCKM state
 * (`term.modes.applicationCursorKeysMode`). Ignoring it breaks arrow keys
 * inside vim and less, which is the single most common bug in hand-rolled
 * on-screen keyboards.
 */
export function keySequence(
  name: string,
  mods: Mods = {},
  appCursor = false,
): string | undefined {
  const p = modParam(mods);

  const cursor = CURSOR[name];
  if (cursor) {
    if (p > 1) return `${ESC}[1;${p}${cursor}`;
    return appCursor ? `${ESC}O${cursor}` : `${ESC}[${cursor}`;
  }

  const tilde = TILDE[name];
  if (tilde !== undefined) {
    return p > 1 ? `${ESC}[${tilde};${p}~` : `${ESC}[${tilde}~`;
  }

  const low = F1_F4[name];
  if (low) return p > 1 ? `${ESC}[1;${p}${low}` : `${ESC}O${low}`;

  const high = F5_F12[name];
  if (high !== undefined) {
    return p > 1 ? `${ESC}[${high};${p}~` : `${ESC}[${high}~`;
  }

  let base: string;
  switch (name) {
    case 'escape':
      base = ESC;
      break;
    case 'enter':
      base = '\r';
      break;
    case 'backspace':
      base = mods.ctrl ? '\x08' : '\x7f';
      break;
    case 'space':
      base = mods.ctrl ? '\x00' : ' ';
      break;
    case 'tab':
      // CSI Z is "backtab". There is no ctrl variant worth sending.
      if (mods.shift) return `${ESC}[Z`;
      base = '\t';
      break;
    default:
      return undefined;
  }
  // "Meta sends escape": Alt prefixes the byte with ESC.
  return mods.alt ? ESC + base : base;
}

/**
 * Fold armed modifiers into text the terminal produced via onData.
 *
 * This is the crux of making Ctrl work on a phone. Android's soft keyboard
 * delivers characters through the IME, so `keydown` carries keyCode 229 and
 * `key: "Unidentified"` — the letter simply is not knowable at key-event time.
 * It only exists here, in the data stream, which is why modifiers are applied
 * at this layer rather than by synthesising key events.
 */
export function applyModifiers(data: string, mods: Mods): string {
  if (!hasMods(mods)) return data;

  // A physical Tab arriving while Shift is armed still means backtab.
  if (data === '\t' && mods.shift) return `${ESC}[Z`;

  // Predictive text and pastes arrive as whole words. Rewriting those would do
  // more harm than good, so let them through untouched.
  if (data.length !== 1) return data;

  let ch = data;
  if (mods.shift) ch = ch.toUpperCase();
  if (mods.ctrl) ch = ctrlByte(ch) ?? ch;
  if (mods.alt) ch = ESC + ch;
  return ch;
}
