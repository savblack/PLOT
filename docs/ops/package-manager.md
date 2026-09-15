# Package manager: pnpm

The repo moved from npm to pnpm on 2026-09-15. This note records why, the two
settings that are load-bearing, and what to check if an install looks wrong.

## Why

Every git worktree gets its own `node_modules`. Under npm that was a full,
private copy — ~1GB each — so four worktrees open at once cost ~4GB of
near-identical files, and `npm ci` re-downloaded and re-wrote all of it each
time. Worktrees are created here constantly, so that cost was recurring.

pnpm keeps one copy of every package version in a global content-addressable
store (`~/Library/pnpm/store` on macOS) and **hardlinks** files into each
`node_modules`. A second worktree's install therefore costs close to nothing on
disk and finishes in seconds, because nothing is copied or re-downloaded.

Hardlinks only work within one filesystem. The store and the repo both live
under `/Users/<you>`, so that holds. If you ever move the repo to another
volume, pnpm falls back to copying and the saving disappears.

## The two settings that matter

Both live in `.npmrc` and are **not** stylistic:

### `node-linker=hoisted`

Keeps the flat, npm-style `node_modules`. pnpm's default is an isolated layout
where only direct dependencies are symlinked at the top level and the real files
sit under `node_modules/.pnpm/`. Three things here break under that default:

- `apps/mobile/metro.config.js` sets `disableHierarchicalLookup = true` and
  resolves only `<app>/node_modules` and `<root>/node_modules`. That is a
  deliberate choice for determinism, and it assumes hoisting.
- `scripts/check-expo-sdk-deps.mjs` reads `<root>/node_modules/expo/` directly,
  including `bundledNativeModules.json`.
- `apps/web/vite.config.js` keys its vendor chunking off `node_modules` paths.

Hoisting costs nothing: the disk saving comes from the store and the hardlinks,
not from the symlink layout.

### `strict-peer-dependencies=false`

`apps/mobile` pins react 19.2.3 (react-native 0.86.3 requires that exact patch)
while `apps/web` takes `^19.2.8`. Under npm this needed `legacy-peer-deps=true`;
this is the pnpm equivalent. pnpm nests the two correctly — mobile resolves
19.2.3, web resolves 19.3.0 — rather than forcing one on both.

There is also `link-workspace-packages=true`, because the internal `@plot/*`
dependencies are declared as `"*"` rather than `"workspace:*"`. npm resolved
those to the local workspace; pnpm would otherwise look them up in the registry
and 404. Keeping this setting means no `package.json` had to change, so
reverting to npm stays a small change.

## Build scripts are blocked by default

pnpm 10 does not run a dependency's install/postinstall script unless it is
named in `onlyBuiltDependencies` in `pnpm-workspace.yaml`. `esbuild` and
`workerd` are listed there because both fetch a platform binary at install
time — skipping it fails the *build*, not the install, which is a confusing way
to find out.

If you add a dependency that needs its install script, pnpm prints an
"Ignored build scripts" warning. Add it to that list (or run
`pnpm approve-builds`) rather than ignoring the warning.

## Cloudflare Pages

The `plot` and `plot-site` projects build from settings in the Cloudflare
dashboard, not from anything in this repo — see the header comment in
`apps/web/wrangler.toml`. Pages picks its package manager by detecting the
lockfile, so `pnpm-lock.yaml` must be committed for those builds to use pnpm.
If a Pages build starts failing on install, check the project's build command
and its `PNPM_VERSION` / package-manager detection before looking in the repo.

## Useful commands

- `pnpm install` — install everything.
- `pnpm install --frozen-lockfile` — what CI runs; fails if the lockfile is stale.
- `pnpm --filter @plot/web run <script>` — run a script in one workspace
  (the old `npm run <script> -w @plot/web`).
- `pnpm store prune` — drop store entries nothing references any more. Safe; the
  next install re-fetches what it needs.
- `pnpm why <pkg>` — explain why a package is installed.
