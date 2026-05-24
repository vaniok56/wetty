import { isDev } from '../../shared/env.js';
import type { TerminalTarget } from '../targets.js';
import type { Request, Response, RequestHandler } from 'express';

const jsFiles = isDev ? ['dev.js', 'wetty.js'] : ['wetty.js'];
const VERSION = new Date().getTime();

const pageShell = (title: string, base: string, body: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, interactive-widget=resizes-content">
    <link rel="icon" type="image/x-icon" href="${base}/client/favicon.ico?v=${VERSION}">
    <title>${title}</title>
    <link rel="stylesheet" href="${base}/client/wetty.css?v=${VERSION}" />
    <script>
      window.WETTY_BASE = "${base}";
      console.log('Wetty Version:', "${VERSION}");
      console.log('Wetty Base:', window.WETTY_BASE, 'Location:', window.location.href);
    </script>
  </head>
  <body data-base="${base}">${body}</body>
</html>`;

export const renderHome = (
  base: string,
  title: string,
  targets: TerminalTarget[],
): string => pageShell(
  title,
  base,
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
          ${targets.map((target) => `
            <a class="target-item" href="${base}/${target.slug}">
              <span class="prompt">$</span>
              <span class="command">connect</span>
              <span class="args">${target.slug}</span>
              <span class="meta"># ${target.user}@${target.host}</span>
            </a>
          `).join('')}
        </div>
      </section>
    </main>
  `,
);

export const renderTerminal = (
  base: string,
  title: string,
  target: TerminalTarget,
): string => pageShell(
  title,
  base,
  `
    <div class="app-shell" data-target-slug="${target.slug}" data-target-name="${target.name}">
      <div class="topbar">
        <a class="back-link" href="${base || '/'}">
          <i class="fas fa-chevron-left"></i> Back
        </a>
        <div class="topbar-meta">
          <span class="host-badge">${target.name}</span>
          <span class="connection-label">ssh_active</span>
        </div>
      </div>
    <div id="overlay">
      <div class="error">
        <div id="msg"></div>
        <button id="error-toggle" type="button">i</button>
        <pre id="error-details" hidden></pre>
        <input type="button" onclick="location.reload();" value="reconnect" />
      </div>
    </div>
    <div id="functions">
      <a class="toggler"
         href="#"
         alt="Toggle keyboard"
         onmousedown="event.preventDefault();"
         ontouchstart="event.preventDefault(); window.toggleFunctions(); return false;"
         onclick="window.toggleFunctions(); return false;"
       ><i class="fas fa-keyboard"></i></a>
      <div class="onscreen-buttons">
        <a href="#" onmousedown="event.preventDefault();" ontouchstart="event.preventDefault(); window.pressESC(); return false;" onclick="window.pressESC(); return false;">Esc</a>
        <a href="#" onmousedown="event.preventDefault();" ontouchstart="event.preventDefault(); window.pressUP(); return false;" onclick="window.pressUP(); return false;"><i class="fas fa-chevron-up"></i></a>
        <a href="#" onmousedown="event.preventDefault();" ontouchstart="event.preventDefault(); window.pressTAB(); return false;" onclick="window.pressTAB(); return false;">Tab</a>

        <a href="#" onmousedown="event.preventDefault();" ontouchstart="event.preventDefault(); window.pressLEFT(); return false;" onclick="window.pressLEFT(); return false;"><i class="fas fa-chevron-left"></i></a>
        <a href="#" onmousedown="event.preventDefault();" ontouchstart="event.preventDefault(); window.pressENTER(); return false;" onclick="window.pressENTER(); return false;"><i class="fas fa-level-down-alt fa-rotate-90"></i></a>
        <a href="#" onmousedown="event.preventDefault();" ontouchstart="event.preventDefault(); window.pressRIGHT(); return false;" onclick="window.pressRIGHT(); return false;"><i class="fas fa-chevron-right"></i></a>

        <a id="onscreen-ctrl" href="#" onmousedown="event.preventDefault();" ontouchstart="event.preventDefault(); window.toggleCTRL(); return false;" onclick="window.toggleCTRL(); return false;">Ctrl</a>
        <a href="#" onmousedown="event.preventDefault();" ontouchstart="event.preventDefault(); window.pressDOWN(); return false;" onclick="window.pressDOWN(); return false;"><i class="fas fa-chevron-down"></i></a>
        <a href="#" onmousedown="event.preventDefault();" ontouchstart="event.preventDefault(); window.pressALT(); return false;" onclick="window.pressALT(); return false;">Alt</a>
      </div>
    </div>
    <div id="terminal"></div>
    ${jsFiles
        .map(file => `    <script type="module" src="${base}/client/${file}?v=${VERSION}"></script>`)
        .join('\n')
    }
    </div>
  `,
);

export const html = (
  base: string,
  title: string,
  target: TerminalTarget,
): RequestHandler => (
  _req: Request,
  res: Response,
): void => {
  res.send(renderTerminal(base, title, target));
};
