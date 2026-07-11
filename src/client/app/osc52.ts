import type { Terminal } from '@xterm/xterm';

/** Decode base64 to UTF-8. `atob` yields a binary string, not UTF-8 text. */
function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * The most recent text the remote asked us to put on the clipboard. On Blink
 * (Chrome) and Gecko (Firefox) we write it immediately; on WebKit (all iOS
 * browsers) the async write is refused, so we keep it here for the Copy button
 * to write from inside a real tap gesture instead.
 */
let lastText = '';
export const getLastClipboardText = (): string => lastText;

/**
 * OSC 52 lets the remote push a selection onto our clipboard. With tmux
 * `set-clipboard on`, dragging to select a pane emits it — even while mouse mode
 * is on for scrolling — so the selection reaches the system clipboard without
 * xterm's own selection (which mouse mode disables). xterm.js ignores the
 * sequence unless a handler is registered.
 *
 * Payload is `<selection>;<base64>` e.g. `c;SGVsbG8=`. A `?` payload is a read
 * request, which we decline — we never expose the clipboard to the remote.
 */
export function initOsc52(
  term: Terminal,
  onCopied?: (text: string) => void,
): void {
  term.parser.registerOscHandler(52, data => {
    const semi = data.indexOf(';');
    if (semi === -1) return false;
    const b64 = data.slice(semi + 1);
    if (!b64 || b64 === '?') return false;

    let text: string;
    try {
      text = fromBase64(b64);
    } catch {
      return false;
    }
    if (!text) return false;

    lastText = text;
    if (navigator.clipboard?.writeText) {
      // Fire-and-forget: resolves on Blink/Gecko, rejects on WebKit (no async
      // write). Either way the text is stashed above for the Copy button.
      navigator.clipboard.writeText(text).then(
        () => onCopied?.(text),
        () => undefined,
      );
    }
    return true;
  });
}
