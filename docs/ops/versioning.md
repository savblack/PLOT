# Mobile app versioning

`apps/mobile` is the only package with a version. The web app, the marketing
site, and `packages/*` stay at `0.0.0` and deploy from `main` with no release
step. Their workflows are unchanged.

## Files

| File | Role |
| --- | --- |
| `apps/mobile/package.json` | `version` |
| `apps/mobile/app.json` | `expo.version` |
| `.release-please-manifest.json` | Last version release-please will bump from |
| `release-please-config.json` | Config for `apps/mobile` only |
| `apps/mobile/CHANGELOG.md` | Generated on the release PR. Not the public changelog. |

The current version is `0.9.0`. The app is not in the App Store. `1.0.0` is
the launch cut, not the next feature bump.

## What release-please does

[`.github/workflows/release-please.yml`](../../.github/workflows/release-please.yml)
runs on every push to `main`. It uses `googleapis/release-please-action` and
the manifest files above. The default `GITHUB_TOKEN` is enough. CircleCI is a
separate GitHub App, so it still tests the release PR.

A commit counts only when it touches `apps/mobile`. `feat` bumps the minor.
`fix` bumps the patch. `bump-minor-pre-major` is on, so before `1.0.0` a
breaking change bumps the minor too (`0.9.0` becomes `0.10.0`). It does not
become `1.0.0` on its own.

When those commits exist, release-please opens one PR that:

- bumps `package.json` and `expo.version` together (release type `expo`)
- writes `apps/mobile/CHANGELOG.md`
- updates `.release-please-manifest.json`

The release PR title looks like `chore(main): release mobile 0.9.1`. The
scope is the target branch, which is how release-please titles these PRs.

Merging that PR is the release. The same workflow then tags `mobile-vX.Y.Z`
and publishes a GitHub Release. `component` is `mobile`, the tag includes
`v`, and the separator is `-`.

`bootstrap-sha` is `89554c6c6cb8d96533d824c50a047e063a3e073a`, the `main`
commit this setup branched from. release-please ignores history before that
SHA until the first release PR merges. After that the value is ignored and
can be deleted.

## Build numbers stay on EAS

`apps/mobile/eas.json` keeps `cli.appVersionSource` set to `remote` and
`build.production.autoIncrement` set to `true`. Do not add `ios.buildNumber`
or `android.versionCode` to `app.json`. The expo updater rewrites those
fields when they are present, which would fight EAS. It does not add them
when they are absent.

## Cutting 1.0.0

Put this footer in the commit message of the change that should ship as the
App Store launch:

```
Release-As: 1.0.0
```

GitHub squash merges keep the branch commit messages
(`squash_merge_commit_message` is `COMMIT_MESSAGES`). A footer that lives
only in the PR description is dropped.

Squash titles follow `COMMIT_OR_PR_TITLE`. A one-commit PR lands that
commit's subject. A PR with more than one commit lands the PR title. Both
have to be conventional commits.
[`.github/workflows/pr-title.yml`](../../.github/workflows/pr-title.yml)
checks the PR title, and on a one-commit PR it checks the commit subject too.
Allowed types are the usual conventional commit types, plus `content`, which
website copy PRs already use. A scope is optional.

Do not set `release-as` in `release-please-config.json`. That key keeps
forcing the same version on later runs. The commit footer applies once.

After `1.0.0` is released, turn `bump-minor-pre-major` off if a breaking
change should bump the major.

## Public changelog

Member-facing notes stay in `apps/website/data/changelog.json`. See
[changelog.md](changelog.md). New entries use the same semver:

```
pnpm run changelog:add --version X.Y.Z
```

The script still defaults to a calendar version (`YYYY.M.D`) when `--version`
is omitted. Don't use that default for new entries. The existing `2026.9.21`
entry stays as it is. A version string can appear only once, so fold the
ships for that app version into a single entry.
