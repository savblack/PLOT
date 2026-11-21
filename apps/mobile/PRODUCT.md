# Product

<!-- impeccable:product-schema 1 -->

This is the product record the Impeccable design skill reads for the mobile
app. It holds only facts already settled in the repo's AGENTS.md; anything it
leaves out is undecided, not missing.

## Platform

ios

## Product Purpose

Plot is a movie and TV companion: it keeps track of what you've watched and
what you want to watch, tells you what's coming and where it's streaming, and
is your first stop for deciding what to watch instead of searching every
streaming service one by one. It is a companion, not a journal.

## Capabilities and Constraints

- iPhone only. There is no Android build.
- Expo / React Native with expo-router. Mobile-specific rules: `apps/mobile/AGENTS.md`.
- Shares logic and copy with the web app through `@plot/core`; user-facing
  strings come from `packages/core/copy`.

## Brand Commitments

- Write "Plot" in prose; lowercase "plot" only in the drawn logo.
- No em dashes in user-facing copy. American English.
- Design rules: `docs/design/shared-design-system.md`. They override any
  design default the skill suggests.
