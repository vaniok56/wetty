import { dom } from './dom';
import type { SearchAddon } from '@xterm/addon-search';

const OPTIONS = {
  decorations: {
    matchBackground: '#3a2d00',
    activeMatchBackground: '#8ab4ff',
    matchOverviewRuler: '#e3b341',
    activeMatchColorOverviewRuler: '#8ab4ff',
  },
};

export interface SearchControl {
  toggle: () => void;
  close: () => void;
}

export function initSearch(
  search: SearchAddon,
  refocusTerminal: () => void,
): SearchControl {
  const find = (forward: boolean): void => {
    const term = dom.findInput.value;
    if (!term) return;
    if (forward) search.findNext(term, OPTIONS);
    else search.findPrevious(term, OPTIONS);
  };

  const close = (): void => {
    dom.findbar.hidden = true;
    dom.findInput.value = '';
    search.clearDecorations();
    // Hand focus back to the terminal so the keyboard drives the shell again.
    refocusTerminal();
  };

  const toggle = (): void => {
    const opening = dom.findbar.hidden;
    dom.findbar.hidden = !opening;
    if (opening) dom.findInput.focus();
    else close();
  };

  dom.findInput.addEventListener('input', () => find(true));
  dom.findInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      find(!event.shiftKey);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  dom.findbar.addEventListener('pointerdown', event => {
    const btn = (event.target as HTMLElement)?.closest<HTMLElement>('[data-action]');
    if (!btn) return;
    event.preventDefault();
    switch (btn.dataset.action) {
      case 'find-next':
        find(true);
        break;
      case 'find-prev':
        find(false);
        break;
      case 'find-close':
        close();
        break;
      default:
        break;
    }
  });

  return { toggle, close };
}
