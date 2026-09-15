# Report and block: schema and surface plan

Draft, 2026-09-12. Not implemented.

**Decided 2026-09-12: a block hides identity, not just content.** A blocked user
cannot see that the blocker exists. That is a stronger promise than the original
draft assumed, and it costs considerably more — see "What hiding identity costs"
below. One decision remains open at the bottom.

## Why this is first

It is the only remaining item that gets PLOT **rejected** rather than merely
feeling unfinished. `docs/research/app-store-guideline-1-2.md` settled that 1.2
applies with or without a feed: avatars, usernames and bios clear the
user-generated-content threshold on their own. Nothing of it exists today — no
`reports` table, no `user_blocks`, no controls, no copy.

Apple treats report and block as **two separate capabilities**. Blocking must not
require reporting, and reporting must not require blocking.

## The load-bearing discovery

Every public read of another user's content already routes through the same two
helper functions, with a uniform predicate:

```sql
using (public.is_profile_public(user_id) or public.is_accepted_follower(user_id))
```

That holds for all eight public-read policies: `history`, `journal`,
`user_favourites`, `user_top_lists`, `watching_progress`, `list_items`,
the public custom lists, and the profile projection.

So blocking does **not** need eight bespoke edits. It needs one predicate.

**It must not be added by redefining those two functions.** `create or replace
function` replaces the whole body, Postgres accepts a stale one silently, and
that exact pattern cost this project a two-week production outage in July.
`is_profile_public` is also called by the `set_follow_status` trigger, so
redefining it changes follow-request behaviour as a side effect, and the name
would start lying about what it does.

Instead, add a **new** helper and AND it onto each existing predicate:

```sql
create function public.not_blocked(p_uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select not exists (
    select 1 from public.user_blocks
    where (blocker_id = p_uid      and blocked_id = auth.uid())
       or (blocker_id = auth.uid() and blocked_id = p_uid)
  )
$$;
```

The two existing functions are never touched, and dropping and recreating a
*policy* is atomic, carrying none of the function-redefinition risk.

**Corrected during implementation.** This was first specced as a single
`can_view_profile_content(p_uid)` wrapper bundling
`is_profile_public or is_accepted_follower` with the block check, and the
policies repointed at it. That is wrong, and quietly so. The predicates are not
uniform: `list_items` and `watching_progress` gate on `is_profile_public`
**alone**, while `history`, `user_favourites` and `user_top_lists` also allow
accepted followers. Folding them all onto one wrapper would have **widened**
those two, handing accepted followers the watchlist and watching progress of
private profiles. A conjunct preserves every predicate exactly. Blocking is not
the change to smuggle a visibility change through.

`user_custom_lists` and `user_custom_list_items` use neither helper — they gate
on `is_public` — so they take the conjunct against the list owner, reached
through the parent list for the items table.

Also corrected: `journal` no longer exists. It was renamed to `history` in
`20260726010000_rename_journal_to_history.sql`, so the policy the first draft
listed for it would have failed the migration outright. The production schema in
`supabase/functions/_shared/database.types.ts` is the reliable source for what
tables are actually there.

Anonymous readers are unaffected: `auth.uid()` is null, the block lookup matches
nothing, and the predicate reduces to today's behaviour.

## Schema

### `user_blocks`

```sql
create table public.user_blocks (
  blocker_id uuid references auth.users(id) on delete cascade not null,
  blocked_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_id_idx on public.user_blocks(blocked_id);
```

RLS: the blocker may select, insert and delete **their own rows only**. The
blocked user must never be able to read this table, or blocking becomes a
notification. Enforcement therefore cannot be a direct policy subquery; it goes
through a `security definer` helper:

```sql
create function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  )
$$;
```

**Symmetric on purpose.** "Sever the relationship" means neither party sees the
other's content, not just that the blocker stops seeing the blocked user.

### `reports`

```sql
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  reported_id uuid references auth.users(id) on delete cascade not null,
  surface     text not null check (surface in ('profile','follow_request','search_result','suggested_user')),
  reason      text not null check (reason in ('harassment','hate','sexual','impersonation','spam','other')),
  detail      text check (char_length(detail) <= 2000),
  status      text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at  timestamptz default now() not null
);
```

The five reason categories mirror Guideline 1.1 so PLOT's taxonomy and Apple's
line up, which is what the research asked for. `reporter_id` is
`on delete set null` so a report survives the reporter deleting their account —
the evidence should outlive the reporter.

RLS: a reporter may insert with `auth.uid() = reporter_id` and select only their
own rows. No one else reads it through the API; the operator reads via the
service role.

### Side effects of a block

A trigger on insert, so it cannot be forgotten by a client:

```sql
delete from public.follows
 where (follower_id = new.blocker_id and following_id = new.blocked_id)
    or (follower_id = new.blocked_id and following_id = new.blocker_id);
```

`follows` carries `status`, so this drops accepted follows **and** cancels
pending requests in both directions in one statement.

### `follows` needs its own clause

`follows` does not use the helpers. Its policy is `status = 'accepted'`, readable
by everyone, so a blocked user could otherwise enumerate the blocker's followers:

```sql
using (
  status = 'accepted'
  and not public.is_blocked_between(follower_id, auth.uid())
  and not public.is_blocked_between(following_id, auth.uid())
)
```

Per-row function calls on a public table are the one performance question here.
At PLOT's size, with the `blocked_id` index, it is not a concern; it would be at
a hundred times the scale.

### Operator route

Reuse the existing pattern rather than inventing one: a trigger calling
`public.notify_edge_function('notify-report')`, mirroring how `feedback` already
reaches the operator, with the bearer in Vault. Note the standing caveat that
`http_request` triggers are not reliably transactional, which is why
`pnpm run db:write-paths` deliberately does not write-and-rollback.

An acknowledgement to the reporter is the floor Apple asks for ("timely
responses to concerns"). In-app confirmation on submit satisfies it.

## Surfaces

Report and block controls belong on every surface that renders another user.
Both apps, same wording, from `packages/core/copy`:

| Surface | Web | Mobile |
| --- | --- | --- |
| Public profile | `pages/PublicProfilePage.jsx` | `app/(app)/u/[username].tsx` |
| Follow requests | `components/RequestsView.jsx` | `app/(app)/requests.tsx` |
| User search results | `components/SearchView.jsx`, `components/UserList.jsx` | `app/(app)/search.tsx`, `components/UserList.tsx` |
| Suggested users | `components/SuggestedUsers.jsx` | — (check parity) |
| Blocked list + unblock | Settings | `app/(app)/settings.tsx` |

Shared logic goes in `@plot/core` first — a `useBlocks` hook and a `useReport`
submit — with rendering per app, per the standing parity rule. A kebab menu on
each row is the lightest treatment that fits the flat monochrome system; the
accent is reserved, so neither control is decorative.

## Also required for submission, and easy to forget

From the same research, these are gates, not polish:

1. **A demo account plus a second seeded account that follows it**, so a reviewer
   can exercise report and block against a real target. The research names 2.1
   App Completeness as the *likelier* rejection.
2. **App Review notes** saying plainly where the controls are and that the
   activity feed is not enabled in this build.
3. **Declare user-generated content** in the age rating questionnaire.
4. **Published community standards.** 1.2 makes PLOT responsible for removing
   content that violates "your terms of service, or your community standards".
   Without them there is nothing to enforce against and nothing to show.
5. Server-side limits on bio and display name, and an allowlist for profile
   social link hosts. `USERNAME_RE` already constrains usernames; the research
   flags the unconstrained URL field as a distribution channel.

Items 4 and 5 are separate work. They are listed so they are not discovered
during review.

## Migration safety

This touches RLS on live user data, and the map already names the RLS split as
one of two changes with real blast radius: get it wrong and private shelves leak.

- Migration 1 is purely additive: two new tables, two new functions, one
  trigger. The two existing helpers are **not** redefined. Its risk is
  concentrated in repointing nine policies, each a drop-and-create.
- Migration 2 redefines seven `security definer` functions and is the dangerous
  one. Diff every single one against its live definition before touching it —
  `pnpm run db:function-diff` now does exactly that, restoring production and
  printing a unified diff of every function body a pending migration changes.
  For 20260913090000 it reported 0 lines removed across all seven, which is the
  shape a redefinition has to have to be safe.
- `pnpm run db:migration-test` before merging, without exception — it is the only
  check that executes the SQL.
- `pnpm run db:write-paths` green before merge.
- RLS correctness is *not* covered by migration-test (policies are created but
  not exercised), so the block predicate must be verified on **Staging** with two
  real accounts: block, then confirm the blocked account gets zero rows from
  profile, history, favourites, top lists, watching, lists and follows.
  **Done 2026-09-13**: `pnpm run staging:block-test` — 31 assertions across the
  blocker, the blocked account, an unrelated third account and an anonymous
  reader, all inside one transaction that ends in `rollback`. The last two
  matter as much as the first two: they are the only thing that catches a clause
  that is too broad and hides people nobody blocked.
- A migration merged to `main` applies to production immediately. There is no
  staging gate.

## What hiding identity costs

Content and identity are served by completely different mechanisms, and only one
of them has a choke point.

**Content** is RLS policies sharing one predicate. Additive, low risk: one new
wrapper function, repoint nine policies, existing helpers untouched.

**Identity is not served by the view at all.** `profiles` has exactly one select
policy (`auth.uid() = id`), and `public_profiles` — despite being the documented
public projection — is not queried by either app. Every identity read in the
product goes through a `security definer` RPC that selects `public.profiles`
**directly**, bypassing both RLS and the view:

| Function | Serves |
| --- | --- |
| `get_profile_card` | the public profile page |
| `search_users` | user search |
| `suggested_users` | suggestion rails |
| `list_followers` | follower list |
| `list_following` | following list |
| `list_follow_requests` | the requests screen |
| `list_notifications` | **added 2026-09-13** — see below |

**This table was wrong when it was written.** It has six rows because six is
what reading the app's call sites turned up. Asking Postgres instead —

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosrc ilike '%profiles%';
```

— returns `list_notifications` as well, and it was the worst omission of the
set: notifications are historical rows, so a blocked account kept its username
and avatar sitting in your notification feed long after every other path had
gone dark. The lesson is not "add a seventh row". It is that a list of
identity surfaces derived by reading code is a list of the ones you thought of,
which is why `pnpm run db:block-clause` now derives it from the migrations and
fails the build on anything unclassified.

So hiding identity means adding a block clause to **six functions**, each a
`create or replace` of a whole body someone else authored, against live user
data, with no staging gate on merge. That is the single most dangerous change
shape in this repository: it is exactly what broke every `history` write for two
weeks in July, and `migrations:check` only catches a subset of it (a changed
`ON CONFLICT` target).

Adding the clause to `public_profiles` alone would do nothing, because nothing
reads it.

### Two carve-outs that must NOT get the clause

- **`username_available`** must stay globally correct. If it respected blocks, a
  blocked user would be told a taken username is free. Uniqueness is not a
  visibility question. Same for `generate_username` and `set_username_on_insert`.
- **The blocked list in settings** needs to render the identity of people you
  have blocked, or you cannot unblock them. Because enforcement is symmetric,
  the ordinary paths will return nothing for exactly those users. This needs its
  own `list_blocked_users` RPC that deliberately bypasses the filter, scoped to
  rows where `blocker_id = auth.uid()`.

### Not-found, never "blocked"

Every hidden surface must present as **not found**, indistinguishable from a
private or nonexistent profile. A distinct "you have been blocked" state turns
blocking into a notification, which is the thing the symmetric design and the
unreadable `user_blocks` table are both there to prevent.

**Watched on 2026-09-13, on web, against Staging.** Signed in as one Staging
account, on another account's profile with the card on screen: name, handle,
counts, follow button. Block, confirm, and the card is replaced in place by "This
profile isn't public. @<handle> either doesn't exist or hasn't made their profile
public yet." — no navigation, no blank frame, no stale card left behind. A
reload of the same URL lands straight on the same state. Unblocking from Settings
> Blocked accounts brings the profile back; Staging ended on 0 blocks, 0 reports,
0 public profiles and 0 follows, exactly as it started.

Worth saying which part of that was ever in doubt. The copy is shared with the
nonexistent-handle path and has been covered by a Playwright smoke check since
that path existed. What had never been seen is the **transition**: before
20260913090000 the screen did not update at all, because `onChanged` refreshed
follows and not the profile, so the person you had just blocked stayed on screen
until you navigated away. That is the frame above.

**Mobile is still unwatched.** `apps/mobile/app/(app)/u/[username].tsx` carries
the same `found = !loading && !!profile` shape and the same paired refresh, but
"the same shape" is the argument, not the evidence.
## Recommended sequencing

Two migrations, not one. Both halves are independently useful and they have very
different risk profiles:

1. **Content + reports.** Additive tables, new wrapper, repointed policies,
   report flow and operator route. Nothing existing is redefined.
2. **Identity.** The six function redefinitions, each diffed against its live
   definition first (`select pg_get_functiondef(oid) from pg_proc where
   proname = '…'`), never against the migration you remember.

Shipping 1 first gets the compliance surface working and the UI in place while
the riskier half is done deliberately rather than under launch pressure.

## Decision still open

**Where do reports actually land?** Email to the operator, or mirrored into
GitHub issues the way feedback already is
(`20260823120000_add_feedback_github_mirror_fields.sql`)? A moderation queue is
explicitly deferred, but Apple wants a real route and a documented 24-hour
turnaround. Reusing the feedback mirror is the cheapest compliant answer.
