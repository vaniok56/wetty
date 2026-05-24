import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import type { Options } from './term/options';
import type { Socket } from 'socket.io-client';
export declare class Term extends Terminal {
    socket: Socket;
    fitAddon: FitAddon;
    loadOptions: () => Options;
    constructor(socket: Socket);
    resizeTerm(): void;
    get shouldFitTerm(): boolean;
}
declare global {
    interface Window {
        wetty_term?: Term;
        clipboardData: DataTransfer;
        loadOptions: (conf: Options) => void;
        toggleFunctions?: () => void;
        toggleCTRL?: () => void;
        pressESC?: () => void;
        pressUP?: () => void;
        pressDOWN?: () => void;
        pressTAB?: () => void;
        pressLEFT?: () => void;
        pressRIGHT?: () => void;
        pressENTER?: () => void;
        pressALT?: () => void;
    }
}
export declare function terminal(socket: Socket): Term | undefined;
