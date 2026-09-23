# Public product changelog

PLOT keeps a public, dated changelog at [theplot.tv/changelog](https://theplot.tv/changelog).

This is the process for every public ship. The page itself is static HTML in
`apps/website/changelog.html` (no build step).

Treat the changelog as a **member-facing product surface**, not an eng log.
Competitors and scrapers will read it. Write every entry as if the GitHub repo
is private, even while it is still public.

## When to write an entry

Same day as the public ship. If it is visible to members (or Comp Watch), it
belongs on the changelog. Internal-only refactors do not.

Only ships that are **live for people**. Merged-but-flagged-off work waits until
the flag is on for everyone (or say "for early access" only when that is
intentional).

## What to post

- Things a member can **see or do** after the ship
- Outcomes in plain language ("lists recover when a save fails")
- User-visible bugs that are **gone**, without the exploit path
- Cross-platform notes when it matters ("on web", "in the iOS app")

## What not to post

- Ticket / PR / Linear IDs, commit hashes, file paths, table or RPC names
- Links into the GitHub repo (avoid them now; they break once the repo is private)
- Security details that help an attacker: auth bypasses, RLS holes, rate-limit
  gaps, "fixed injection in X"
- Infra and ops: Cloudflare, Supabase migrations, Workers, CI, dependency bumps
- Refactors, typechecks, lint, test-only work
- Pricing, billing, legal, or Terms changes (those belong on their own pages)
- Unshipped roadmap, "coming soon," or half-built features
- Anything that names a specific member, report, or private content
- Competitor comparisons or "we finally caught up with X"

## Grey areas (default no)

| Topic | Rule of thumb |
| --- | --- |
| Perf | Yes if members feel it ("Home loads faster"); no if it is "cut TMDB QPS 40%" |
| Analytics / PostHog | No |
| Soft-launched / flag-gated | Wait until the flag is on for everyone |
| Security fix | "Made sign-in more reliable" / "Hardened account recovery" — never the vulnerability |
| Design polish | Bundle small ones; only solo-post if a member would notice |

Keep an internal ship log in Linear or private notes if you need eng detail.
Do not point people at source for "more detail."

## Entry shape

Newest first. Each entry has:

1. **Version** — calendar `YYYY.M.D` for web ships until the App Store line has
   its own store version. When a mobile build ships with a store version, use
   that (`1.0.1`) and keep the date beside it.
2. **Date** — human label plus an ISO `datetime` on `<time>`.
3. **Buckets** — only the ones that apply:
   - **New** — something members can do or see that they could not before
   - **Improved** — existing behaviour that got clearer, faster, or kinder
   - **Fixed** — a bug that is gone

## Voice

Warm, specific, plain language. Prefer "you" over "users." No eng jargon, no
ticket IDs, no PR numbers, no em dashes (period, colon, comma, or parentheses).

## Checklist

1. Confirm the ship is live for members and fits **What to post** (not a Don't).
2. Add a new `<article class="changelog-entry" id="VERSION">` at the top of the
   entry list in `apps/website/changelog.html`.
3. Mirror the same strings in `apps/website/copy/changelog.js` (Storybook
   Content catalog).
4. Keep the footer link (`/changelog` in `_partials/footer.html`). Run
   `pnpm run footer` only if you touched the partial.
5. Leave a note for Competitor Watch / Comp Watch when a ship is worth
   tracking externally (own-product URL is already `https://theplot.tv/changelog`).

## Out of scope here

- In-app "What's new" sheet after update
- RSS / Atom feed

Those are follow-ups on PLO-471, not part of the MVP page.
