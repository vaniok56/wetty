import { FitAddon } from '@xterm/addon-fit';
import { ImageAddon } from '@xterm/addon-image';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import _ from 'lodash';
import { terminal as termElement } from './disconnect/elements';
import { configureTerm } from './term/confiruragtion';
import { loadOptions } from './term/load';
export class Term extends Terminal {
    constructor(socket) {
        super({ allowProposedApi: true });
        this.socket = socket;
        this.fitAddon = new FitAddon();
        this.loadAddon(this.fitAddon);
        this.loadAddon(new WebLinksAddon());
        this.loadAddon(new ImageAddon());
        this.loadOptions = loadOptions;
    }
    resizeTerm() {
        this.refresh(0, this.rows - 1);
        if (this.shouldFitTerm)
            this.fitAddon.fit();
        this.socket.emit('resize', { cols: this.cols, rows: this.rows });
    }
    get shouldFitTerm() {
        var _a;
        return (_a = this.loadOptions().wettyFitTerminal) !== null && _a !== void 0 ? _a : true;
    }
}
const ctrlButton = document.getElementById('onscreen-ctrl');
let ctrlFlag = false;
const toggleCTRL = () => {
    var _a;
    ctrlFlag = !ctrlFlag;
    if (ctrlButton) {
        if (ctrlFlag) {
            ctrlButton.classList.add('active');
        }
        else {
            ctrlButton.classList.remove('active');
        }
    }
    (_a = window.wetty_term) === null || _a === void 0 ? void 0 : _a.focus();
};
const simulateBackspace = () => {
    var _a;
    (_a = window.wetty_term) === null || _a === void 0 ? void 0 : _a.input('\x7F', true);
};
const simulateCTRLAndKey = (key) => {
    var _a, _b;
    const upperKey = key.toUpperCase();
    if (upperKey === 'C') {
        (_a = window.wetty_term) === null || _a === void 0 ? void 0 : _a.input('\x03', false);
    }
    else {
        (_b = window.wetty_term) === null || _b === void 0 ? void 0 : _b.input(`${String.fromCharCode(upperKey.charCodeAt(0) - 64)}`, false);
    }
};
document.addEventListener('keyup', (e) => {
    if (ctrlFlag) {
        if (e.key.length === 1 && e.key.match(/^[a-zA-Z0-9]$/)) {
            simulateCTRLAndKey(e.key);
            _.debounce(() => {
                simulateBackspace();
            }, 100)();
        }
        toggleCTRL();
    }
});
const pressESC = () => {
    var _a, _b;
    if (ctrlFlag) {
        toggleCTRL();
    }
    (_a = window.wetty_term) === null || _a === void 0 ? void 0 : _a.input('\x1B', false);
    (_b = window.wetty_term) === null || _b === void 0 ? void 0 : _b.focus();
};
const pressUP = () => {
    var _a, _b;
    if (ctrlFlag) {
        toggleCTRL();
    }
    (_a = window.wetty_term) === null || _a === void 0 ? void 0 : _a.input('\x1B[A', false);
    (_b = window.wetty_term) === null || _b === void 0 ? void 0 : _b.focus();
};
const pressDOWN = () => {
    var _a, _b;
    if (ctrlFlag) {
        toggleCTRL();
    }
    (_a = window.wetty_term) === null || _a === void 0 ? void 0 : _a.input('\x1B[B', false);
    (_b = window.wetty_term) === null || _b === void 0 ? void 0 : _b.focus();
};
const pressTAB = () => {
    var _a, _b;
    if (ctrlFlag) {
        toggleCTRL();
    }
    (_a = window.wetty_term) === null || _a === void 0 ? void 0 : _a.input('\x09', false);
    (_b = window.wetty_term) === null || _b === void 0 ? void 0 : _b.focus();
};
const pressLEFT = () => {
    var _a, _b;
    if (ctrlFlag) {
        toggleCTRL();
    }
    (_a = window.wetty_term) === null || _a === void 0 ? void 0 : _a.input('\x1B[D', false);
    (_b = window.wetty_term) === null || _b === void 0 ? void 0 : _b.focus();
};
const pressRIGHT = () => {
    var _a, _b;
    if (ctrlFlag) {
        toggleCTRL();
    }
    (_a = window.wetty_term) === null || _a === void 0 ? void 0 : _a.input('\x1B[C', false);
    (_b = window.wetty_term) === null || _b === void 0 ? void 0 : _b.focus();
};
const pressENTER = () => {
    var _a, _b;
    if (ctrlFlag) {
        toggleCTRL();
    }
    (_a = window.wetty_term) === null || _a === void 0 ? void 0 : _a.input('\x0D', false);
    (_b = window.wetty_term) === null || _b === void 0 ? void 0 : _b.focus();
};
const pressALT = () => {
    var _a, _b;
    if (ctrlFlag) {
        toggleCTRL();
    }
    (_a = window.wetty_term) === null || _a === void 0 ? void 0 : _a.input('\x1B', false);
    (_b = window.wetty_term) === null || _b === void 0 ? void 0 : _b.focus();
};
const toggleFunctions = () => {
    const element = document.querySelector('div#functions > div.onscreen-buttons');
    if (element === null || element === void 0 ? void 0 : element.classList.contains('active')) {
        element === null || element === void 0 ? void 0 : element.classList.remove('active');
    }
    else {
        element === null || element === void 0 ? void 0 : element.classList.add('active');
    }
};
export function terminal(socket) {
    const term = new Term(socket);
    if (_.isNull(termElement))
        return undefined;
    termElement.innerHTML = '';
    term.open(termElement);
    term.options.scrollback = 1000;
    term.options.scrollOnUserInput = true;
    term._core.options.scrollback = 1000;
    term._core.optionsService.options.scrollback = 1000;
    configureTerm(term);
    window.onresize = function onResize() {
        term.resizeTerm();
    };
    window.wetty_term = term;
    window.toggleFunctions = toggleFunctions;
    window.toggleCTRL = toggleCTRL;
    window.pressESC = pressESC;
    window.pressUP = pressUP;
    window.pressDOWN = pressDOWN;
    window.pressTAB = pressTAB;
    window.pressLEFT = pressLEFT;
    window.pressRIGHT = pressRIGHT;
    window.pressENTER = pressENTER;
    window.pressALT = pressALT;
    return term;
}
