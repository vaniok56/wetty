type OnCompleteFile = (bufferCharacters: string) => void;
export declare class FileDownloader {
    fileBuffer: string[];
    fileBegin: string;
    fileEnd: string;
    partialFileBegin: string;
    onCompleteFileCallback: OnCompleteFile;
    constructor(onCompleteFileCallback?: OnCompleteFile, fileBegin?: string, fileEnd?: string);
    bufferCharacter(character: string): string;
    buffer(data: string): string;
}
export {};
