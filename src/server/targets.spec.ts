import 'mocha';
import { expect } from 'chai';

import {
  createTerminalTargets,
  getTerminalTarget,
  getTerminalTargetFromReferer,
} from './targets';

describe('terminal targets', () => {
  function targets() {
    return createTerminalTargets({
      raspik4b: {
        name: 'raspik4b',
        host: '192.168.100.105',
        user: 'raspik4b',
        port: 22,
      },
      raspik: {
        name: 'raspik',
        host: '192.168.100.51',
        user: 'vaniok56',
        port: 22,
      },
    });
  }

  it('returns target by slug', () => {
    expect(getTerminalTarget(targets(), 'raspik4b')).to.deep.equal({
      slug: 'raspik4b',
      name: 'raspik4b',
      host: '192.168.100.105',
      user: 'raspik4b',
      port: 22,
    });
  });

  it('returns undefined for unknown slug', () => {
    expect(getTerminalTarget(targets(), 'missing')).to.equal(undefined);
  });

  it('extracts target from referer path', () => {
    expect(
      getTerminalTargetFromReferer(
        targets(),
        'https://terminal.cactuz.icu/raspik?via=cf',
      ),
    ).to.deep.equal({
      slug: 'raspik',
      name: 'raspik',
      host: '192.168.100.51',
      user: 'vaniok56',
      port: 22,
    });
  });

  it('ignores terminal homepage referer', () => {
    expect(
      getTerminalTargetFromReferer(targets(), 'https://terminal.cactuz.icu/'),
    ).to.equal(undefined);
  });
});
