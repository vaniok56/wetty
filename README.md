# terminal-cactuz

A web terminal for `terminal.cactuz.icu`, built for using a phone as a real
terminal. Originally a `WeTTY` fork, now substantially rewritten.

Two things make it different from a normal browser terminal:

- **Sessions outlive the socket.** Lock your phone, come back an hour later, and
  the session is where you left it — including output printed while you were
  away. Nothing is lost because the websocket died.
- **The keyboard works.** Ctrl, Alt and Shift are sticky on-screen modifiers
  applied to the character stream, so `Ctrl+C` and `Shift+Tab` work on Android
  and iOS, where physical key events never carry the character.

## Behaviour

- `/` lists every machine defined in `conf/targets.json5`
- `/<slug>` opens an SSH terminal to that machine, in one of 4 tabs
- the whole site sits behind Cloudflare Access
- access and session metadata are logged to stdout; Prometheus metrics at `/metrics`

## How persistence works

A terminal session is keyed by **(who, which host, which tab)** — not by socket
id, and not by a token in local storage. Reconnecting from anywhere lands you in
the same session, and one user can never reach another's shell.

There are two independent layers, and you want both:

1. **A server-side session registry.** The PTY is decoupled from the websocket.
   When your socket dies the process keeps running; the server keeps feeding its
   output into a headless `xterm` instance that acts as the canonical terminal
   state. On reattach it serialises that state and the browser rebuilds from it.

   This matters because replaying the raw byte stream into a fresh terminal is
   *wrong* — the stream may have switched to the alternate screen buffer, or
   positioned the cursor against scrollback that has since been pruned. This is
   the same design VS Code's pty host uses.

2. **tmux on the remote.** Each tab attaches to `tmux new-session -A -s
   cactuz-<slug>-<tab>`. That is what survives *this* server restarting, or the
   network dropping entirely. If tmux is not installed on a host we fall back to
   a plain login shell — you keep reconnect and snapshot replay, you just lose
   survival across a container restart.

A detached session is held for `SESSION_GRACE_MINUTES` (default 12h) and then
reaped. Ending a session deliberately is the `End session` key in the keybar.

## The keybar

Modifiers are **sticky**, Termux-style:

| Interaction  | Result                                     |
|--------------|--------------------------------------------|
| tap          | armed — applies to the next key only       |
| tap twice    | locked — stays until tapped off (filled)   |
| tap again    | off                                        |

They are applied at the **data layer**, not by synthesising key events. On
Android the soft keyboard routes text through the IME, so `keydown` reports
`keyCode: 229` / `key: "Unidentified"` and the character is simply not knowable
at key-event time. It only exists in the data stream. That is why the old
"sticky flag + keyup" approach could never work on a phone.

Arrow keys honour the terminal's DECCKM state, so they keep working inside `vim`
and `less`. Every escape sequence is pinned by tests in
`src/client/app/keys.spec.ts`.

## Notifications

If VAPID keys are configured, a bell (`\a`) from a session that nobody is
watching sends a Web Push notification. Claude Code rings the bell when it
finishes, which is the whole point: start something, lock the phone, get told
when it wants you.

Add the app to your home screen for this to work on iOS.

## Adding a machine

`conf/targets.json5` is the **only** place machines are defined. Invalid config
stops the app on boot (check logs).

**Step 1** — append an entry:

```json5
{ slug: 'newbox', name: 'New Box', host: '192.168.100.X', user: 'youruser', port: 22 },
```

**Step 2** — SSH access (once per machine):

```bash
# collect the host's public key so the app trusts it
ssh-keyscan -p 22 192.168.100.X >> ./secrets/known_hosts

# on the remote machine: add the app's public key
echo "<contents of ./secrets/id_ed25519.pub>" >> ~youruser/.ssh/authorized_keys

# optional but recommended, for session persistence across restarts
sudo apt install tmux
```

**Step 3** — restart (no rebuild):

```bash
docker compose restart terminal-cactuz
```

### Machine entry schema

| Field  | Required | Type    | Rules                                                              |
|--------|----------|---------|--------------------------------------------------------------------|
| `slug` | yes      | string  | `^[a-z0-9][a-z0-9-]*$`; unique; not `client`, `metrics`, `ssh`, `favicon.ico` |
| `name` | yes      | string  | display label shown on the home page                               |
| `host` | yes      | string  | IP address or hostname                                             |
| `user` | yes      | string  | SSH login username                                                 |
| `port` | no       | integer | 1–65535; defaults to 22                                            |
| `tmux` | no       | boolean | defaults to `true`                                                 |

Unknown fields (e.g. `prot` instead of `port`) are rejected at startup.

## Local development

Node 20+. `node-pty` is compiled natively, so a toolchain is required.

```bash
pnpm install
pnpm build       # typecheck + bundle; type errors fail the build
pnpm test        # 131 tests, incl. real PTY session persistence
pnpm lint
pnpm dev         # watch mode
pnpm icons       # regenerate PWA icons
```

Tests spawn real PTYs. `src/server/sessions.spec.ts` verifies the headline
behaviour directly: run a command, detach, wait, reattach, and assert that
output produced while detached is present in the replayed snapshot.

## Deploy

1. Copy `.env.example` to `.env` and fill it in
2. Edit `conf/targets.json5` to list your machines
3. Put the SSH key and known-hosts file in `./secrets`:
   - `./secrets/id_ed25519`
   - `./secrets/known_hosts`

To enable push notifications, generate a VAPID keypair and put it in `.env`:

```bash
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

Bring it up:

```bash
docker compose up -d --build
docker compose logs -f terminal-cactuz
```

Every tunable is in `.env.example`, with comments.

## SSH setup

The app never prompts for passwords; it expects key-based SSH and passes
`BatchMode=yes` so a failed key fails fast rather than hanging a PTY nobody is
watching.

```bash
ssh-keyscan -p 22 192.168.100.105 >> ./secrets/known_hosts   # raspik4b
ssh-keyscan -p 22 192.168.100.51  >> ./secrets/known_hosts   # raspik
ssh-keyscan -p 22 192.168.100.129 >> ./secrets/known_hosts   # reactor
```

## Cloudflare

Tunnel route:

- hostname: `terminal.cactuz.icu`
- service: `http://terminal-cactuz:3001`

Protection:

- one Cloudflare Access app for the entire site
- `Cf-Access-Authenticated-User-Email` identifies the user, and is what sessions
  are keyed on

> **The tunnel is the security boundary.** The server binds to `127.0.0.1` and
> trusts the `Cf-Access-Authenticated-User-Email` header without verifying the
> `Cf-Access-Jwt-Assertion` JWT. Anything that can reach port 3001 directly gets
> a shell. Do not expose it.

## Layout

```
src/
  server/
    sessions.ts     session registry: PTY + headless xterm + snapshot replay
    command.ts      ssh argv and the tmux attach-or-create wrapper
    push.ts         web push (VAPID), fired on a bell with nobody watching
    targets.ts      strict validation of conf/targets.json5
  client/
    app/keys.ts     escape sequences and modifier folding (pure, well tested)
    app/keybar.ts   the docked bar and its sticky modifier state machine
    app/viewport.ts visualViewport handling; why the page no longer slides up
    app/session.ts  socket, reconnect, snapshot resync
    app/touch.ts    scroll, long-press selection, pinch-to-zoom
```

`.attic/` holds the pre-rewrite files, preserved rather than deleted. Delete it
once you are happy.
