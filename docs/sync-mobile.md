# Keeping plot-mobile in sync with the web app

The web app (`src/`) is the source of truth. The shared, platform-agnostic layer
lives in [`src/core/`](../src/core) and is mirrored byte-for-byte into
`plot-mobile/lib/core`. Everything else (UI components, routing, styling) is
per-platform and can't be auto-propagated — DOM vs React Native primitives.

This is a **manual / on-demand** workflow. Run it whenever you want to bring
mobile up to date with web changes.

## The two halves

**Mechanical (a script).** Core logic propagates with zero edits, and changes
are classified for you:

```bash
# from the PLOT (web) repo, with plot-mobile checked out somewhere:
node scripts/sync-mobile.mjs --mobile ../plot-mobile
```

This:
1. Mirrors `src/core` → `../plot-mobile/lib/core` and tells you if it had drifted.
2. Lists web `src/` changes since the last sync marker, bucketed into:
   - **CORE** — already propagated; just open a `plot-mobile` PR with the `lib/core` diff.
   - **UI deltas** — components/pages/routing/styles that need an RN equivalent drafted.
   - **FLAGGED** — DOM/web-only (ICS export, redirects, Turnstile CAPTCHA); not portable as-is.
3. With `--mark`, advances the stored sync point (`scripts/sync-mobile.state.json`).

**Model-driven (Claude Code).** For each UI delta, drafting the React Native
screen needs judgment, so it stays a Claude step rather than a script. Hand the
work-list to Claude Code with a prompt like:

> For each web file in the UI work-list, read it and the existing mobile screen it
> corresponds to (`app/(app)/*` or `components/*`), then draft the RN-idiomatic
> equivalent: `View`/`Text`/`Pressable`/`StyleSheet`, `expo-router` instead of
> `react-router-dom`, `onPress` instead of `onClick`, tokens from `lib/tokens`.
> Open it as a draft PR with a per-change checklist. Don't touch `lib/core`.

## End-to-end run

1. `node scripts/sync-mobile.mjs --mobile ../plot-mobile`
2. In `plot-mobile`: commit the `lib/core` changes, open a PR. Its CI runs `tsc`
   + the drift-guard (which proves `lib/core` matches web `src/core`).
3. For UI deltas, drive Claude Code through the prompt above; review the draft PR.
4. Back in web: `node scripts/sync-mobile.mjs --mobile ../plot-mobile --mark` and
   commit `scripts/sync-mobile.state.json` to record the new sync point.

## Reverse direction (mobile → web)

Same idea inverted: when a feature lands in mobile first, the core logic still
belongs in `src/core` (author it there, mirror out), and the web UI is drafted
from the mobile screen. The `importParsing` parsers were exactly this case —
mobile had the better-factored version, so it informed the core implementation.

## Invariants the CI enforces

- **Drift-guard** (both repos' CI): fails if `lib/core` ≠ web `src/core`.
- **`tokens:check`** (web CI): fails if `src/styles/tokens.css` ≠ `src/core/tokens.js`.
- **`tsc`** (mobile CI): fails if a `lib/core` change breaks a mobile call site.
