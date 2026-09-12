# Report and block: schema and surface plan

Draft, 2026-09-12. Not implemented. Three decisions at the bottom need Savannah
before any migration is written.

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

Instead, add a **new** wrapper and repoint the policies at it:

```sql
create function public.can_view_profile_content(p_uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select (public.is_profile_public(p_uid) or public.is_accepted_follower(p_uid))
     and not public.is_blocked_between(p_uid, auth.uid())
$$;
```

The two existing functions are never touched. Every future public surface gets
blocking for free by using the wrapper. Dropping and recreating a *policy* is
atomic and carries none of the function-redefinition risk.

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
`npm run db:write-paths` deliberately does not write-and-rollback.

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

- Purely additive: two new tables, two new functions, one trigger. The two
  existing helpers are **not** redefined.
- The risk is concentrated in repointing nine policies. Each is a drop-and-create.
- `npm run db:migration-test` before merging, without exception — it is the only
  check that executes the SQL.
- `npm run db:write-paths` green before merge.
- RLS correctness is *not* covered by migration-test (policies are created but
  not exercised), so the block predicate must be verified on **Staging** with two
  real accounts: block, then confirm the blocked account gets zero rows from
  profile, history, favourites, top lists, watching, lists and follows.
- A migration merged to `main` applies to production immediately. There is no
  staging gate.

## Decisions needed before implementation

1. **Does blocking hide identity, or only content?** Issue #500 deliberately
   chose Fable's split — identity always findable, shelves gated by `is_public`.
   Blocking pulls the other way. `public_profiles` is a `security definer` view,
   so RLS does not apply to it and hiding identity needs separate handling.
   Recommendation: block hides **content and interaction**, not the existence of
   a username. It satisfies "block abusive users from the service" without
   reversing a considered product decision. Flagging it because it is a product
   call, not a technical one.

2. **Can a blocked user still see that the blocker exists in search?** Follows
   from decision 1. If identity stays visible, search results stay visible and
   the row simply offers no way in.

3. **Where do reports actually land?** Email to the operator, or mirrored into
   GitHub issues the way feedback already is
   (`20260823120000_add_feedback_github_mirror_fields.sql`)? A moderation queue
   is explicitly deferred, but Apple wants a real route and a documented 24-hour
   turnaround. Reusing the feedback mirror is the cheapest compliant answer.
