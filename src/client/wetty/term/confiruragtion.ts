import { copySelected, copyShortcut } from './confiruragtion/clipboard';
import { loadOptions } from './load';
import type { Term } from '../term';

export function configureTerm(term: Term): void {
  const options = loadOptions();
  try {
    term.options = options.xterm;
  } catch {
    /* Do nothing */
  }

  term.attachCustomKeyEventHandler(copyShortcut);

  document.addEventListener(
    'mouseup',
    () => {
      if (term.hasSelection()) copySelected(term.getSelection());
    },
    false,
  );
}
