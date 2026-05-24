# terminal-cactuz

Browser terminal for `terminal.cactuz.icu`, based on a custom `WeTTY` fork.

## Behavior

- `/` shows two host buttons:
  - `raspik4b`
  - `raspik`
- `/raspik4b` opens SSH terminal to Pi 4B
- `/raspik` opens SSH terminal to Pi Zero
- whole site is meant to sit behind Cloudflare Access
- app logs access/session metadata to stdout
- sessions auto-disconnect after 30 minutes of inactivity

## Local development

This repo was verified locally with Node 20.

```bash
PATH=/private/tmp/node20/node-v20.20.2-darwin-arm64/bin:$PATH npm test -- --reporter dot
PATH=/private/tmp/node20/node-v20.20.2-darwin-arm64/bin:$PATH npm run build
```

## Deploy

1. Copy `.env.example` to `.env`
2. Set target host/user values
3. Put SSH key + known hosts file in `./secrets`

Expected files:

- `./secrets/id_ed25519`
- `./secrets/known_hosts`

Bring it up:

```bash
docker compose up -d --build
docker compose logs -f terminal-cactuz
```

## SSH setup

Recommended model:

- generate dedicated keypair for this app
- add public key to:
  - `raspik4b` user `authorized_keys`
  - `raspik` user `authorized_keys`
- collect both host keys into `./secrets/known_hosts`

The app does not prompt for passwords. It expects key-based SSH.

## Cloudflare

Recommended tunnel route:

- hostname: `terminal.cactuz.icu`
- service: `http://terminal-cactuz:3000`

Recommended protection:

- one Cloudflare Access app for entire site
- use `Cf-Access-Authenticated-User-Email` header for audit logs
