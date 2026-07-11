import { dom } from './dom';

/**
 * Tabs are just (identity, target, tab-index) triples on the server, so
 * switching is a fresh `attach` on the same socket. Nothing is stored here.
 */
export function initTabs(onSelect: (tab: number) => void): {
  select: (tab: number) => void;
  markLive: (tabs: number[]) => void;
} {
  const buttons = (): HTMLButtonElement[] =>
    Array.from(dom.tabs.querySelectorAll<HTMLButtonElement>('.tab'));

  const select = (tab: number): void => {
    for (const btn of buttons()) {
      btn.setAttribute('aria-selected', String(Number(btn.dataset.tab) === tab));
    }
  };

  /** Dot the tabs that already have a session behind them. */
  const markLive = (tabs: number[]): void => {
    const live = new Set(tabs);
    for (const btn of buttons()) {
      btn.dataset.live = String(live.has(Number(btn.dataset.tab)));
    }
  };

  dom.tabs.addEventListener('pointerdown', event => {
    const btn = (event.target as HTMLElement)?.closest<HTMLButtonElement>('.tab');
    if (!btn) return;
    event.preventDefault();
    const tab = Number(btn.dataset.tab);
    select(tab);
    onSelect(tab);
  });

  return { select, markLive };
}
