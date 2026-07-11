import 'mocha';
import { expect } from 'chai';

import { applyModifiers, ctrlByte, keySequence, modParam } from './keys';

describe('modParam', () => {
  // 1 + shift + 2*alt + 4*ctrl + 8*meta
  it('encodes the xterm modifier table', () => {
    expect(modParam({})).to.equal(1);
    expect(modParam({ shift: true })).to.equal(2);
    expect(modParam({ alt: true })).to.equal(3);
    expect(modParam({ shift: true, alt: true })).to.equal(4);
    expect(modParam({ ctrl: true })).to.equal(5);
    expect(modParam({ ctrl: true, shift: true })).to.equal(6);
    expect(modParam({ ctrl: true, alt: true })).to.equal(7);
    expect(modParam({ ctrl: true, alt: true, shift: true })).to.equal(8);
    expect(modParam({ meta: true })).to.equal(9);
  });
});

describe('ctrlByte', () => {
  it('maps letters to C0 controls', () => {
    expect(ctrlByte('c')).to.equal('\x03');
    expect(ctrlByte('C')).to.equal('\x03');
    expect(ctrlByte('a')).to.equal('\x01');
    expect(ctrlByte('z')).to.equal('\x1a');
    expect(ctrlByte('d')).to.equal('\x04');
    expect(ctrlByte('l')).to.equal('\x0c');
  });

  it('maps the punctuation controls', () => {
    expect(ctrlByte('@')).to.equal('\x00');
    expect(ctrlByte('[')).to.equal('\x1b');
    expect(ctrlByte('\\')).to.equal('\x1c');
    expect(ctrlByte(']')).to.equal('\x1d');
    expect(ctrlByte('^')).to.equal('\x1e');
    expect(ctrlByte('_')).to.equal('\x1f');
    expect(ctrlByte(' ')).to.equal('\x00');
    expect(ctrlByte('?')).to.equal('\x7f');
  });

  it('maps the digit controls xterm defines', () => {
    expect(ctrlByte('2')).to.equal('\x00');
    expect(ctrlByte('3')).to.equal('\x1b');
    expect(ctrlByte('8')).to.equal('\x7f');
  });

  // The old implementation did `charCodeAt(0) - 64` for any alphanumeric, so
  // Ctrl+0 produced String.fromCharCode(-16) — a garbage codepoint.
  it('returns undefined rather than garbage for digits with no mapping', () => {
    expect(ctrlByte('0')).to.equal(undefined);
    expect(ctrlByte('1')).to.equal(undefined);
    expect(ctrlByte('9')).to.equal(undefined);
  });

  it('returns undefined for multi-character input', () => {
    expect(ctrlByte('ab')).to.equal(undefined);
    expect(ctrlByte('')).to.equal(undefined);
  });
});

describe('keySequence: cursor keys', () => {
  it('uses CSI form in normal cursor mode', () => {
    expect(keySequence('up')).to.equal('\x1b[A');
    expect(keySequence('down')).to.equal('\x1b[B');
    expect(keySequence('right')).to.equal('\x1b[C');
    expect(keySequence('left')).to.equal('\x1b[D');
    expect(keySequence('home')).to.equal('\x1b[H');
    expect(keySequence('end')).to.equal('\x1b[F');
  });

  // DECCKM. Getting this wrong breaks arrows inside vim and less.
  it('uses SS3 form in application cursor mode', () => {
    expect(keySequence('up', {}, true)).to.equal('\x1bOA');
    expect(keySequence('down', {}, true)).to.equal('\x1bOB');
    expect(keySequence('right', {}, true)).to.equal('\x1bOC');
    expect(keySequence('left', {}, true)).to.equal('\x1bOD');
  });

  it('always uses CSI form once modified, even in application mode', () => {
    expect(keySequence('up', { ctrl: true }, true)).to.equal('\x1b[1;5A');
    expect(keySequence('up', { ctrl: true }, false)).to.equal('\x1b[1;5A');
  });

  it('encodes modifiers into the parameter', () => {
    expect(keySequence('up', { ctrl: true })).to.equal('\x1b[1;5A');
    expect(keySequence('right', { ctrl: true })).to.equal('\x1b[1;5C');
    expect(keySequence('left', { ctrl: true })).to.equal('\x1b[1;5D');
    expect(keySequence('up', { shift: true })).to.equal('\x1b[1;2A');
    expect(keySequence('left', { shift: true })).to.equal('\x1b[1;2D');
    expect(keySequence('up', { alt: true })).to.equal('\x1b[1;3A');
    expect(keySequence('right', { alt: true })).to.equal('\x1b[1;3C');
    expect(keySequence('home', { ctrl: true })).to.equal('\x1b[1;5H');
    expect(keySequence('end', { ctrl: true })).to.equal('\x1b[1;5F');
  });
});

describe('keySequence: tilde keys', () => {
  it('encodes insert, delete, page up and page down', () => {
    expect(keySequence('insert')).to.equal('\x1b[2~');
    expect(keySequence('delete')).to.equal('\x1b[3~');
    expect(keySequence('pageup')).to.equal('\x1b[5~');
    expect(keySequence('pagedown')).to.equal('\x1b[6~');
  });

  it('appends the modifier parameter', () => {
    expect(keySequence('delete', { ctrl: true })).to.equal('\x1b[3;5~');
    expect(keySequence('pageup', { ctrl: true })).to.equal('\x1b[5;5~');
    expect(keySequence('pagedown', { shift: true })).to.equal('\x1b[6;2~');
  });
});

describe('keySequence: function keys', () => {
  it('uses SS3 for F1-F4 and CSI for F5-F12', () => {
    expect(keySequence('f1')).to.equal('\x1bOP');
    expect(keySequence('f2')).to.equal('\x1bOQ');
    expect(keySequence('f3')).to.equal('\x1bOR');
    expect(keySequence('f4')).to.equal('\x1bOS');
    expect(keySequence('f5')).to.equal('\x1b[15~');
    expect(keySequence('f6')).to.equal('\x1b[17~');
    expect(keySequence('f12')).to.equal('\x1b[24~');
  });

  // The numbering skips 16 and 22; a naive 14+n would be wrong from F6 on.
  it('respects the gaps in the function-key numbering', () => {
    expect(keySequence('f5')).to.not.equal('\x1b[16~');
    expect(keySequence('f11')).to.equal('\x1b[23~');
    expect(keySequence('f10')).to.equal('\x1b[21~');
  });

  it('modifies F1-F4 into CSI form', () => {
    expect(keySequence('f1', { shift: true })).to.equal('\x1b[1;2P');
    expect(keySequence('f5', { shift: true })).to.equal('\x1b[15;2~');
  });
});

describe('keySequence: named keys', () => {
  it('encodes tab and backtab', () => {
    expect(keySequence('tab')).to.equal('\t');
    // The whole reason Shift exists on the bar.
    expect(keySequence('tab', { shift: true })).to.equal('\x1b[Z');
  });

  it('encodes escape, enter, backspace and space', () => {
    expect(keySequence('escape')).to.equal('\x1b');
    expect(keySequence('enter')).to.equal('\r');
    expect(keySequence('backspace')).to.equal('\x7f');
    expect(keySequence('backspace', { ctrl: true })).to.equal('\x08');
    expect(keySequence('space')).to.equal(' ');
    expect(keySequence('space', { ctrl: true })).to.equal('\x00');
  });

  it('prefixes ESC for alt, since meta sends escape', () => {
    expect(keySequence('enter', { alt: true })).to.equal('\x1b\r');
    expect(keySequence('escape', { alt: true })).to.equal('\x1b\x1b');
  });

  it('returns undefined for unknown key names', () => {
    expect(keySequence('nope')).to.equal(undefined);
  });
});

describe('applyModifiers', () => {
  it('passes data through untouched when nothing is armed', () => {
    expect(applyModifiers('c', {})).to.equal('c');
    expect(applyModifiers('hello', {})).to.equal('hello');
  });

  // This is the case that was impossible on a phone before: the letter only
  // exists in the data stream, never in a key event.
  it('turns an armed Ctrl plus a typed letter into a control byte', () => {
    expect(applyModifiers('c', { ctrl: true })).to.equal('\x03');
    expect(applyModifiers('d', { ctrl: true })).to.equal('\x04');
    expect(applyModifiers('z', { ctrl: true })).to.equal('\x1a');
  });

  it('prefixes ESC for an armed Alt', () => {
    expect(applyModifiers('f', { alt: true })).to.equal('\x1bf');
    expect(applyModifiers('b', { alt: true })).to.equal('\x1bb');
    expect(applyModifiers('.', { alt: true })).to.equal('\x1b.');
  });

  it('combines Ctrl and Alt as ESC + control byte', () => {
    expect(applyModifiers('c', { ctrl: true, alt: true })).to.equal('\x1b\x03');
  });

  it('uppercases for an armed Shift', () => {
    expect(applyModifiers('a', { shift: true })).to.equal('A');
  });

  it('turns an armed Shift plus Tab into backtab', () => {
    expect(applyModifiers('\t', { shift: true })).to.equal('\x1b[Z');
  });

  it('leaves a control byte alone when Ctrl cannot apply', () => {
    expect(applyModifiers('\r', { ctrl: true })).to.equal('\r');
  });

  // Gboard emits whole words for predictive text; rewriting them would corrupt.
  it('does not rewrite multi-character input', () => {
    expect(applyModifiers('hello', { ctrl: true })).to.equal('hello');
    expect(applyModifiers('hello', { shift: true })).to.equal('hello');
  });
});
