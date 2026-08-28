# Upstream audit

## Purpose and method

This ledger audits all 90 upstream-only commits from merge base
`0ec642a27302bb4c53244715e089e12a7fefe199` through `upstream/main` at
`374593d8b5465a841d150f276d520a4e27632789`, in
`git rev-list --reverse HEAD..upstream/main` order. Fork baseline is feature
HEAD `ebefb4e`; evidence also includes intentional maintenance edits currently
in the worktree. Each upstream diff was compared with current source,
configuration, dependency versions, and pinned workflows.

## Dispositions

- `ported`: upstream behavior or exact dependency/action version is present.
- `superseded`: fork has a newer version or a different implementation covering
  the same need.
- `irrelevant`: change targets removed architecture, tooling, publishing, or an
  explicitly rejected feature.
- `missing`: applicable change has no fork equivalent. Final count: zero.

## Scope decisions

- Runtime and production security are in scope. `corepack pnpm audit --prod`
  reports no known vulnerabilities. Full dev audit debt is not
  production-reachable and is outside this runtime-focused sync.
- Public npm, GitHub Package, release, and Docker publishing were removed. Their
  metadata, login, semantic-release, commitlint, and Font Awesome changes are
  irrelevant. Docker build validation remains in scope; publishing-only zizmor
  permissions and secrets do not.
- Routine dev/build dependency bumps are not a latest-version sweep. Removed
  packages and deliberately retained tested dev-stack versions are irrelevant,
  even when versions differ. Runtime packages are compared directly.
- Fork targets Node 22, so Node 25/26 type bumps are irrelevant. Docker keeps
  `CMD`; CLI forwarding is not required. OSC-driven browser titles are
  intentionally excluded.
- `README.md` and terminal-cactuz configuration are authoritative. Old upstream
  login-route/default docs describe removed architecture. Fork's PWA and push
  implementation supersedes upstream's basic offline-shell PWA.

## Commit ledger

| Commit    | Disposition | Reason / evidence                                                                                                                                                                                                     |
| --------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ebda43f` | superseded  | terminal-cactuz 4.0 rewrite replaces upstream v3 runtime/config; release, semantic-release, commitlint, publishing, and Font Awesome portions are removed and irrelevant.                                             |
| `4583186` | irrelevant  | npm OIDC publishing and release credentials do not exist in this private, non-publishing fork.                                                                                                                        |
| `cf01576` | irrelevant  | Docker publishing and release workflow were removed; `.github/workflows/docker.workflow.yml` only validates images.                                                                                                   |
| `f88f0c9` | irrelevant  | Removed release workflow has no package-publishing permission to trim.                                                                                                                                                |
| `381daa6` | ported      | Current worktree deletes `.github/workflows/stale.yml`.                                                                                                                                                               |
| `04bf39c` | ported      | Current `.github/dependabot.yml` uses `chore(deps)` for npm/Docker and `ci(deps)` for Actions.                                                                                                                        |
| `7fd5cdb` | superseded  | Workflows pin `actions/checkout` 7.0.1, newer than upstream v6.                                                                                                                                                       |
| `7cae803` | superseded  | Current reusable Docker validation accepts one matrix platform and pins newer Docker actions; no publishing path remains.                                                                                             |
| `aa1dda5` | ported      | Applicable zizmor controls are present: explicit permissions, immutable action SHAs, and disabled checkout credentials. Cooldowns are in current Dependabot config; release/publishing secret changes are irrelevant. |
| `eefee75` | irrelevant  | Fork intentionally retains tested `lint-staged` 13.2.2; dev-only 17.0.5 bump is outside no-latest-sweep policy.                                                                                                       |
| `4abe9a6` | ported      | `package.json` has runtime `serve-static` 2.2.1 and `@types/serve-static` 2.2.0 exactly.                                                                                                                              |
| `faacbb7` | superseded  | Runtime `yargs` is 18.1.0, newer than upstream 18.0.0.                                                                                                                                                                |
| `5726caf` | superseded  | CodeQL is pinned to 4.37.6, newer than 4.35.5.                                                                                                                                                                        |
| `0b2ad81` | irrelevant  | Upstream moves Node types to 25.9.0; fork targets Node 22 and uses `@types/node` 22.20.1.                                                                                                                             |
| `278e204` | superseded  | `pnpm/action-setup` is pinned to 6.0.10, newer than 6.0.8.                                                                                                                                                            |
| `61d86ab` | irrelevant  | `docker/metadata-action` belonged to removed image-publishing path.                                                                                                                                                   |
| `c17f828` | superseded  | `actions/setup-node` is pinned to 7.0.0, newer than 6.4.0.                                                                                                                                                            |
| `4df117e` | irrelevant  | `docker/login-action` belonged to removed registry-publishing path.                                                                                                                                                   |
| `f59175b` | superseded  | Current CodeQL pin is 4.37.6, newer than upstream's v4 update.                                                                                                                                                        |
| `3f3de7d` | ported      | Current worktree gives both reusable-workflow callers explicit `contents: read`; publishing-only caller permission is not applicable.                                                                                 |
| `b7d590c` | irrelevant  | `find-up` and its upstream path lookup were removed in the fork rewrite.                                                                                                                                              |
| `c1c21cc` | ported      | Trailing-base normalization in `src/client/app/session.ts` uses non-empty `/\/+$/`, avoiding upstream's ReDoS pattern.                                                                                                |
| `4479247` | superseded  | `src/server/socketServer/middleware.ts` parses `req.url` with `URL`, enforces local origin, and rejects invalid targets with 400.                                                                                     |
| `21133cc` | irrelevant  | Explicit project decision keeps Docker `CMD ["node", "build/main.js"]`; forwarding arbitrary CLI flags is not required.                                                                                               |
| `8a66e8d` | superseded  | `README.md` and terminal-cactuz config describe target-slug routes and current defaults; upstream login/SSH routes were removed.                                                                                      |
| `386e432` | ported      | `src/client/app/download.ts` constructs a link node and assigns untrusted filename through `textContent`, never toast HTML.                                                                                           |
| `f364230` | irrelevant  | `docker/login-action` is absent because registry publishing was removed.                                                                                                                                              |
| `2310bed` | superseded  | Docker validation pins `docker/setup-buildx-action` 4.2.0, newer than 4.1.0.                                                                                                                                          |
| `f11c443` | superseded  | Docker validation pins `docker/setup-qemu-action` 4.2.0, newer than 4.0.0.                                                                                                                                            |
| `08585ed` | irrelevant  | Fork intentionally retains tested dev-only `jsdom` 16.5.0; upstream 29.1.1 is outside no-latest-sweep policy.                                                                                                         |
| `3a34a75` | irrelevant  | `docker/metadata-action` was removed with image publishing.                                                                                                                                                           |
| `cae606f` | irrelevant  | Fork intentionally retains tested dev-only `chai` 4.3.6; upstream 6.2.2 is outside no-latest-sweep policy.                                                                                                            |
| `66b6428` | superseded  | `src/client/app/pwa.ts`, dynamic manifest, base-aware routes, icons, network-only service worker, and Web Push form a richer custom PWA.                                                                              |
| `da98440` | superseded  | Docker validation pins `docker/build-push-action` 7.3.0, newer than 7.2.0.                                                                                                                                            |
| `4d79562` | superseded  | CodeQL is pinned to 4.37.6, newer than 4.36.0.                                                                                                                                                                        |
| `56cc3b3` | irrelevant  | Fork intentionally retains tested dev-only `concurrently` 8.2.2; upstream 10.0.0 is outside no-latest-sweep policy.                                                                                                   |
| `c64f0df` | irrelevant  | Fork intentionally retains tested dev-only `eslint-plugin-prettier` 4.2.1; 5.5.6 is outside no-latest-sweep policy.                                                                                                   |
| `17de05b` | irrelevant  | Fork intentionally retains tested dev-only `@types/jsdom` 12.2.4; 28.0.3 is outside no-latest-sweep policy.                                                                                                           |
| `a4838bf` | superseded  | Docker validation pins QEMU action 4.2.0, newer than 4.1.0.                                                                                                                                                           |
| `2a6671e` | irrelevant  | `actions/cache` step was removed from current build workflow.                                                                                                                                                         |
| `9d25750` | irrelevant  | Fork retains its tested TypeScript/ESLint dev stack; upstream `typescript-eslint` 8.60.1 is not a runtime change.                                                                                                     |
| `aef5b81` | irrelevant  | Fork intentionally retains build-only `esbuild` 0.21.5; upstream 0.28.1 is outside no-latest-sweep policy.                                                                                                            |
| `7e969fd` | irrelevant  | Fork retains dev-only `lint-staged` 13.2.2; upstream 17.0.7 is outside no-latest-sweep policy.                                                                                                                        |
| `c954e31` | superseded  | CodeQL is pinned to 4.37.6, newer than 4.36.2.                                                                                                                                                                        |
| `afd52d7` | superseded  | Checkout is pinned to 7.0.1, newer than 6.0.3.                                                                                                                                                                        |
| `8ede578` | irrelevant  | Fork retains dev-only `@typescript-eslint/parser` 5.59.9; upstream 8.60.1 is outside no-latest-sweep policy.                                                                                                          |
| `e0149c8` | irrelevant  | `semantic-release` and public release automation were removed.                                                                                                                                                        |
| `95ae413` | irrelevant  | Fork retains dev-only resolver 3.4.0; upstream 4.4.5 is outside no-latest-sweep policy.                                                                                                                               |
| `c0cdc2d` | irrelevant  | Upstream `typescript-eslint` 8.61.0 is a dev-stack sweep; fork deliberately retains its tested stack.                                                                                                                 |
| `7f10615` | superseded  | Checkout is pinned to 7.0.1, newer than 7.0.0.                                                                                                                                                                        |
| `231410b` | superseded  | pnpm setup is pinned to 6.0.10, newer than 6.0.9.                                                                                                                                                                     |
| `78cadba` | irrelevant  | `actions/cache` is absent from current workflows.                                                                                                                                                                     |
| `6751aa4` | ported      | `src/client/app/ui.ts` renders disconnect message and details with `textContent`.                                                                                                                                     |
| `4060c5b` | superseded  | All CodeQL phases share current 4.37.6 pin, newer than init 4.36.3.                                                                                                                                                   |
| `a99affb` | irrelevant  | Docker metadata action is absent with publishing removed.                                                                                                                                                             |
| `40c225f` | ported      | Docker validation pins `docker/setup-qemu-action` 4.2.0 exactly.                                                                                                                                                      |
| `102ad85` | superseded  | CodeQL autobuild is pinned to 4.37.6, newer than 4.36.3.                                                                                                                                                              |
| `e1bf4ec` | irrelevant  | Explicit project decision excludes OSC 0/2 browser-title synchronization.                                                                                                                                             |
| `274dd6a` | superseded  | CodeQL init is pinned to 4.37.6, newer than 4.37.0.                                                                                                                                                                   |
| `03c24f9` | superseded  | CodeQL analyze is pinned to 4.37.6, newer than 4.37.0.                                                                                                                                                                |
| `44a65ff` | ported      | Docker validation pins `docker/setup-buildx-action` 4.2.0 exactly.                                                                                                                                                    |
| `322fb8e` | superseded  | CodeQL autobuild is pinned to 4.37.6, newer than 4.37.0.                                                                                                                                                              |
| `20455d9` | ported      | Docker validation pins `docker/build-push-action` 7.3.0 exactly.                                                                                                                                                      |
| `24bb617` | superseded  | CodeQL autobuild is pinned to 4.37.6, newer than 4.37.1.                                                                                                                                                              |
| `2e09a9a` | superseded  | CodeQL init is pinned to 4.37.6, newer than 4.37.1.                                                                                                                                                                   |
| `5f651ed` | superseded  | CodeQL analyze is pinned to 4.37.6, newer than 4.37.1.                                                                                                                                                                |
| `d09a6b9` | superseded  | CodeQL analyze is pinned to 4.37.6, newer than 4.37.3.                                                                                                                                                                |
| `63f10ec` | superseded  | CodeQL init is pinned to 4.37.6, newer than 4.37.3.                                                                                                                                                                   |
| `36c75e2` | irrelevant  | Docker login action is absent because registry publishing was removed.                                                                                                                                                |
| `f85d4f1` | superseded  | CodeQL autobuild is pinned to 4.37.6, newer than 4.37.3.                                                                                                                                                              |
| `82f608a` | ported      | Workflows pin `actions/checkout` 7.0.1 exactly.                                                                                                                                                                       |
| `9ea2478` | ported      | Current Dependabot groups retained project dependencies and Actions; removed Font Awesome, commitlint, and publishing groups are intentionally omitted.                                                               |
| `08a7b3c` | ported      | Build workflow pins `actions/setup-node` 7.0.0 exactly and runs Node 22.                                                                                                                                              |
| `6bf12f1` | irrelevant  | Upstream moves Node types to 26.1.1; fork targets Node 22 and uses 22.20.1.                                                                                                                                           |
| `d323973` | irrelevant  | ESLint group is dev-only; fork deliberately retains its tested ESLint 8 stack instead of upstream latest versions.                                                                                                    |
| `9d5680a` | irrelevant  | Font Awesome dependencies and UI were removed.                                                                                                                                                                        |
| `5480260` | irrelevant  | Commitlint dependencies and PR commit-lint job were removed.                                                                                                                                                          |
| `e8bf6d9` | irrelevant  | Upstream moves Node types to 26.1.2; fork targets Node 22 and uses 22.20.1.                                                                                                                                           |
| `3f4c34b` | irrelevant  | Docker login action is absent because registry publishing was removed.                                                                                                                                                |
| `1ff0e92` | irrelevant  | Fork intentionally retains tested dev-only Mocha 10; upstream 12.0.0-rc.5 is outside no-latest-sweep policy.                                                                                                          |
| `85c51a5` | irrelevant  | Fork intentionally retains tested dev-only `concurrently` 8.2.2; upstream 10.0.4 is outside no-latest-sweep policy.                                                                                                   |
| `8a1b495` | superseded  | Current CodeQL group pin is 4.37.6, newer than upstream grouped versions.                                                                                                                                             |
| `fb19372` | irrelevant  | ESLint group is dev-only; fork retains its tested ESLint 8 stack under no-latest-sweep policy.                                                                                                                        |
| `09e643a` | ported      | `conf/nginx.template` already uses literal `proxy_set_header Connection "upgrade"`, so no `$connection_upgrade` map is needed.                                                                                        |
| `8e5a879` | ported      | Build workflow pins `pnpm/action-setup` 6.0.10 exactly.                                                                                                                                                               |
| `2a80dd0` | irrelevant  | Fork intentionally retains build-only Sass 1.77.6; upstream 1.102.0 is outside no-latest-sweep policy.                                                                                                                |
| `eae3845` | irrelevant  | Fork intentionally retains dev-only `jsdom` 16.5.0; upstream 30.0.1 is outside no-latest-sweep policy.                                                                                                                |
| `e0c2c56` | irrelevant  | Upstream dev runner `tsx` is absent; fork uses retained `ts-node` and current build scripts.                                                                                                                          |
| `34e4177` | irrelevant  | Fork intentionally retains dev-only `eslint-plugin-mocha` 10.1.0; upstream 12.0.2 is outside no-latest-sweep policy.                                                                                                  |
| `374593d` | superseded  | CodeQL init/autobuild/analyze are pinned to 4.37.6, newer than upstream grouped versions.                                                                                                                             |
