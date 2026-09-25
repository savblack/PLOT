# PLOT Watch together design

Design spec for the Premium "Find something you both want to watch" feature
(`watchTogether` in `packages/core/copy/plansPage.js`). Not implemented yet.

The live design canvas is the source of truth for visuals:
https://claude.ai/artifact/Rkjq4wowEoRBv3abn8yrmy (private; share it from the
canvas before linking it elsewhere). `canvas/` holds a snapshot of its board
sources for reference. They are Design canvas components and need the canvas
runtime, so they don't open as standalone pages. All names, counts and titles
are fictional placeholders; posters are colour blocks, not TMDB artwork.

## Screens

| Board | Screen |
| --- | --- |
| H | Hub at `/together`, a Premium item next to Pick for Me |
| I | Who's watching? people picker |
| J | Invite to watch together, with Suggested |
| 0 + invite tile | Entry tile on a friend's profile, five states |
| E, F | Sam's request notification and accept sheet |
| G | Settings › Privacy › Watch together |
| A | Overlap list for two people |
| C | Yes-or-no swipe session for two people |
| D | Group matches for three or more people |
| K, L, M | Make a shared list, Sam's notification, the shared list |
| N | Session invite notifications (live, and ended) |
| O | "Saved by Sam too" on a title page |
| Nav icons | Six icon options; the sofa was chosen |

## Paths

- Hub → Who's watching? → one person: Decide together (C), or browse (A).
- Hub → Who's watching? → two or more: See group matches (D).
- Hub → a person → A. Friend's profile tile → A once paired.
- Hub Suggested banner, hub Invite, picker "Invite someone new" → J.
- Hub Requests → G. Notifications → E → F.
- A → Make a shared list → K → M. Sam gets L → M. After a list exists, A
  shows "Open your shared list" instead.
- Session invite (N): "Jess started deciding what to watch" → Join → C, or
  "Jess is deciding with you and Priya" → Join → D. Ended sessions show
  "Ended" with no Join button.
- Title page (O): "Saved by Sam too" → A. With two or more partners, "Saved
  by Sam and Priya too" → the picker. Only shown for people you already
  watch together with.

## Ways in

- Nav item Watch together (`/together`) next to Pick for Me, with a Premium
  badge. For Free users it should open the plans page, like Pick for Me's
  try-first pop-up.
- A friend's profile (invite tile).
- Notifications: requests, shared lists and live sessions.
- Settings › Privacy › Watch together.
- Suggested, invite links and "Not on plot yet?" share links.
- My Lists, for shared lists.
- A title page's "Saved by Sam too" row.
- Proposed, not yet designed: a "Who's watching? Just me / With someone"
  first step in Pick for Me, and a link from the Premium plans page.

## Nav icon

The sofa, drawn to match `apps/web/src/components/navIcons.jsx` (24px grid,
2px stroke, round caps and joins, `currentColor`):

```html
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" />
  <path d="M3 13a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  <path d="M6 19v2" />
  <path d="M18 19v2" />
</svg>
```

Mobile needs the same icon in `apps/mobile/app/(app)/_layout.tsx`.

## Rules agreed with Savannah

Requests and consent
- A watch together request is its own consent step, separate from follow
  requests. Accepting never creates a follow, and following never pairs you.
- Only the sender needs Premium; the other person joins for free.
- Declines are silent. Requests expire after 30 days. Stopping is instant and
  unannounced; blocking also ends it.
- Who can send you requests: anyone who can see my profile (default), only
  people I follow, or no one.

Privacy
- Private profile: the partner sees titles on both watchlists and picks in
  shared sessions. An opt-in "Also share my full watchlist" is off by default.
- Public profile: don't mention watchlist sharing (it is already public); the
  accept sheet says they won't see "any lists you've set to private" or
  private notes. The per-person watchlist switch in G only shows for private
  profiles.
- The overlap must come from a server function that checks for an accepted
  pairing. Don't widen existing list or watchlist read policies.

Invite tile states (friend's profile)
- Free viewer, public friend: count shown, "Get Premium to invite Sam".
- Premium, public friend: count shown, "Invite Sam to watch together".
- Premium, private friend: no count until accepted.
- Request sent: "Watch together request sent. Sam needs to accept before you
  can choose together."
- Paired: "See what you both saved".

Suggested (J and the hub banner)
- At most 5 people, name and Invite button only, no reason line.
- Rank mutual follows first, then one-way follows. Within each group, rank by
  watchlist overlap only when that watchlist is public.
- Private profiles you follow may appear, never with a count.
- Never suggest people already paired or pending, anyone blocked either way,
  anyone whose request expired or was cancelled in the last 60 days, or anyone
  whose request setting excludes you.

Deciding
- Two people: yes-or-no swipe session. Swipe right or tap the heart for
  "I'm in", swipe left or tap X for "Not feeling it". A match holds the card
  with "You're both in". Progress is a small "7 of 14" counter on the card.
- Three or more: no voting. Group matches lists titles saved by everyone, then
  titles saved by some. Filters are Movies and Shows only.
- Copy avoids "movie night" (it may be a show, and not at night): session
  header "Deciding with Sam", group kicker "Deciding together", hub card
  "Decide what to watch".

Shared lists (from A)
- Default name is "[creator's name] and [partner's name]", editable.
- Start with the titles you've both saved (default) or empty.
- Only people you already watch together with can be added, with no second
  accept. Members join for free.
- The list counts only against the creator. It doesn't update itself; that
  would be a smart list, which is out of scope.
- Creator: Rename, Add people, Delete list. Member: Rename, Add people, Leave
  list.

## Related work

- Taste overlap moved to Deeper stats, in its own canvas and session.
- Public/private profile and list visibility is being cleaned up in a separate
  session. Revisit the privacy copy above once that model is agreed.

## Implementation status

Web only, behind `SHOW_WATCH_TOGETHER` in `apps/web/src/launchFeatures.js`.

- Phase 1 (`20260925120000_watch_together.sql`): requests, pairings, share
  full watchlist, shared titles for two people or a group, Suggested, hub,
  picker, invite, profile tile, accept dialog, notifications, settings.
- Phase 2 (`20260925130000_watch_together_sessions.sql`): the two-person
  yes-or-no session and its "started deciding" notification. The deck is a
  shuffled snapshot of titles you've both saved. Neither person sees the
  other's individual votes, only progress and matches. Live updates are a
  Realtime broadcast ping (no data) on `wt-session:<id>`, with a 5 second
  poll as a fallback. Sessions end after 12 hours, when either person ends
  them, when a new one starts, or when the pairing ends.
- Not built yet: shared lists, "Saved by Sam too" on title pages, mobile.
