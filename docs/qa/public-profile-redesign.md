# Public profile and five-list cap release

The live web profile now leads with existing top-film and top-TV selections (up to
five each), uses compact copy, and groups public lists and watch history below.
View all lists sits beside Lists, View all beside Watch history, and View list
beside the list title. List buttons expand real public data; history opens a
keyboard-accessible native dialog with bounded 30-row pages for the profile owner.

Empty and disabled sections are omitted. Single picks retain their poster size;
zero counts disappear. An empty owner profile links to My Lists. Existing share,
follow, editing, reporting and blocking flows remain in place. Locked profiles
cannot render the content component. No invented picks, notes or cover features.
The existing app theme tokens are used rather than shipping the prototype's fonts
or hardcoded colours.

## Verification

- `pnpm run check`: passed (190 existing warnings, zero errors; web build passed).
- `pnpm run test:unit`: 311 web and 550 core tests passed.
- `pnpm --filter @plot/mobile run typecheck`: passed.
- `PLOT_SMOKE_PORT=4289 pnpm run test:smoke`: five passed. Chromium required
  execution outside the sandbox; its initial sandbox launch failed.
- `pnpm run copy:check`, `pnpm run core:check`, `pnpm run migrations:check`,
  `pnpm run db:block-clause`: passed.
- `node --test scripts/tests/customListCap.test.mjs`: passed in isolated Postgres.
- `pnpm run db:migration-test`: both cap migrations applied to a temporary
  production copy. `pnpm run db:function-diff`: the only replacement changes the
  allowance from three to five; the serialization trigger is new. Both temporary
  databases were removed. Vault/pg_net are stubbed in these checks.
- Browser, real ProfileContent in Storybook: list expansion, history error dialog,
  single-pick, owner/visitor empty, disabled-section, locked and long-list-name
  states checked at phone width; populated layout also checked on desktop.
  Synthetic fixture titles have no fabricated TMDB IDs or artwork.
- History query tests verify owner scoping, bounded pagination, stable ordering
  and error propagation. Storybook has no Supabase session, so it exercises the
  dialog's error state, not real-user history retrieval.

Native profile visual parity: https://github.com/savblack/PLOT/issues/931.
The list cap itself includes both platforms. Native device interaction is not
claimed by the TypeScript/lint checks.

## Taste journal fidelity correction (17 September 2026)

The first implementation kept the legacy header and global Gabarito headings,
omitted the profile navigation, and rendered separate five-column ranked shelves.
It did not reproduce the approved journal composition.

The correction uses the production `ProfileIntro` in both the live page and
Storybook: serif display name/headings scoped to the profile, actions aligned
right on desktop, bio then compact stats, Profile / Watch history / Lists anchor
navigation, four-column picks (two on mobile) with ranks below the artwork, and
the approved Lists / Watch history column proportions and action positions.
Where both film and TV picks exist, compact type controls switch one shelf;
all saved slots remain available. Empty sections and zero counts remain hidden.

Fixtures use IDs and poster paths resolved from TMDB search on 17 September;
identity, lists and viewing dates are fictional. Desktop and 390px layouts were
visually reviewed. The list expansion, navigation and sparse single-pick width
were checked in-browser. The original five shared visibility/history tests pass.
`pnpm run check` passes; `pnpm run copy:check` passes. Native visual parity
continues in issue #931. This change contains no database migrations.
