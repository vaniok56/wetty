import 'mocha';
import { expect } from 'chai';

import {
  renderHome,
  renderTerminal,
} from './html';
import type { TerminalTarget } from '../targets';

describe('terminal html rendering', () => {
  const target: TerminalTarget = {
    slug: 'raspik4b',
    name: 'raspik4b',
    host: '192.168.100.105',
    user: 'raspik4b',
    port: 22,
  };

  it('renders host picker links on home page', () => {
    const html = renderHome('', 'terminal.cactuz.icu', [target]);

    expect(html).to.contain('terminal.cactuz.icu');
    expect(html).to.contain('href="/raspik4b"');
    expect(html).to.contain('Open terminal');
  });

  it('renders terminal page with host metadata', () => {
    const html = renderTerminal('', 'terminal.cactuz.icu', target);

    expect(html).to.contain('data-target-slug="raspik4b"');
    expect(html).to.contain('data-target-name="raspik4b"');
    expect(html).to.contain('Back');
    expect(html).to.contain('Connection');
  });
});
