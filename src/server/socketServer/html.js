import { isDev } from '../../shared/env.js';
const jsFiles = isDev ? ['dev.js', 'wetty.js'] : ['wetty.js'];
const VERSION = new Date().getTime();
const pageShell = (title, base, body) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">
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
export const renderHome = (base, title, targets) => pageShell(title, base, `
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
  `);
export const renderTerminal = (base, title, target) => pageShell(title, base, `
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
         onclick="window.toggleFunctions(); return false;"
       ><i class="fas fa-keyboard"></i></a>
      <div class="onscreen-buttons">
        <a href="#" onclick="window.pressESC(); return false;">Esc</a>
        <a href="#" onclick="window.pressUP(); return false;"><i class="fas fa-chevron-up"></i></a>
        <a href="#" onclick="window.pressTAB(); return false;">Tab</a>

        <a href="#" onclick="window.pressLEFT(); return false;"><i class="fas fa-chevron-left"></i></a>
        <a href="#" onclick="window.pressENTER(); return false;"><i class="fas fa-level-down-alt fa-rotate-90"></i></a>
        <a href="#" onclick="window.pressRIGHT(); return false;"><i class="fas fa-chevron-right"></i></a>

        <a id="onscreen-ctrl" href="#" onclick="window.toggleCTRL(); return false;">Ctrl</a>
        <a href="#" onclick="window.pressDOWN(); return false;"><i class="fas fa-chevron-down"></i></a>
        <a href="#" onclick="window.pressALT(); return false;">Alt</a>
      </div>
    </div>
    <div id="terminal"></div>
    ${jsFiles
    .map(file => `    <script type="module" src="${base}/client/${file}?v=${VERSION}"></script>`)
    .join('\n')}
    </div>
  `);
export const html = (base, title, target) => (_req, res) => {
    res.send(renderTerminal(base, title, target));
};
