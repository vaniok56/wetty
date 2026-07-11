import 'mocha';
import { expect } from 'chai';

import { renderHome, renderTerminal } from './html';
import type { TerminalTarget } from '../targets';

const target: TerminalTarget = {
  slug: 'raspik4b',
  name: 'raspik4b',
  host: '192.168.100.105',
  user: 'raspik4b',
  port: 22,
  tmux: true,
};

describe('terminal html rendering', () => {
  it('renders host picker links on home page', () => {
    const html = renderHome('', 'terminal.cactuz.icu', [target]);
    expect(html).to.contain('terminal.cactuz.icu');
    expect(html).to.contain('href="/raspik4b"');
    expect(html).to.contain('host_registry');
  });

  it('renders terminal page with host metadata', () => {
    const html = renderTerminal('', 'terminal.cactuz.icu', target);
    expect(html).to.contain('data-slug="raspik4b"');
    expect(html).to.contain('data-name="raspik4b"');
    expect(html).to.contain('id="terminal"');
    expect(html).to.contain('id="keybar"');
  });

  it('ships the viewport keys that stop the page panning under the keyboard', () => {
    const html = renderTerminal('', 't', target);
    expect(html).to.contain('interactive-widget=resizes-content');
    expect(html).to.contain('viewport-fit=cover');
  });

  it('offers ctrl, alt and shift as sticky modifiers', () => {
    const html = renderTerminal('', 't', target);
    for (const mod of ['ctrl', 'alt', 'shift']) {
      expect(html).to.contain(`data-mod="${mod}"`);
    }
  });

  // CSP sets script-src 'self' with no 'unsafe-inline', so an inline handler or
  // inline <script> would silently break the page.
  it('contains no inline scripts or event handlers', () => {
    const html = renderTerminal('', 't', target);
    expect(html).to.not.match(/<script(?![^>]*\ssrc=)/);
    expect(html).to.not.match(/\son(click|touchstart|mousedown|load)=/i);
  });

  it('never emits raw control bytes into attributes', () => {
    const html = renderTerminal('', 't', target);
    // eslint-disable-next-line no-control-regex
    expect(html).to.not.match(/[\x00-\x08\x0b\x0c\x0e-\x1f]/);
  });

  it('escapes html metacharacters in target metadata', () => {
    const evil: TerminalTarget = {
      ...target,
      slug: 'box',
      name: '<img src=x onerror=alert(1)>',
    };
    const html = renderTerminal('', 't', evil);
    expect(html).to.not.contain('<img src=x');
    expect(html).to.contain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
