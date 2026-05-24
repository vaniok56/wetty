export declare class FlowControlClient {
    counter: number;
    ackBytes: number;
    constructor(ackBytes?: number);
    needsCommit(length: number): boolean;
}
