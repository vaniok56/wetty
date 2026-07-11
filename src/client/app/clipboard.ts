import Toastify from 'toastify-js';
import type { Terminal } from '@xterm/xterm';

export const toast = (text: string): void => {
  Toastify({
    text,
    duration: 2000,
    gravity: 'bottom',
    position: 'center',
    backgroundColor: '#161b22',
    stopOnFocus: true,
  }).showToast();
};

/** execCommand is deprecated but is the fallback when the async API is refused
 *  (WebKit) or unavailable (non-secure origin). iOS needs an explicit range +
 *  setSelectionRange — a plain `.select()` copies nothing there. */
function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.contentEditable = 'true';
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  try {
    const range = document.createRange();
    range.selectNodeContents(textarea);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    textarea.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

/** Write arbitrary text to the clipboard. Call from inside a user gesture (a
 *  tap/click) so WebKit/iOS allows it — this is the Copy button's path for a
 *  tmux selection that OSC 52 stashed but couldn't write asynchronously. */
export async function copyText(text: string): Promise<boolean> {
  if (!text) {
    toast('nothing selected');
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('copied');
    return true;
  } catch {
    const ok = legacyCopy(text);
    toast(ok ? 'copied' : 'copy failed');
    return ok;
  }
}

export async function copySelection(term: Terminal): Promise<void> {
  const text = term.getSelection();
  if (!text) {
    toast('nothing selected');
    return;
  }
  await copyText(text);
  term.clearSelection();
}

/**
 * Reading the clipboard needs a user gesture and, on Chrome, a permission
 * prompt. Both are satisfied by this being called straight from pointerdown.
 */
export async function pasteFromClipboard(term: Terminal): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    if (text) term.paste(text);
  } catch {
    toast('clipboard blocked — long-press the terminal instead');
  }
}
