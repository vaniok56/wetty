import { expect } from 'chai';
import 'mocha';
import { JSDOM } from 'jsdom';
import * as sinon from 'sinon';

import { FileDownloader } from './download';

const noop = (): void => {}; // eslint-disable-line @typescript-eslint/no-empty-function

describe('FileDownloader', () => {
  const FILE_BEGIN = 'BEGIN';
  const FILE_END = 'END';
  let fileDownloader: FileDownloader;

  beforeEach(() => {
    const { window } = new JSDOM(`...`);
    global.window = window as unknown as Window & typeof globalThis;
    global.document = window.document;
    global.Node = window.Node;
    global.HTMLElement = window.HTMLElement;
    fileDownloader = new FileDownloader(noop, FILE_BEGIN, FILE_END);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should render a terminal-controlled filename as text', async () => {
    const clock = sinon.useFakeTimers();
    sinon.stub(URL, 'createObjectURL').returns('blob:test');
    const fileName = '<img src=x onerror=alert(1)>';
    const data = `${window.btoa(fileName)}:${window.btoa('file')}`;

    new FileDownloader().buffer(`\u001b[5i${data}\u001b[4i`);
    await clock.tickAsync(0);

    const link = document.querySelector('a');
    expect(link?.textContent).to.equal(fileName);
    expect(link?.getAttribute('download')).to.equal(fileName);
    expect(link?.getAttribute('rel')).to.equal('noopener');
    expect(document.querySelector('img')).to.equal(null);
  });

  it('does not delay terminal output while file detection completes', async () => {
    let completed = '';
    let finish!: () => void;
    const done = new Promise<void>(resolve => {
      finish = resolve;
    });
    const downloader = new FileDownloader(async data => {
      await Promise.resolve();
      completed = data;
      finish();
    }, FILE_BEGIN, FILE_END);

    expect(downloader.buffer(`left${FILE_BEGIN}file${FILE_END}right`)).to.equal(
      'leftright',
    );
    await done;
    expect(completed).to.equal('file');
  });

  it('detects a PNG download', async () => {
    const clock = sinon.useFakeTimers();
    let blob: Blob | undefined;
    sinon.stub(URL, 'createObjectURL').callsFake(value => {
      blob = value as Blob;
      return 'blob:test';
    });
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    new FileDownloader().buffer(`\u001b[5i${png}\u001b[4i`);
    await clock.tickAsync(0);

    expect(blob?.type).to.equal('image/png');
  });

  it('should return data before file markers', () => {
    const onCompleteFileCallbackStub = sinon.stub(
      fileDownloader,
      'onCompleteFileCallback',
    );
    expect(
      fileDownloader.buffer(`DATA AT THE LEFT${FILE_BEGIN}FILE${FILE_END}`),
    ).to.equal('DATA AT THE LEFT');
    expect(onCompleteFileCallbackStub.calledOnce).to.be.true;
    expect(onCompleteFileCallbackStub.getCall(0).args[0]).to.equal('FILE');
  });

  it('should return data after file markers', () => {
    const onCompleteFileCallbackStub = sinon.stub(
      fileDownloader,
      'onCompleteFileCallback',
    );
    expect(
      fileDownloader.buffer(`${FILE_BEGIN}FILE${FILE_END}DATA AT THE RIGHT`),
    ).to.equal('DATA AT THE RIGHT');
    expect(onCompleteFileCallbackStub.calledOnce).to.be.true;
    expect(onCompleteFileCallbackStub.getCall(0).args[0]).to.equal('FILE');
  });

  it('should return data before and after file markers', () => {
    const onCompleteFileCallbackStub = sinon.stub(
      fileDownloader,
      'onCompleteFileCallback',
    );
    expect(
      fileDownloader.buffer(
        `DATA AT THE LEFT${FILE_BEGIN}FILE${FILE_END}DATA AT THE RIGHT`,
      ),
    ).to.equal('DATA AT THE LEFTDATA AT THE RIGHT');
    expect(onCompleteFileCallbackStub.calledOnce).to.be.true;
    expect(onCompleteFileCallbackStub.getCall(0).args[0]).to.equal('FILE');
  });

  it('should return data before a beginning marker found', () => {
    sinon.stub(fileDownloader, 'onCompleteFileCallback');
    expect(fileDownloader.buffer(`DATA AT THE LEFT${FILE_BEGIN}FILE`)).to.equal(
      'DATA AT THE LEFT',
    );
  });

  it('should return data after an ending marker found', () => {
    const onCompleteFileCallbackStub = sinon.stub(
      fileDownloader,
      'onCompleteFileCallback',
    );
    expect(fileDownloader.buffer(`${FILE_BEGIN}FI`)).to.equal('');
    expect(fileDownloader.buffer(`LE${FILE_END}DATA AT THE RIGHT`)).to.equal(
      'DATA AT THE RIGHT',
    );
    expect(onCompleteFileCallbackStub.calledOnce).to.be.true;
    expect(onCompleteFileCallbackStub.getCall(0).args[0]).to.equal('FILE');
  });

  it('should buffer across incomplete file begin marker sequence on two calls', () => {
    fileDownloader = new FileDownloader(noop, 'BEGIN', 'END');
    const onCompleteFileCallbackStub = sinon.stub(
      fileDownloader,
      'onCompleteFileCallback',
    );

    expect(fileDownloader.buffer('BEG')).to.equal('');
    expect(fileDownloader.buffer('INFILEEND')).to.equal('');
    expect(onCompleteFileCallbackStub.calledOnce).to.be.true;
    expect(onCompleteFileCallbackStub.getCall(0).args[0]).to.equal('FILE');
  });

  it('should buffer across incomplete file begin marker sequence on n calls', () => {
    fileDownloader = new FileDownloader(noop, 'BEGIN', 'END');
    const onCompleteFileCallbackStub = sinon.stub(
      fileDownloader,
      'onCompleteFileCallback',
    );

    expect(fileDownloader.buffer('B')).to.equal('');
    expect(fileDownloader.buffer('E')).to.equal('');
    expect(fileDownloader.buffer('G')).to.equal('');
    expect(fileDownloader.buffer('I')).to.equal('');
    expect(fileDownloader.buffer('NFILEEND')).to.equal('');
    expect(onCompleteFileCallbackStub.calledOnce).to.be.true;
    expect(onCompleteFileCallbackStub.getCall(0).args[0]).to.equal('FILE');
  });

  it('should buffer across incomplete file begin marker sequence with data on the left and right on multiple calls', () => {
    fileDownloader = new FileDownloader(noop, 'BEGIN', 'END');
    const onCompleteFileCallbackStub = sinon.stub(
      fileDownloader,
      'onCompleteFileCallback',
    );

    expect(fileDownloader.buffer('DATA AT THE LEFTB')).to.equal(
      'DATA AT THE LEFT',
    );
    expect(fileDownloader.buffer('E')).to.equal('');
    expect(fileDownloader.buffer('G')).to.equal('');
    expect(fileDownloader.buffer('I')).to.equal('');
    expect(fileDownloader.buffer('NFILEENDDATA AT THE RIGHT')).to.equal(
      'DATA AT THE RIGHT',
    );
    expect(onCompleteFileCallbackStub.calledOnce).to.be.true;
    expect(onCompleteFileCallbackStub.getCall(0).args[0]).to.equal('FILE');
  });

  it('should buffer across incomplete file begin marker sequence then handle false positive', () => {
    fileDownloader = new FileDownloader(noop, 'BEGIN', 'END');
    const onCompleteFileCallbackStub = sinon.stub(
      fileDownloader,
      'onCompleteFileCallback',
    );

    expect(fileDownloader.buffer('DATA AT THE LEFTB')).to.equal(
      'DATA AT THE LEFT',
    );
    expect(fileDownloader.buffer('E')).to.equal('');
    expect(fileDownloader.buffer('G')).to.equal('');
    // This isn't part of the file_begin marker and should trigger the partial
    // file begin marker to be returned with the normal data
    expect(fileDownloader.buffer('ZDATA AT THE RIGHT')).to.equal(
      'BEGZDATA AT THE RIGHT',
    );
    expect(onCompleteFileCallbackStub.called).to.be.false;
  });

  it('should buffer across incomplete file end marker sequence on two calls', () => {
    fileDownloader = new FileDownloader(noop, 'BEGIN', 'END');
    const mockFilePart1 = 'DATA AT THE LEFTBEGINFILEE';
    const mockFilePart2 = 'NDDATA AT THE RIGHT';

    const onCompleteFileCallbackStub = sinon.stub(
      fileDownloader,
      'onCompleteFileCallback',
    );
    expect(fileDownloader.buffer(mockFilePart1)).to.equal('DATA AT THE LEFT');
    expect(fileDownloader.buffer(mockFilePart2)).to.equal('DATA AT THE RIGHT');

    expect(onCompleteFileCallbackStub.calledOnce).to.be.true;
    expect(onCompleteFileCallbackStub.getCall(0).args[0]).to.equal('FILE');
  });

  it('should buffer across incomplete file end and file begin marker sequence with data on the left and right on multiple calls', () => {
    fileDownloader = new FileDownloader(noop, 'BEGIN', 'END');
    const onCompleteFileCallbackStub = sinon.stub(
      fileDownloader,
      'onCompleteFileCallback',
    );

    expect(fileDownloader.buffer('DATA AT THE LEFTBE')).to.equal(
      'DATA AT THE LEFT',
    );
    expect(fileDownloader.buffer('G')).to.equal('');
    expect(fileDownloader.buffer('I')).to.equal('');
    expect(fileDownloader.buffer('NFILEE')).to.equal('');
    expect(fileDownloader.buffer('N')).to.equal('');
    expect(fileDownloader.buffer('DDATA AT THE RIGHT')).to.equal(
      'DATA AT THE RIGHT',
    );
    expect(onCompleteFileCallbackStub.calledOnce).to.be.true;
    expect(onCompleteFileCallbackStub.getCall(0).args[0]).to.equal('FILE');
  });

  it('should be able to handle multiple files', () => {
    fileDownloader = new FileDownloader(noop, 'BEGIN', 'END');
    const onCompleteFileCallbackStub = sinon.stub(
      fileDownloader,
      'onCompleteFileCallback',
    );

    expect(
      fileDownloader.buffer(
        'DATA AT THE LEFT' +
          'BEGIN' +
          'FILE1' +
          'END' +
          'SECOND DATA' +
          'BEGIN',
      ),
    ).to.equal('DATA AT THE LEFTSECOND DATA');
    expect(onCompleteFileCallbackStub.calledOnce).to.be.true;
    expect(onCompleteFileCallbackStub.getCall(0).args[0]).to.equal('FILE1');

    expect(fileDownloader.buffer('FILE2')).to.equal('');
    expect(fileDownloader.buffer('E')).to.equal('');
    expect(fileDownloader.buffer('NDRIGHT')).to.equal('RIGHT');
    expect(onCompleteFileCallbackStub.calledTwice).to.be.true;
    expect(onCompleteFileCallbackStub.getCall(1).args[0]).to.equal('FILE2');
  });

  it('should be able to handle multiple files with an ending marker', () => {
    fileDownloader = new FileDownloader(noop, 'BEGIN', 'END');
    const onCompleteFileCallbackStub = sinon.stub(
      fileDownloader,
      'onCompleteFileCallback',
    );

    expect(fileDownloader.buffer('DATA AT THE LEFTBEGINFILE1EN')).to.equal(
      'DATA AT THE LEFT',
    );
    expect(onCompleteFileCallbackStub.calledOnce).to.be.false;
    expect(fileDownloader.buffer('DSECOND DATABEGINFILE2EN')).to.equal(
      'SECOND DATA',
    );
    expect(onCompleteFileCallbackStub.calledOnce).to.be.true;
    expect(onCompleteFileCallbackStub.getCall(0).args[0]).to.equal('FILE1');
    expect(fileDownloader.buffer('D')).to.equal('');
    expect(onCompleteFileCallbackStub.calledTwice).to.be.true;
    expect(onCompleteFileCallbackStub.getCall(1).args[0]).to.equal('FILE2');
  });
});
