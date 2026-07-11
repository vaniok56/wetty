import { sessionDefault } from '../../shared/defaults.js';
import { isDev } from '../../shared/env.js';
import type { TerminalTarget } from '../targets.js';
import type { Request, Response, RequestHandler } from 'express';

const jsFiles = isDev ? ['dev.js', 'main.js'] : ['main.js'];
const VERSION = Date.now();

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const esc = (value: string): string =>
  value.replace(/[&<>"']/g, ch => ENTITIES[ch]);

/**
 * `interactive-widget=resizes-content` makes Chrome and Firefox on Android
 * shrink the *layout* viewport when the keyboard opens, so a full-height app
 * resizes rather than being panned up out of sight. WebKit ignores the key
 * entirely, which is why viewport.ts also drives --app-height from
 * visualViewport. `viewport-fit=cover` is what makes env(safe-area-inset-*)
 * report real numbers on notched devices.
 */
const VIEWPORT =
  'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, ' +
  'viewport-fit=cover, interactive-widget=resizes-content';

const pageShell = (
  title: string,
  base: string,
  bodyAttrs: string,
  body: string,
  scripts = false,
): string => {
  const tags = scripts
    ? `\n${jsFiles
        .map(
          f =>
            `    <script type="module" src="${base}/client/${f}?v=${VERSION}"></script>`,
        )
        .join('\n')}`
    : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf8">
    <meta name="viewport" content="${VIEWPORT}">
    <meta name="theme-color" content="#05070a">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="cactuz">
    <link rel="icon" type="image/x-icon" href="${base}/client/favicon.ico?v=${VERSION}">
    <link rel="apple-touch-icon" href="${base}/client/icons/icon-180.png">
    <link rel="manifest" href="${base}/manifest.webmanifest">
    <title>${esc(title)}</title>
    <link rel="stylesheet" href="${base}/client/main.css?v=${VERSION}" />
  </head>
  <body data-base="${esc(base)}"${bodyAttrs}>${body}${tags}
  </body>
</html>`;
};

export const renderHome = (
  base: string,
  title: string,
  targets: TerminalTarget[],
): string =>
  pageShell(
    title,
    base,
    '',
    `
    <main class="landing">
      <section class="landing-panel">
        <div class="terminal-header">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
          <span class="title">host_registry</span>
        </div>
        <div class="target-list">
          ${
            targets.length === 0
              ? `<span class="meta">no machines configured — edit conf/targets.json5</span>`
              : targets
                  .map(
                    target => `
            <a class="target-item" href="${base}/${esc(target.slug)}">
              <span class="prompt">$</span>
              <span class="command">connect</span>
              <span class="args">${esc(target.slug)}</span>
              <span class="meta"># ${esc(target.user)}@${esc(target.host)}</span>
            </a>`,
                  )
                  .join('')
          }
        </div>
      </section>
    </main>`,
  );

/**
 * One key on the bar. `data-key` names a logical key resolved against the
 * armed modifiers; `data-send` is a literal string; `data-mod` is sticky.
 * tabindex=-1 keeps taps from stealing focus off xterm's helper textarea,
 * which would dismiss the soft keyboard.
 */
const key = (attr: string, label: string, cls = ''): string =>
  `<button type="button" tabindex="-1" class="key ${cls}" ${attr}>${label}</button>`;

const primaryRow = [
  key('data-key="escape"', 'Esc'),
  key('data-key="tab"', 'Tab'),
  key('data-mod="ctrl"', 'Ctrl', 'mod'),
  key('data-mod="alt"', 'Alt', 'mod'),
  key('data-mod="shift"', 'Shift', 'mod'),
  key('data-key="left"', '&#8592;', 'arrow'),
  key('data-key="down"', '&#8595;', 'arrow'),
  key('data-key="up"', '&#8593;', 'arrow'),
  key('data-key="right"', '&#8594;', 'arrow'),
  key('data-action="expand" aria-expanded="false"', '&#8943;', 'expand'),
].join('');

const secondaryRow = [
  key('data-key="home"', 'Home'),
  key('data-key="end"', 'End'),
  key('data-key="pageup"', 'PgUp'),
  key('data-key="pagedown"', 'PgDn'),
  key('data-key="insert"', 'Ins'),
  key('data-key="delete"', 'Del'),
  // Control bytes are named rather than embedded: a raw 0x03 inside an HTML
  // attribute is asking for trouble. keys.ts maps the letter via `char & 0x1f`.
  key('data-ctrl="c"', '^C', 'ctrlkey'),
  key('data-ctrl="d"', '^D', 'ctrlkey'),
  key('data-ctrl="z"', '^Z', 'ctrlkey'),
  key('data-ctrl="l"', '^L', 'ctrlkey'),
  key('data-ctrl="r"', '^R', 'ctrlkey'),
  key('data-ctrl="a"', '^A', 'ctrlkey'),
  key('data-ctrl="e"', '^E', 'ctrlkey'),
  key('data-ctrl="w"', '^W', 'ctrlkey'),
  key('data-ctrl="u"', '^U', 'ctrlkey'),
  key('data-send="|"', '|', 'lit'),
  key('data-send="~"', '~', 'lit'),
  key('data-send="/"', '/', 'lit'),
  key('data-send="-"', '&minus;', 'lit'),
  ...Array.from({ length: 12 }, (_v, i) =>
    key(`data-key="f${i + 1}"`, `F${i + 1}`, 'fkey'),
  ),
].join('');

const toolRow = [
  key('data-action="paste"', 'Paste', 'tool'),
  key('data-action="copy"', 'Copy', 'tool'),
  key('data-action="search"', 'Find', 'tool'),
  key('data-action="font-dec"', 'A&minus;', 'tool'),
  key('data-action="font-inc"', 'A&plus;', 'tool'),
  key('data-action="scroll-top"', 'Top', 'tool'),
  key('data-action="scroll-bottom"', 'Bottom', 'tool'),
  key('data-action="restart"', 'New shell', 'tool danger'),
  key('data-action="kill"', 'End session', 'tool danger'),
].join('');

export const renderTerminal = (
  base: string,
  title: string,
  target: TerminalTarget,
): string => {
  const tabs = Array.from(
    { length: sessionDefault.maxTabs },
    (_v, i) =>
      `<button type="button" class="tab" data-tab="${i}" aria-selected="${i === 0}">${i + 1}</button>`,
  ).join('');

  return pageShell(
    title,
    base,
    ` data-slug="${esc(target.slug)}" data-name="${esc(target.name)}"` +
      ` data-max-tabs="${sessionDefault.maxTabs}"`,
    `
    <div class="app">
      <header class="topbar">
        <a class="back-link" href="${base || '/'}" aria-label="Back to hosts">
          <span class="chev">&#8249;</span><span class="back-text">Hosts</span>
        </a>
        <div class="topbar-meta">
          <span class="host-badge">${esc(target.name)}</span>
          <span id="status" class="status" data-state="connecting">connecting</span>
        </div>
        <div class="tabs" id="tabs" role="tablist">${tabs}</div>
      </header>

      <div id="terminal-wrap">
        <div id="terminal"></div>
        <div id="banner" class="banner" hidden></div>
        <div id="findbar" class="findbar" hidden>
          <input id="find-input" type="search" placeholder="find"
                 autocomplete="off" autocapitalize="off" spellcheck="false">
          <button type="button" tabindex="-1" data-action="find-prev" aria-label="Previous match">&#8593;</button>
          <button type="button" tabindex="-1" data-action="find-next" aria-label="Next match">&#8595;</button>
          <button type="button" tabindex="-1" data-action="find-close" aria-label="Close find">&#10005;</button>
        </div>
      </div>

      <div id="keybar" class="keybar">
        <div class="keybar-row primary">${primaryRow}</div>
        <div class="keybar-row secondary" hidden>
          <div class="keybar-scroll">${secondaryRow}</div>
          <div class="keybar-scroll">${toolRow}</div>
        </div>
      </div>

      <div id="overlay">
        <div class="error">
          <div id="msg"></div>
          <button id="error-toggle" type="button">details</button>
          <pre id="error-details" hidden></pre>
          <div class="overlay-actions">
            <button id="overlay-retry" type="button">reconnect</button>
            <a class="overlay-link" href="${base || '/'}">hosts</a>
          </div>
        </div>
      </div>
    </div>`,
    true,
  );
};

export const html =
  (base: string, title: string, target: TerminalTarget): RequestHandler =>
  (_req: Request, res: Response): void => {
    res.send(renderTerminal(base, title, target));
  };
