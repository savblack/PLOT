# Engagement tiers: proposed definitions

Status: **applied in PostHog on 2026-09-27** (see "Applied" at the end for
what changed and the previous values). The live definitions are the PostHog
actions and cohorts listed in [README.md](README.md#what-counts-as-an-active-user);
this file says what each tier contains and why, so a change to them is a
decision rather than drift. Change this file and PostHog together.

## The rule each tier answers

| Tier | Question | Rule for membership |
|---|---|---|
| 1. Explorer | Did a real person use the app? | Any deliberate in-app action. Browsing counts. Page and screen views do not, so bots cannot qualify. |
| 2. Committed | Did they put something of theirs into Plot? | A durable write to **their own** journal or library: a save, a watch, a rating, a review, a list. This is activation. |
| 3. Retained | Did it become a habit? | Tier 2, done **unprompted**, in 2+ distinct weeks within a rolling 8-week window. |

The test for Tier 2 is "would they lose something if they deleted their
account". A follow, a connected integration with nothing imported, or a
removed title fails it; a written review passes it.

## Tier 1: Explorer

Everything in Tier 2, plus:

| Event | Status | Why |
|---|---|---|
| `title_viewed` | live | Opening a title is deliberate. |
| `search_performed` | live | Intent to find something. |
| `discover_tab_changed` | live | Browsing Discover. |
| `watch_link_clicked` | live | Left to watch something: the strongest browse signal. |
| `tonight_picks_drawn` | **add** | Asked Plot what to watch. The picker's core loop (#1066). |
| `tonight_pick_opened` | **add** | Looked at a pick. |
| `collection_viewed` | **add** | Browsing a franchise page, same weight as `title_viewed`. |
| `user_followed` | **move here from Tier 2** | Social, not library. See Tier 2. |
| `watchlist_removed`, `history_entry_removed`, `episode_unwatched`, `season_unwatched` | **add** | Tidying the library is deliberate use, but undo must never count as a committed action. |
| `action_undone` | **add** | Tapped Undo on the toast (#1067). Deliberate, and the restore fires no save event, so this is the only trace. |
| `title_shared`, `list_shared`, `profile_shared` | **add** | Intentional, and outward-facing. |
| `plex_connected`, `trakt_connected`, `simkl_connected` | **move here from Tier 2** | Setup. What it brings in is `import_completed`, which stays in Tier 2. |

Deliberately excluded: `$pageview`, `$autocapture`, mobile's `Application
Opened` / `Application Became Active` (the screen-view equivalents), prompt
exposure (`engagement_prompt_shown`), gates (`premium_gate_hit`), and every
`*_failed` event. A failure is something that happened *to* the person.

## Tier 2: Committed (activation)

| Event | Status | Why |
|---|---|---|
| `watchlist_saved` (`already_saved != true`) | live | Saved a title. |
| `marked_watched` | live | Logged a watch. |
| `rating_set` | live | Rated one. |
| `review_written` | **add** | Wrote about one. The journal's centre, and the only one of these that an edit to an existing entry can fire on its own (#1066). |
| `favourite_added` | live | Endorsed one. |
| `custom_list_created`, `list_item_added` | live | Built a list. |
| `collection_saved_as_list` | **add** | Saved a franchise as a list. Writes a list the same as creating one. |
| `watching_started`, `season_watched`, `series_completed` | live | Series tracking. |
| `episode_watched` | **add** | The per-episode tick is where repeat engagement lives, and an out-of-sequence tick fires only this. Its absence is why a daily episode tracker can look inactive. Count persons, never events (the in-sequence tick also fires `marked_watched`). |
| `import_completed` | live | Brought their history in. Now fires on both apps and for every source (#1066). |
| `user_followed` | **remove** (to Tier 1) | Following someone is not a write to your own library, and blocking or reporting are deliberately excluded for the same reason. |
| `plex_connected`, `trakt_connected` | **remove** (to Tier 1) | Connecting is setup. A connection that imports nothing is not activation. `simkl_connected` was never in Tier 2, which showed the list was inconsistent. |

### The Self-directed variant

Action 342069 is Tier 2 minus onboarding seed picks. It feeds the signup
funnel and should feed Tier 3. It must stay **Tier 2's exact list** with one
extra filter, `watchlist_saved.source != onboarding`. Today it has drifted:

- **Bug:** its `watchlist_saved` step lacks `already_saved != true`, so a
  `/save` deep-link re-save counts as a self-directed action. Tier 2 has the
  filter; this one should too.

## Tier 3: Retained. Yes, keep it, but redefine it

Tier 3 already exists (cohort 494036: Tier 2 in 2+ distinct weeks of the last
12). It is needed, because it is the only tier that measures whether Plot
works rather than whether onboarding does. But its current definition is
wrong in two ways:

1. **It counts onboarding seed picks.** Someone who seeds five titles in week
   one and saves one more in week three is "retained" on the strength of a
   step the app told them to do. Base it on **Self-directed committed action**
   instead of Tier 2.
2. **Twelve weeks is too long a lookback for a number meant to show a trend.**
   Someone active in two weeks back in July still reads as retained in
   October. Use **2+ distinct weeks in the last 8**. A shorter window moves
   when retention actually moves.

What the data says (PostHog, test accounts excluded, 2026-09-27): 39 people
have activated; 36 of them were active in exactly one week; 3 in two or more;
5 of the 39 came back on any later day at all. So the tier is not wrong to be
small. Return is the gap. That also means **no Tier 4** ("habit": weekly for a
month): at this scale it would hold zero or one person and could not move a
decision. Revisit it when Tier 3 holds 25+ people.

## Applying this

All of it is PostHog configuration, not code, and applies retroactively (the
cohorts recompute from history). Record the previous step lists here before
changing anything, as the README does for other settings.

1. Action 333110 (Tier 2): add `review_written`, `episode_watched`,
   `collection_saved_as_list`; remove `user_followed`, `plex_connected`,
   `trakt_connected`.
2. Action 342069 (Self-directed): make it Tier 2's list exactly, plus
   `already_saved != true` and `source != onboarding` on `watchlist_saved`.
3. Action 333111 (Tier 1): Tier 2's list plus the Tier 1 table above.
   Cohort 553124 (Bots) negates this action, so it follows automatically.
4. Cohort 494036 (Retained): base it on action 342069, 2+ periods of 1 week
   within 8.

Expected effect, recomputed on the day: activation (cohort 494035) is
**unchanged at 39**, because nobody had activated through a follow or a
connection alone. Retained goes **2 to 3**. Rises after 2026-09-27 come from
the newly counted events and imports reaching production, not from a jump in
use.

## Applied

**2026-09-27**, through the PostHog API, all four steps above, plus:

- `action_undone` added to Tier 1.
- `test_account_filters` gained `not startsWith(distinct_id, 'eng_analytics_census:')`
  (see the README's settings table).
- Funnel dashboard annotation 462175 marks the date.

Previous values, to revert:

| Object | Was |
|---|---|
| Action 333110 (Tier 2) | `watchlist_saved` (`already_saved` is not `true`), `marked_watched`, `rating_set`, `favourite_added`, `list_item_added`, `custom_list_created`, `watching_started`, `season_watched`, `series_completed`, `import_completed`, `user_followed`, `plex_connected`, `trakt_connected` |
| Action 342069 (Self-directed) | The same list, but `watchlist_saved` filtered on `source` is not `onboarding` only (no `already_saved` filter) |
| Action 333111 (Tier 1) | The Tier 2 list plus `title_viewed`, `search_performed`, `discover_tab_changed`, `watch_link_clicked` |
| Cohort 494036 (Retained) | Action **333110**, performed regularly: 2+ periods of 1 week within **12** |
