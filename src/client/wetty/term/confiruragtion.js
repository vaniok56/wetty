import { copySelected, copyShortcut } from './confiruragtion/clipboard';
import { loadOptions } from './load';
export function configureTerm(term) {
    const options = loadOptions();
    try {
        term.options = options.xterm;
    }
    catch {
    }
    term.attachCustomKeyEventHandler(copyShortcut);
    document.addEventListener('mouseup', () => {
        if (term.hasSelection())
            copySelected(term.getSelection());
    }, false);
}
