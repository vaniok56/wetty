/**
 * Keep the app exactly as tall as the visible area, and pinned to its top.
 *
 * Two independent mechanisms are at work, and both are needed:
 *
 *  - `interactive-widget=resizes-content` (in the viewport meta) makes Chrome
 *    and Firefox on Android shrink the layout viewport when the keyboard opens.
 *    That alone would be enough there.
 *  - WebKit ignores that key entirely. On iOS the layout viewport keeps its
 *    full height, the *visual* viewport shrinks, and the page gets panned up to
 *    reveal the focused element. So we read visualViewport directly and undo
 *    the pan.
 *
 * The old build did neither, and instead marked `.xterm-screen`
 * contenteditable — which made the browser scroll that tall element into view
 * and drag the whole page up past the top bar.
 */
export function initViewport(onResize: () => void): void {
  const root = document.documentElement;
  const vv = window.visualViewport;
  let pending = 0;

  const sync = (): void => {
    const height = vv?.height ?? window.innerHeight;
    const top = vv?.offsetTop ?? 0;
    root.style.setProperty('--app-height', `${Math.round(height)}px`);
    root.style.setProperty('--app-top', `${Math.round(top)}px`);

    // iOS scrolls the document to reveal the focused element. Put it back.
    if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);

    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      pending = 0;
      onResize();
    });
  };

  vv?.addEventListener('resize', sync);
  vv?.addEventListener('scroll', sync);
  window.addEventListener('resize', sync);
  // Orientation changes report the old size for a frame or two.
  window.addEventListener('orientationchange', () => {
    setTimeout(sync, 150);
  });
  // iOS 26 leaves a residual offsetTop behind after the keyboard dismisses;
  // focusout is the only reliable signal that it is going away.
  window.addEventListener('focusout', () => setTimeout(sync, 50));

  sync();
}
