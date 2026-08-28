# terminal-cactuz upstream update plan

Date: 2026-08-27

## Decision

Do not merge or rebase `upstream/main`.

Fork and upstream share base `0ec642a`, then diverge into different products:

- Fork: 5 commits ahead, 90 upstream commits behind.
- Fork rewrite: 101 files changed, 6,122 additions, 3,976 deletions.
- Upstream side: 84 files changed, 6,579 additions, 4,621 deletions.
- Simulated merge: 47 conflicts.

Use upstream as patch feed. Port useful changes by intent, against current fork
code.

## Goals

1. Fix known code-level security bugs.
2. Patch current dependency lines without changing architecture.
3. Make CI test same application and Dockerfile used in production.
4. Migrate major dependencies one at a time.
5. Preserve SSH access, remote `tmux` sessions, mobile terminal behavior, PWA,
   push, and Cloudflare Access.
6. Keep rollback possible after every production change.

## Non-goals

- No bulk upstream merge.
- No rebase onto upstream.
- No dependency `--latest` sweep.
- No UI redesign.
- No session architecture rewrite during security work.
- No Cloudflare tunnel restart during app deployment.
- No unrelated cleanup in security commits.

## Confirmed decisions

- Implement full sequence through major migrations.
- Keep small commits and internal phase gates.
- Make one production deployment after full candidate passes.
- Ask for approval before replacing live Reactor container.
- Support amd64 and arm64. Drop arm/v6 and arm/v7.
- Keep root and subpath deployment support.
- Delete public Docker/npm publishing workflows. Git clone plus local Docker
  build remains distribution path.
- Keep shared remote tmux names. Trusted users coordinate through tabs 1-4.
- Remove Raspik4b only from live Reactor target configuration. Keep generic repo
  target support.
- Add isolated canary target/session namespace.
- Block production restart until live session count reaches zero.
- Audit gate: no unexplained reachable high-severity finding.
- Keep Docker `CMD`; CLI flag forwarding through `ENTRYPOINT` is not required.
- Test xterm 6 keyboard mappings before choosing Alt/Option compatibility
  behavior.
- Available physical mobile gates: Samsung S25 and iPhone SE 2020.
- Friend runs amd64 and cannot test release candidate before production.
- Require preloaded target keys with `StrictHostKeyChecking=yes`.
- Skip OSC browser title synchronization.
- Report release version `4.0.0`.
- Pin checkout, Node setup, CodeQL, and Docker validation actions to reviewed
  commit SHAs.
- Accept QEMU arm64 boot plus real PTY spawn/resize/exit as arm64 release proof.

## Current risks

### Code risks

1. Download filename XSS in `src/client/app/download.ts`.
2. Open redirect in `src/server/socketServer/middleware.ts`.
3. Polynomial trailing-slash regex in `src/client/app/session.ts`; unused copy
   in `src/server/socketServer/assets.ts`.

### Dependency risks

Current `pnpm audit --prod` result:

```text
31 vulnerabilities
8 low | 6 moderate | 17 high
```

Important runtime families:

- Express 4.19.2 and old transitive middleware.
- Socket.IO 4.7.5, Engine.IO 6.5.5, Socket.IO parser 4.2.4.
- `ws` 8.17.1.
- Lodash 4.17.21.
- Direct `serve-static` 1.15.0.

Some findings come from build tools. Still remove them from runtime image where
possible.

### Verification drift

- `package.json` pins pnpm 9.4.0.
- GitHub workflow installs pnpm 8.
- CI runs `pnpm install`, not `pnpm install --frozen-lockfile`.
- Docker workflow builds `containers/wetty/Dockerfile`.
- Reactor production builds root `Dockerfile`.
- Docker workflow publishes upstream image names, not fork image names.

CI green status currently would not prove production image works.

### Session deployment risk

App sessions and xterm snapshots live in container memory. Recreating app
container loses them. Remote processes survive only when target has `tmux` and
command runs inside named tmux session.

### Separate security decision

In-memory registry keys sessions by Cloudflare identity. Remote tmux name does
not:

```ts
const name = `cactuz-${target.slug}-${tab}`;
```

Multiple Cloudflare users opening same host and tab can attach same remote tmux
shell after process restart. Shared behavior is accepted for current trusted
users. Users coordinate through tabs 1-4. Do not add identity to tmux names
during this update; doing so would change reconnect behavior and make existing
sessions appear lost.

## Branch and commit model

One branch per risk class. Never combine code security, dependency majors, and
deployment changes.

Suggested branches:

```bash
git switch main
git pull --ff-only
git switch -c fix/upstream-security-2026-08
```

Later branches start from updated `main`:

```text
chore/ci-production-parity
chore/deps-compatible-2026-08
chore/runtime-image-prune
chore/node-22
chore/express-5
chore/xterm-6
chore/file-type-22
chore/cli-deps
feat/terminal-title
```

Preferred commits:

```text
test: lock current security behavior
fix(security): render download filename as text
fix(security): keep slash redirects local
fix(security): remove unsafe slash regex
ci: test production build path
chore(deps): patch express stack
chore(deps): patch socket.io stack
chore(deps): refresh compatible runtime packages
chore(docker): prune build dependencies
```

Each commit must build and test independently.

## Phase 0: establish baseline

### 0.1 Install exact toolchain

Use package-manager pin already in `package.json`:

```bash
corepack enable
corepack install
corepack pnpm install --frozen-lockfile
```

Do not update lockfile during baseline.

### 0.2 Run baseline gates

```bash
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm audit --prod
docker build -t terminal-cactuz:baseline .
```

Record failures before edits. Baseline failure gets separate fix or explicit
waiver. Never call new failure "pre-existing" without saved output.

### 0.3 Save behavior inventory

Automated inventory:

```bash
git status --short --branch
git rev-parse HEAD
corepack pnpm --version
node --version
docker image inspect terminal-cactuz:baseline --format '{{.Id}} {{.Architecture}}'
```

Manual baseline through `https://terminal.example.com`:

- Cloudflare Access blocks unauthenticated request.
- Home lists Reactor, Raspik, Raspik4b.
- Reactor session opens.
- Raspik session opens.
- Input and output work.
- Resize works.
- Four tabs work.
- Browser disconnect and reconnect preserve session.
- Existing tmux session survives app reconnect.
- Sticky Ctrl, Alt, Shift work on phone.
- Touch scroll works in shell and tmux application.
- Search, clipboard, OSC 52, file download, PWA, and push work.

### 0.4 Baseline acceptance gate

- Clean worktree.
- Lint passes.
- Tests pass.
- Build passes.
- Docker image starts.
- Current production smoke matrix documented.

If current tests fail, stop. Repair baseline before dependency work.

## Phase 1: make CI test production path

Do this before dependency updates. Otherwise later green checks may lie.

### 1.1 Align pnpm

Replace explicit pnpm 8 setup. Let `packageManager` pin drive version:

```yaml
- name: Enable Corepack
  run: corepack enable

- name: Install dependencies
  run: pnpm install --frozen-lockfile
```

Keep Node 20 until Node 22 migration phase, or use Node 22 now only if baseline
proves production Node 20 and CI Node 22 both pass. Better first gate both:

```yaml
strategy:
  matrix:
    node: [20, 22]
```

Remove Node 20 after production runtime moves to Node 22.

### 1.2 Test active Dockerfile

Current workflow points at stale file:

```yaml
file: containers/wetty/Dockerfile
```

Change to:

```yaml
file: Dockerfile
```

Reactor and friend server are amd64, but fork will support arm64. Drop arm/v6
and arm/v7. Validation matrix:

```yaml
platforms: linux/amd64,linux/arm64
push: false
```

arm64 has no physical server gate. CI must build arm64 under QEMU and start
image under emulation. Native `node-pty` load and PTY smoke must pass inside
arm64 container. This proves architecture compatibility better than build-only
CI, but not hardware performance.

Delete stale DockerHub/GHCR and npm publishing paths. Local Reactor and friend
deployment use Git clone plus local Docker build.

### 1.3 Add audit visibility

Audit should report, not silently mutate:

```yaml
- name: Production dependency audit
  run: pnpm audit --prod
```

During first cleanup PR, audit may fail because known findings remain. Temporary
scoped allowance acceptable only with issue list and removal date. Do not use
blanket `continue-on-error` forever.

### 1.4 Update action security

Port upstream CI hardening separately:

- Set explicit job permissions.
- Do not inherit secrets into pull-request Docker builds.
- Log in to registries only when `push: true`.
- Update CodeQL from v2.
- Pin checkout, setup-node, CodeQL, QEMU, Buildx, and Docker build validation
  actions to reviewed commit SHAs.

Example permissions:

```yaml
permissions:
  contents: read
```

CodeQL job:

```yaml
permissions:
  contents: read
  security-events: write
```

### 1.5 CI acceptance gate

- Frozen install succeeds.
- Lint, test, build succeed.
- Root Dockerfile builds for linux/amd64.
- Pull-request jobs receive no deploy secrets.
- Built image starts and answers `/`.

## Phase 2: port code security fixes

Three small commits. Manual ports, not cherry-picks.

### 2.1 Fix download filename XSS

Current bug:

```ts
Toastify({
  text: `Download ready: <a href="${blobUrl}" target="_blank" download="${fileName}">${fileName}</a>`,
  escapeMarkup: false,
}).showToast();
```

Remote terminal controls `fileName`. Raw HTML interpolation allows DOM injection
inside authenticated terminal page.

Replace string HTML with DOM nodes:

```ts
const link = document.createElement('a');
link.href = URL.createObjectURL(blob);
link.target = '_blank';
link.rel = 'noopener';
link.download = fileName;
link.textContent = fileName;

const wrapper = document.createElement('span');
wrapper.textContent = 'Download ready: ';
wrapper.appendChild(link);

Toastify({
  node: wrapper,
  duration: 10000,
  gravity: 'bottom',
  position: 'right',
  backgroundColor: '#fff',
  stopOnFocus: true,
}).showToast();
```

Keep file detection, generated fallback filename, MIME type, and download
behavior unchanged.

Regression test in `src/client/app/download.spec.ts`:

```ts
it('renders a terminal-provided filename as text', () => {
  const dom = new JSDOM('<body></body>', { url: 'https://terminal.test' });
  global.document = dom.window.document;
  global.window = dom.window as unknown as Window & typeof globalThis;
  sinon.stub(URL, 'createObjectURL').returns('blob:test');

  const payload = `${window.btoa('<img src=x onerror=alert(1)>')}:${window.btoa(
    'A',
  )}`;
  new FileDownloader().buffer(`\u001b[5i${payload}\u001b[4i`);

  const link = document.querySelector('.toastify a') as HTMLAnchorElement;
  expect(link.textContent).to.equal('<img src=x onerror=alert(1)>');
  expect(link.download).to.equal('<img src=x onerror=alert(1)>');
  expect(document.querySelector('.toastify img')).to.equal(null);
});
```

Adjust JSDOM globals to current TypeScript types. Keep assertion intent.

Acceptance:

- Crafted filename appears literally.
- No injected element exists.
- Normal filename still downloads.
- Generated fallback filename unchanged.
- Existing 20 file-buffer tests still pass.

### 2.2 Fix open redirect

Current bug:

```ts
res.redirect(301, req.path.slice(0, -1) + req.url.slice(req.path.length));
```

Protocol-relative input can produce external `Location`.

Minimal upstream-style fix:

```ts
export function redirect(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path.endsWith('/') && req.path.length > 1) {
    const target = req.path.slice(0, -1) + req.url.slice(req.path.length);
    if (isSafeLocalRedirectTarget(target)) {
      res.redirect(301, target);
    } else {
      res.status(400).end();
    }
  } else next();
}

function isSafeLocalRedirectTarget(target: string): boolean {
  try {
    const base = 'https://localhost';
    return new URL(target, base).origin === base;
  } catch {
    return false;
  }
}
```

Why `400`, not redirect to `/`: fork supports configurable `BASE`. Redirecting
unsafe input to `/` can leave mounted app prefix. Reject malformed input
instead.

Add `src/server/socketServer/middleware.spec.ts` with direct middleware tests.
No `supertest` dependency needed.

```ts
it('preserves query string on local slash redirects', () => {
  const req = { path: '/raspik/', url: '/raspik/?tab=1' } as Request;
  const res = { redirect: sinon.spy() } as unknown as Response;
  redirect(req, res, sinon.spy());
  expect(res.redirect).to.have.been.calledWith(301, '/raspik?tab=1');
});

it('rejects protocol-relative redirect targets', () => {
  const req = {
    path: '//evil.example/',
    url: '//evil.example/?x=1',
  } as Request;
  const end = sinon.spy();
  const res = {
    status: sinon.stub().returns({ end }),
  } as unknown as Response;
  redirect(req, res, sinon.spy());
  expect(res.status).to.have.been.calledWith(400);
  expect(end.calledOnce).to.equal(true);
});
```

If Chai Sinon assertions are unavailable, use `spy.calledWith(...)`; do not add
plugin.

Acceptance:

- `/raspik/?tab=1` returns `Location: /raspik?tab=1`.
- External and malformed targets never reach `res.redirect`.
- Root `/` does not redirect.
- Non-trailing path calls `next()`.
- Base-path deployment remains local.

### 2.3 Remove unsafe trailing-slash regex

Current client code:

```ts
const trim = (str: string): string => str.replace(/\/*$/, '');
```

Replace:

```ts
const trim = (str: string): string => str.replace(/\/+$/, '');
```

`src/server/socketServer/assets.ts` exports same unsafe helper but no caller
exists. Delete it instead of preserving dead code:

```ts
import serve from 'serve-static';
import { assetsPath } from './shared/path.js';

export const serveStatic = (path: string) =>
  serve(assetsPath(path), {
    etag: false,
    lastModified: false,
    cacheControl: false,
  });
```

No timing assertion. Timing tests flake. Regex is trivial and visible.

Acceptance:

- `BASE=/` produces `/socket.io`.
- `BASE=/wetty/` produces `/wetty/socket.io`.
- Empty base still works.
- Client reconnect still uses same Socket.IO path.

### 2.4 Require preloaded SSH host keys

Current behavior trusts unseen hosts with `accept-new` when a known-hosts path
exists. Production already preloads and mounts `known_hosts` read-only. Require
exact key instead:

```ts
const hostChecking = knownHosts !== '/dev/null' ? 'yes' : 'no';
```

Update comment in `src/server/command.ts`, default config comment, and command
tests:

```ts
expect(args).to.contain('StrictHostKeyChecking=yes');
```

Acceptance:

- Known Reactor and Raspik keys connect.
- Missing key fails without prompt or automatic trust.
- Changed key fails.
- `/dev/null` development mode retains explicit `StrictHostKeyChecking=no`
  behavior.
- Adding target docs require verified `ssh-keyscan` entry before restart.

### 2.5 Security phase gate

```bash
corepack pnpm lint
corepack pnpm test
corepack pnpm build
docker build -t terminal-cactuz:security .
```

Browser checks:

- Crafted filename cannot create DOM element.
- Slash redirects stay local.
- Reactor and Raspik sessions connect.
- Reconnect snapshot still works.

Keep this as independently releasable checkpoint. Under selected one-release
strategy, continue only after gate passes. Split security deployment earlier
only after explicit approval.

## Phase 3: patch current dependency lines

One package family per commit. No major framework migration yet.

### 3.1 Patch Express 4 stack

Use latest Express 4 line and direct middleware patches:

```bash
corepack pnpm up \
  express@4.22.2 \
  serve-static@1.16.3 \
  compression@1.8.1 \
  express-winston@4.2.0
```

Keep Express 4 type packages during this commit.

Expected fixes include old `body-parser`, `cookie`, `path-to-regexp`, `send`,
`serve-static`, and `on-headers` findings.

Do not reorder middleware in `src/server/socketServer.ts`. Dependency patch
should not change routing semantics.

Add request-level tests using Node `http` or built-in `fetch`, not Supertest:

- GET `/` returns 200.
- GET known target returns terminal HTML.
- Unknown target returns 404.
- `/raspik/?x=1` redirects locally.
- `/sw.js` has JavaScript content type and `no-cache`.
- Manifest has manifest content type.
- Static JS, CSS, WOFF2, icons return expected MIME types.
- CSP remains present.
- Push JSON limit remains 4 KB.

Gate:

```bash
corepack pnpm why express serve-static compression
corepack pnpm audit --prod
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

### 3.2 Patch Socket.IO family atomically

Server and client must move together:

```bash
corepack pnpm up socket.io@4.8.3 socket.io-client@4.8.3
```

Verify lock resolves patched Engine.IO, parser, and `ws` versions. Do not trust
top-level versions alone:

```bash
corepack pnpm why socket.io socket.io-client engine.io socket.io-parser ws
corepack pnpm audit --prod
```

Add one real socket integration test. Required behavior:

- Connect on root Socket.IO path.
- Connect on non-root path such as `/wetty/socket.io`.
- Emit `attach`; receive `attached`.
- Send input and receive output.
- Resize.
- Disconnect and reconnect.
- Snapshot output ordering remains correct.
- Server closes cleanly.

Keep existing `src/server/sessions.spec.ts` as PTY persistence gate.

Manual mobile gate:

- Lock phone for one minute.
- Reopen app.
- Status moves `reconnecting`, then `live`.
- Output produced while disconnected appears once, in order.
- No duplicate keystrokes.

### 3.3 Refresh compatible runtime packages

Update compatible lines in small groups:

```bash
corepack pnpm up \
  compression@1.8.1 \
  express-winston@4.2.0 \
  json5@2.2.3 \
  response-time@2.3.4 \
  winston@3.19.0 \
  lodash@4.18.1
```

Then other direct packages only when audit or changelog gives reason. Avoid
cosmetic mass bump.

Lodash can later disappear entirely. Current use is only `isUndefined`:

```ts
value === undefined;
```

Remove dependency in separate tiny commit after tests prove equivalent behavior.

### 3.4 Reclassify build-only packages

`sass` and `node-gyp` are build requirements, not runtime application
dependencies. Move them to `devDependencies` after Docker build proves native
`node-pty` still compiles.

Do not merely move manifest entries while runtime image still copies full build
`node_modules`. Pair with Phase 4 image pruning.

### 3.5 Compatible dependency acceptance gate

- No known high advisory in reachable Express or Socket.IO request path.
- Remaining audit findings listed with package path and reason.
- Full tests pass.
- Production build passes.
- Docker image starts.
- Memory and reconnect smoke checks pass.

Audit count need not become zero immediately. Reachability and package path
matter. No unexplained high finding accepted.

## Phase 4: prune runtime image

Current Dockerfile copies full build dependency tree into runtime image. Build
tools remain installed as Node packages even though Alpine compiler packages
stay behind.

### 4.1 Move build packages

Move direct build-only packages:

```text
sass
node-gyp
```

Confirm no runtime source imports them.

### 4.2 Prune after build

Minimal Dockerfile pattern:

```dockerfile
FROM node:20-alpine AS build
RUN apk add --no-cache build-base python3 py3-setuptools make g++ git
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.browser.json tsconfig.node.json build.js ./
RUN pnpm install --frozen-lockfile

COPY src ./src
RUN pnpm run build
RUN pnpm prune --prod

FROM node:20-alpine AS runtime
RUN apk add --no-cache openssh-client
WORKDIR /app

ENV NODE_ENV=production \
    BASE=/ \
    PORT=3001 \
    TITLE=Terminal \
    SSHAUTH=publickey \
    SSHKEY=/run/terminal-ssh/id_ed25519 \
    KNOWNHOSTS=/run/terminal-ssh/known_hosts

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build

EXPOSE 3001
CMD ["node", "build/main.js"]
```

If `pnpm prune --prod` breaks native `node-pty`, use separate
production-dependency stage and rebuild `node-pty` there. Do not copy compiler
toolchain into runtime.

### 4.3 Image checks

```bash
docker build -t terminal-cactuz:pruned .
docker run --rm terminal-cactuz:pruned node -e "require('node-pty')"
docker image inspect terminal-cactuz:baseline --format '{{.Size}}'
docker image inspect terminal-cactuz:pruned --format '{{.Size}}'
```

Start full container with read-only mounts. Verify SSH PTY creation, not only
module import.

Acceptance:

- No compiler packages in runtime layer.
- No dev dependencies in runtime `node_modules`.
- `node-pty` loads and spawns.
- App starts under non-interactive Compose path.
- Runtime audit improves or remaining build-only findings disappear.

## Phase 5: deliberate major migrations

Security and compatible updates may ship before this phase. Major migrations are
not blockers unless remaining advisory requires one.

One branch and deployment per subsection.

### 5.1 Move runtime to Node 22.12+

Required eventually by `file-type` 22 and yargs 18.

Change:

```json
"engines": {
  "node": ">=22.12.0"
}
```

Docker stages:

```dockerfile
FROM node:22-alpine AS build
...
FROM node:22-alpine AS runtime
```

CI matrix before cutover:

```yaml
strategy:
  matrix:
    node: [20, 22]
```

After Node 22 production smoke passes, remove Node 20 support and matrix entry.

Acceptance:

- Native `node-pty` builds on Node 22 Alpine.
- PTY open, resize, input, exit pass.
- Memory baseline near Node 20 result.
- Signal shutdown disposes sessions.
- Docker restart policy behaves unchanged.

### 5.2 Express 5 and middleware majors

Target set:

```json
{
  "dependencies": {
    "compression": "^1.8.1",
    "express": "^5.2.1",
    "express-winston": "^4.2.0",
    "helmet": "^8.3.0",
    "serve-static": "^2.2.1"
  },
  "devDependencies": {
    "@types/compression": "^1.8.1",
    "@types/express": "^5.0.6",
    "@types/serve-static": "^2.2.0"
  }
}
```

Delete `@types/helmet`; Helmet ships types.

Current route syntax should remain valid. Main risk: configurable `BASE`, static
MIME changes, Helmet defaults.

Validate base before route registration:

```ts
if (!/^\/(?:[A-Za-z0-9._~-]+\/?)*$/.test(base)) {
  throw new Error(`Invalid server base path: ${base}`);
}
```

Use Helmet types instead of `Record<string, unknown>`:

```ts
import helmet from 'helmet';
import type { HelmetOptions } from 'helmet';

const args: HelmetOptions = {
  referrerPolicy: { policy: ['no-referrer-when-downgrade'] },
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", `ws://${host}`, `wss://${host}`],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'none'"],
    },
  },
  xFrameOptions: allowIframe ? false : { action: 'sameorigin' },
};
```

Run dependency declaration check once without hidden library errors:

```bash
corepack pnpm exec tsc -p tsconfig.node.json --noEmit --skipLibCheck false
```

Regression gates:

- Root, base-path, target, push, metrics, static, favicon routes.
- Query preservation and local redirects.
- CSP exact directives.
- `allowIframe=false` sends `X-Frame-Options: SAMEORIGIN`.
- `allowIframe=true` omits it.
- Service worker, manifest, fonts, blob downloads load.
- No browser CSP errors.
- Gzip/Brotli behavior tested.
- One request creates one structured log entry.

Do not combine Express 5 with xterm 6.

### 5.3 xterm 6 atomic family migration

Update core, headless, all addons together:

```json
{
  "@xterm/xterm": "^6.0.0",
  "@xterm/headless": "^6.0.0",
  "@xterm/addon-fit": "^0.11.0",
  "@xterm/addon-image": "^0.9.0",
  "@xterm/addon-search": "^0.16.0",
  "@xterm/addon-serialize": "^0.14.0",
  "@xterm/addon-unicode11": "^0.9.0",
  "@xterm/addon-web-links": "^0.12.0",
  "@xterm/addon-webgl": "^0.19.0"
}
```

Likely APIs remain source-compatible. Real risk lives in rendering and mobile
scrolling.

xterm 6 changes scroll-container internals. Current CSS targets
`.xterm-viewport`. New likely selector:

```scss
.xterm .xterm-scrollable-element {
  touch-action: pan-y;
}
```

Avoid hiding scrollbar through private DOM if theme supports it:

```ts
const THEME = {
  // existing colors
  scrollbarSliderBackground: 'transparent',
  scrollbarSliderHoverBackground: 'transparent',
  scrollbarSliderActiveBackground: 'transparent',
};
```

Do not preserve old Alt+arrow translation automatically. First record emitted
bytes and resulting behavior.

| Physical keys      | xterm 5.5 macOS | xterm 5.5 Windows/Linux | xterm 6 all OS |
| ------------------ | --------------- | ----------------------- | -------------- |
| Option/Alt+Left    | `ESC b`         | `ESC [1;5D`             | `ESC [1;3D`    |
| Option/Alt+Right   | `ESC f`         | `ESC [1;5C`             | `ESC [1;3C`    |
| Ctrl+Left          | `ESC [1;5D`     | same                    | same           |
| Ctrl+Right         | `ESC [1;5C`     | same                    | same           |
| Option/Alt+Up/Down | `ESC [1;3A/B`   | `ESC [1;5A/B`           | `ESC [1;3A/B`  |
| Ctrl+Up/Down       | `ESC [1;5A/B`   | same                    | same           |

Test protocol before deciding compatibility code:

1. Capture current xterm 5 bytes on Mac Chrome and Safari.
2. Capture xterm 6 bytes on experimental branch.
3. Capture non-Mac xterm 6 bytes in Linux browser test.
4. Check behavior in Bash/Zsh prompt, tmux, vim, and Claude Code.
5. Decide whether to preserve exact xterm 5 behavior, preserve only left/right
   word jumps, or accept xterm 6 standard behavior.
6. Pin chosen behavior with custom-key tests.

No Alt/Option compatibility handler lands before this decision.

Automated gates:

- Full `sessions.spec.ts` snapshot and alternate-buffer tests.
- Search next/previous.
- Serialize and replay.
- Resize.
- WebGL context loss fallback.
- Image addon malformed input does not crash.

Required physical browser gates:

- Android Chrome touch scroll.
- iOS Safari touch scroll.
- tmux mouse mode.
- `vim`, `less`, `htop`, Claude Code.
- 5,000-line scrollback.
- Soft keyboard Ctrl+C and Shift+Tab.
- Physical Alt+arrow and Alt+f/Alt+b.
- Background, reconnect, replay.

No jsdom test can certify viewport behavior. Mobile check blocks deployment.

### 5.4 `file-type` 22 migration

Requires Node 22 and async API.

Current:

```ts
import fileType from 'file-type';
const typeData = fileType(bytes);
```

Target:

```ts
import { fileTypeFromBuffer } from 'file-type';

type OnCompleteFile = (bufferCharacters: string) => void | Promise<void>;

async function onCompleteFile(bufferCharacters: string): Promise<void> {
  // existing decode logic
  const typeData = await fileTypeFromBuffer(bytes);
  // existing MIME, filename, Blob, safe toast logic
}
```

Keep terminal buffer processing synchronous. Fire completed-file work without
blocking terminal stream:

```ts
void this.onCompleteFileCallback(
  this.fileBuffer
    .slice(this.fileBegin.length, this.fileBuffer.length - this.fileEnd.length)
    .join(''),
);
```

Browser TypeScript may need:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

Apply only to `tsconfig.browser.json` first. Do not change server resolution
without compiler evidence.

Test async completion:

```ts
it('does not delay terminal output while file detection completes', async () => {
  let completed = '';
  let finish!: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });

  const downloader = new FileDownloader(
    async (data) => {
      await Promise.resolve();
      completed = data;
      finish();
    },
    'BEGIN',
    'END',
  );

  expect(downloader.buffer('leftBEGINfileENDright')).to.equal('leftright');
  await done;
  expect(completed).to.equal('file');
});
```

Also test PNG signature detection and malicious filename XSS regression.

### 5.5 CLI and path dependencies

#### Remove `find-up`

Prefer stdlib over migrating dependency. Verify path depth in source and
compiled layouts:

```ts
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const filePath = fileURLToPath(new URL('../../../../', import.meta.url));

export const assetsPath = (...args: string[]) =>
  resolve(filePath, 'build', ...args);
```

Before adopting fixed depth, test both ts-node source and compiled
`build/server/socketServer/shared/path.js`. If depth differs, keep `find-up` and
migrate to `findUpSync`:

```ts
import { findUpSync } from 'find-up';
```

#### Upgrade yargs 18

Retain parser instance. Current `yargs.showHelp()` singleton call will break.

```ts
const cli = yargs(hideBin(process.argv))
  .scriptName(packageJson.name)
  // existing options
  .conflicts('host', 'socket')
  .conflicts('port', 'socket');

const opts = cli.parseSync();

if (opts.help) {
  cli.showHelp();
  process.exitCode = 0;
}
```

CLI gates:

```bash
node build/main.js --help
node build/main.js --version
node build/main.js --port not-a-number
node build/main.js --port 3001 --socket /tmp/cactuz.sock
```

Expected:

- Help and version exit 0 without starting server.
- Invalid number exits nonzero.
- Port/socket conflict exits nonzero.

#### Upgrade prom-client 15

Current APIs appear compatible. Separate commit, no planned source changes.

Test `/metrics` content type and key metrics:

```text
cactuz_socket_connections
cactuz_sessions
http_requests_total
http_request_duration_seconds
```

### 5.6 Major migration stop rule

After each subsection:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm audit --prod
docker build -t terminal-cactuz:<phase> .
```

Build and test each major checkpoint separately. Do not deploy production until
aggregate candidate passes. Any regression reverts only affected checkpoint.

## Phase 6: release metadata

Skip OSC browser title synchronization. Skip Docker CLI `ENTRYPOINT` forwarding.

After all dependency and code gates pass, set fork version:

```json
"version": "4.0.0"
```

Verify:

```bash
node build/main.js --version
```

Expected output: `4.0.0`.

## Regression matrix

Every production candidate gets relevant subset. Major migrations get full
matrix.

### Server and routing

- Root page.
- Configured base path.
- Known target.
- Unknown target 404.
- Local trailing-slash redirect with query.
- Protocol-relative redirect rejection.
- Static JS, CSS, fonts, icons.
- Favicon GET, HEAD, conditional 304.
- Manifest.
- Service worker scope and no-cache.
- Metrics.
- Push key, subscribe, unsubscribe.
- Malformed and oversized JSON.

### Security headers and boundaries

- Cloudflare Access unauthenticated request returns redirect or denial, never
  public 200.
- Authenticated request carries expected identity.
- App remains bound to `127.0.0.1:3001` on Reactor.
- SSH key, known_hosts, targets mounts remain read-only.
- CSP has no unsafe script.
- Frame policy matches setting.
- Download filename stays text.
- Redirect stays same-origin.
- No secret values printed by verification commands.

### SSH and sessions

- Reactor key auth and host-key check.
- Raspik key auth and host-key check.
- Raspik4b only if still supported.
- PTY spawn.
- Input and output.
- Resize.
- Four tabs.
- Session cap.
- Detach grace period.
- Snapshot replay.
- Output while disconnected.
- Alternate screen replay.
- Explicit end session.
- New instance behavior.
- tmux reconnect after app container replacement.
- Plain-shell fallback when tmux disabled.

### Client and mobile

- Initial font-ready fit.
- Orientation change.
- Virtual keyboard open/close.
- Sticky Ctrl, Alt, Shift.
- Arrow keys under DECCKM.
- Physical keyboard.
- Touch scroll in shell.
- Touch scroll in tmux mouse application.
- Search.
- Clipboard copy/paste.
- OSC 52.
- File download.
- WebGL context loss fallback.
- Sixel optional path.
- PWA install.
- Service worker update.
- Push bell while detached.

### Observability

- One access log per request.
- Socket connect/disconnect identity.
- Session spawn and exit duration.
- No restart loop.
- No `Attach failed` spike.
- No `failedToConnect=true` for healthy targets.
- Memory settles after session disposal.
- Metrics reset expected after container restart.

## Canary deployment

Run on Reactor. Never print `.env`, unrestricted `docker inspect`, or tunnel
token.

### Build exact candidate

```bash
ssh reactor
cd /home/vaniok56/Desktop/terminal-cactuz

REV=$(git rev-parse HEAD)
CANDIDATE="terminal-cactuz:${REV}"

docker build \
  --label "org.opencontainers.image.revision=$REV" \
  --tag "$CANDIDATE" \
  .
```

Gate:

```bash
docker image inspect \
  --format '{{.Id}} {{.Architecture}} {{index .Config.Labels "org.opencontainers.image.revision"}}' \
  "$CANDIDATE"
```

Expected architecture: `amd64`. Revision label must equal reviewed commit.

### Production preflight

```bash
docker ps --filter name='^/terminal-cactuz$' --filter name='^/terminal-tunnel$'
docker port terminal-cactuz
curl --fail --silent http://127.0.0.1:3001/ >/dev/null
curl --fail --silent http://127.0.0.1:3001/metrics >/dev/null
```

Inspect mounts without environment:

```bash
docker inspect terminal-cactuz \
  --format '{{range .Mounts}}{{println .Source "->" .Destination "rw=" .RW}}{{end}}'
```

Gate:

- App and tunnel running.
- App port bound only to `127.0.0.1:3001`.
- Secret and config mounts show `rw=false`.
- Root and metrics return 200.
- Enough disk for candidate and rollback image.

### Session preflight

Read active count:

```bash
curl --fail --silent http://127.0.0.1:3001/metrics |
  awk '$1 == "cactuz_sessions" {print $2}'
```

Preferred deployment gate: zero live sessions.

If nonzero:

- Confirm each important target has tmux.
- Warn active user.
- Expect browser attachment and server-side scrollback loss.
- Remote tmux process should survive.

### Run canary on port 3002

```bash
APP=/home/vaniok56/Desktop/terminal-cactuz
CANARY=terminal-cactuz-canary

docker rm -f "$CANARY" 2>/dev/null || true

docker run --detach \
  --name "$CANARY" \
  --restart no \
  --publish 127.0.0.1:3002:3001 \
  --env TARGETS_FILE=/run/terminal-targets.json5 \
  --mount type=bind,src="$APP/secrets/id_ed25519",dst=/run/terminal-ssh/id_ed25519,readonly \
  --mount type=bind,src="$APP/secrets/known_hosts",dst=/run/terminal-ssh/known_hosts,readonly \
  --mount type=bind,src="$APP/conf/targets.json5",dst=/run/terminal-targets.json5,readonly \
  "$CANDIDATE"
```

Check:

```bash
curl --fail --silent http://127.0.0.1:3002/ >/dev/null
curl --fail --silent http://127.0.0.1:3002/metrics >/dev/null
docker inspect "$CANARY" --format '{{.State.Status}} restarts={{.RestartCount}}'
docker logs --since 5m "$CANARY"
```

SSH probe through canary identity:

```bash
docker exec "$CANARY" ssh \
  -F /dev/null \
  -i /run/terminal-ssh/id_ed25519 \
  -o IdentitiesOnly=yes \
  -o BatchMode=yes \
  -o UserKnownHostsFile=/run/terminal-ssh/known_hosts \
  -o StrictHostKeyChecking=yes \
  vaniok56@192.168.100.51 true
```

Canary warning: production and canary use same remote tmux names. Do not click
"New instance". It can kill production tmux session.

Stop canary before production replacement:

```bash
docker rm -f "$CANARY"
```

## Production deployment

### Preserve rollback image

```bash
PROD_IMAGE=$(docker inspect terminal-cactuz --format '{{.Config.Image}}')
CURRENT_ID=$(docker inspect terminal-cactuz --format '{{.Image}}')
ROLLBACK="terminal-cactuz:rollback-$(date -u +%Y%m%dT%H%M%SZ)"

docker image tag "$CURRENT_ID" "$ROLLBACK"
docker image inspect "$CANDIDATE" "$ROLLBACK" >/dev/null
```

### Replace app only

```bash
docker image tag "$CANDIDATE" "$PROD_IMAGE"

docker compose up \
  --detach \
  --no-deps \
  --no-build \
  --force-recreate \
  terminal-cactuz
```

Do not restart `terminal-tunnel`.

### Local origin gate

```bash
for attempt in 1 2 3 4 5 6; do
  curl --fail --silent http://127.0.0.1:3001/ >/dev/null && break
  sleep 5

curl --fail --silent http://127.0.0.1:3001/reactor >/dev/null
curl --fail --silent http://127.0.0.1:3001/metrics >/dev/null
docker inspect terminal-cactuz --format '{{.State.Status}} restarts={{.RestartCount}}'
```

### Edge and browser gate

Unauthenticated edge check:

```bash
curl --silent --show-error --output /dev/null \
  --write-out '%{http_code}\n' \
  https://terminal.example.com/
```

Expected Cloudflare Access response: 302 or 403. Public 200 is security stop.

Authenticated browser:

1. Open home.
2. Confirm expected targets.
3. Open existing Reactor tab.
4. Run harmless marker: `printf 'deploy-smoke\n'`.
5. Disconnect and reconnect.
6. Confirm same tmux shell.
7. Open Raspik.
8. Confirm logs show authenticated email, not `local`.
9. Test phone keyboard and touch scroll for xterm changes.

### Observe

Minimum observation: 15 minutes for security and compatible updates; longer for
xterm, Socket.IO, Node, or Express major changes.

```bash
docker logs --follow --since 5m terminal-cactuz
```

Separate shell:

```bash
docker logs --follow --since 5m terminal-tunnel
```

Check resources:

```bash
docker stats --no-stream terminal-cactuz terminal-tunnel
docker inspect terminal-cactuz terminal-tunnel \
  --format '{{.Name}} status={{.State.Status}} restarts={{.RestartCount}}'
```

Rollback triggers:

- Local origin fails.
- Cloudflare returns 502.
- Access becomes public.
- Authenticated identity becomes `local`.
- Websocket cannot attach.
- SSH host-key or key auth fails.
- Container restart count rises.
- Reconnect duplicates or loses new output.
- Mobile terminal cannot scroll or type control keys.
- Memory climbs without settling.

## Rollback

```bash
docker image tag "$ROLLBACK" "$PROD_IMAGE"

docker compose up \
  --detach \
  --no-deps \
  --no-build \
  --force-recreate \
  terminal-cactuz
```

Verify:

```bash
test \
  "$(docker inspect terminal-cactuz --format '{{.Image}}')" = \
  "$(docker image inspect "$ROLLBACK" --format '{{.Id}}')"

curl --fail --silent http://127.0.0.1:3001/ >/dev/null
docker logs --since 5m terminal-cactuz
```

Repeat authenticated Reactor and Raspik checks. Rollback causes another
in-memory session reset. Remote tmux should survive.

## Integration order

One integration branch, small reviewable commits, one production deployment
after all gates pass:

1. CI parity.
2. Code security fixes and strict SSH host-key policy.
3. Express 4 patch stack.
4. Socket.IO 4.8.3 stack.
5. Compatible runtime updates.
6. Runtime image prune.
7. Node 22.
8. Express 5.
9. xterm 6.
10. `file-type` 22.
11. CLI/path dependency work.
12. Set version 4.0.0.
13. Full aggregate test and canary.
14. Ask for production approval.
15. One production deployment.

Each step remains independently revertible before release. If urgent security
exposure changes, security fixes may split into earlier production release after
explicit decision.

## Completion criteria

- No bulk upstream merge.
- Security regression tests fail on old code and pass on fixed code.
- No unexplained high-severity reachable production advisory.
- CI uses frozen pnpm 9 lock install.
- CI builds root production Dockerfile.
- Runtime image excludes build-only packages.
- Every major migration has own commit and test checkpoint. Aggregate candidate
  gets canary, production deployment, and rollback image.
- Reactor and Raspik SSH paths work with strict host-key checking.
- Cloudflare Access stays enforced.
- Session reconnect and tmux persistence work.
- Android and iOS terminal checks pass after xterm changes.
- amd64 native and arm64 QEMU PTY tests pass.
- `node build/main.js --version` reports `4.0.0`.
- Worktree clean and deployed image tied to reviewed Git commit.

## Deferred decisions

Track separately:

- Multi-user-safe remote tmux names, only if trusted shared sessions stop being
  acceptable.
- Removal of decommissioned Raspik4b from repo examples; live Reactor removal is
  approved.
- Physical arm64 runtime validation beyond QEMU.
- Old versus standard Alt+arrow behavior under xterm 6.

Do not let deferred decisions block urgent security patches.
