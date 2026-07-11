# Start here

Short version of what to do. Do steps 1–3. The rest is optional.

---

## 1. Install tmux on each machine

This is the one thing that makes sessions survive everything — the container
restarting, the network dropping, your phone dying.

SSH into each Pi and run:

```bash
sudo apt update && sudo apt install -y tmux
```

Do it on all three:

| slug       | address           | user       |
|------------|-------------------|------------|
| `raspik4b` | `192.168.100.105` | `raspik4b` |
| `raspik`   | `192.168.100.51`  | `vaniok56` |
| `reactor`  | `192.168.100.129` | `vaniok56` |

**If you skip this, nothing breaks.** The app checks for tmux and falls back to
a normal login shell. You still get reconnect and screen restore. You just lose
sessions when the container restarts.

To check later, from the Pi itself:

```bash
tmux ls
# cactuz-raspik-0: 1 windows (created ...)
```

That's your terminal, still running, waiting for you.

---

## 2. Rotate the Cloudflare tunnel token

The token in `.env` is the **only** thing between the internet and a root shell
on your Pis. It has been sitting in a plaintext file, and it is in this zip.

1. Go to Cloudflare Zero Trust → Networks → Tunnels
2. Find your tunnel → **Refresh token** (or delete and recreate it)
3. Paste the new token into `.env`:

```
TUNNEL_TOKEN=<new token>
```

4. `docker compose up -d`

---

## 3. Deploy

From the project folder:

```bash
docker compose up -d --build
docker compose logs -f terminal-cactuz
```

Wait for `Server started`. Open `https://terminal.cactuz.icu` on your phone.

If it doesn't build, you need `pnpm`:

```bash
npm install -g pnpm@9
```

---

## 4. Add it to your home screen

Do this. It removes the browser's URL bar and toolbar, which is about 110
pixels of terminal you get back. It is also **required** for notifications on
iPhone.

- **Android / Chrome**: menu (⋮) → *Add to Home screen* → *Install*
- **iPhone / Safari**: share button → *Add to Home Screen*

Open it from the icon, not from the browser.

---

## 5. Turn on notifications

The first time you tap the terminal, the phone asks for notification
permission. Say yes.

Now: start something long, lock your phone, walk away. When the terminal rings
its bell — which Claude Code does when it finishes — your phone buzzes.

If you said "no" by accident, clear the site permissions in your browser
settings and reload.

---

## Using the keyboard

The bar sits above your normal keyboard. It never goes away.

**Ctrl, Alt, Shift are sticky:**

| You do          | What happens                                  |
|-----------------|-----------------------------------------------|
| tap once        | armed — outlined. Applies to the **next** key |
| tap twice fast  | locked — filled in. Stays until you tap it off |
| tap again       | off                                            |

So **Ctrl+C** is: tap `Ctrl`, then tap `c` on your normal keyboard.

Tap the `⋯` key on the right to open the second row: Home, End, PgUp, PgDn,
F1–F12, and one-tap `^C` `^D` `^Z` `^L` `^R`, plus Paste, Copy, Find, font
size, and **End session**.

Other things:

- **Scroll** — swipe up and down, like anything else (needs tmux on the machine)
- **Select & copy** — press and hold, then drag over the text.
  - On **Chrome or Firefox** (Android, and any computer) it copies to your
    clipboard the moment you let go.
  - On an **iPhone/iPad** (any browser — they're all Safari underneath, which
    won't let a page copy on its own), drag to select, then tap `Copy`.
  - On a **computer**, just drag with the mouse. To copy the old-fashioned way
    instead (select, then Cmd/Ctrl+C), hold **Shift** (or **⌥ Option** on a Mac)
    while dragging.
- **Paste** — tap `Paste`
- **Font size** — tap `A−` / `A+`, or pinch
- **Tabs** — the `1 2 3 4` buttons, top right. Four separate shells per machine.
  A green dot means that tab has a session running

---

## What "session survives" actually means

Type a command. Lock your phone. Go make coffee. Come back an hour later, open
the app.

You land in the same shell. The output that appeared while you were gone is
there. Your half-typed command is still half-typed.

The session is remembered by **who you are + which machine + which tab number**.
So tab 2 on `reactor` is always the same shell, from any device.

A session you walk away from is kept for **12 hours**, then cleaned up. Change
that in `.env`:

```
SESSION_GRACE_MINUTES=720
```

To kill a session on purpose: keybar → `⋯` → **End session**.

---

## Adding a new machine

1. Add a line to `conf/targets.json5`:

```json5
{ slug: 'newbox', name: 'New Box', host: '192.168.100.X', user: 'youruser', port: 22 },
```

2. Let the app trust the host, and let the host trust the app:

```bash
ssh-keyscan -p 22 192.168.100.X >> ./secrets/known_hosts
```

Then on the new machine:

```bash
echo "<paste contents of ./secrets/id_ed25519.pub>" >> ~/.ssh/authorized_keys
sudo apt install -y tmux
```

3. Restart. No rebuild needed:

```bash
docker compose restart terminal-cactuz
```

The app refuses to start if `targets.json5` is wrong, and tells you exactly
what's wrong. Typos like `prot` instead of `port` are caught.

---

## When something is broken

**Page says "Reconnecting…"** — normal. Your phone dropped the connection. It
comes back on its own. Your session is fine.

**Page says "Session ended."** — the shell actually exited, or 12 hours passed.
Tap `reconnect` to start a fresh one.

**Page says "Host unreachable" / "SSH rejected"** — tap `details` to see exactly
what ssh said.

**Nothing loads at all:**

```bash
docker compose logs -f terminal-cactuz
```

**Keyboard covers the terminal** — you're in the browser, not the installed app.
See step 4.

---

## For later

- `.attic/` holds every file from before the rewrite, paths preserved. Restore
  any one with `mv .attic/<path> <path>`. **Delete the folder once you're happy.**
- `docs/` is leftover documentation from upstream WeTTY. Most of it is wrong now.
- `README.md` explains how the persistence actually works, if you're curious.
- `.env.example` documents every knob, with comments.

Run the tests any time — one of them genuinely starts a shell, walks away,
comes back, and checks the output is still there:

```bash
pnpm install
pnpm test
```
