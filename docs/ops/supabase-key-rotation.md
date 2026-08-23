# Retiring the legacy Supabase API keys

Done 2026-08-23. Both projects now use the new key scheme; legacy API keys are
**disabled** on Production and Staging. This is the record of what moved and the
traps found on the way, kept because most of them are invisible from the repo.

## Why it had to happen

`supabase_functions.http_request` accepts the Authorization header as a *literal
trigger argument*, so the two database webhooks stored a full-privilege
`service_role` JWT — valid until 2036 — directly in their trigger definitions.
That put the credential inside every `pg_dump`, every nightly R2 backup artifact,
and any `pg_restore -l` or schema diff. Found while restore-testing the backup.

`20260814120000_webhook_bearer_to_vault.sql` took it out of the schema, which
stopped new copies being made. It did **not** invalidate the copies already taken —
only disabling legacy keys did that. Verified afterwards by calling the REST API
with the leaked value: `401`.

## The trap that matters most

**Disabling legacy keys retires the anon key too, not just `service_role`.**

The rotation was planned by mapping `service_role` consumers. The anon key rides
the same switch, and four separate breakages came from that — every one of which
would have failed silently:

1. **Six tracked files hardcoded the production anon JWT** — the OG worker,
   `apps/website/functions/_lib/proxy.js`, `functions/list/[id].js`,
   `functions/sitemap-{lists,profiles}.xml.js`, `functions/u/[username].js`. All
   would have 401'd. Now on publishable keys.
2. **`hasServiceRoleBearer` only understood JWTs.** It split the bearer on dots and
   read `role`. An `sb_secret_*` key has neither, so the gate returned false and
   `notify-feedback`, `profiles-changed` and `notify-signup` would all have answered
   403 — invisibly, because the trigger function warns rather than raising.
3. **The `plot-og` Worker still carried the old key.** Workers do **not** deploy
   from a Pages merge. Changing the source is inert until `wrangler deploy` runs.
4. **CI's `VITE_SUPABASE_ANON_KEY` secret was months stale**, so the Playwright
   smoke job on main would have gone red.

## Where keys actually live

Four of these are outside git, which is why an audit has to be done by asking each
service rather than by reading the repo:

| Surface | What it holds |
|---|---|
| Edge Function secrets (per project) | `SB_SECRET_KEY`, read via `_shared/serviceKey.ts` |
| Vault (in the database) | `edge_webhook_bearer`, `notify_signup_service_role_key` |
| GitHub Actions secrets | `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY` |
| Cloudflare Pages build vars | `VITE_SUPABASE_ANON_KEY`, production **and** preview |
| Cloudflare Workers | inline constants — `plot-og` had one |
| Tracked source | the six files above, plus `.env.example` |

`notify_signup_service_role_key` belongs to `supabase/notify-signup-trigger.sql`,
which sits outside `migrations/` deliberately and therefore appears in no deploy.

## Mechanics worth keeping

- The switch is a **query param**: `PUT /v1/projects/{ref}/api-keys/legacy?enabled=false`.
  A JSON body is rejected with `enabled: Invalid input: expected string, received
  undefined` whether the value is a boolean or a string. Re-enable with
  `?enabled=true` — instant, no redeploy.
- `GET /v1/projects/{ref}/api-keys?reveal=true` returns key values.
  `POST /v1/projects/{ref}/database/query` runs SQL without a local `psql`.
- When checking whether a credential is still embedded, select **booleans**
  (`pg_get_triggerdef(...) like '%Bearer%'`), never the DDL itself — otherwise the
  check prints the secret it is looking for.
- Cloudflare Pages build vars are `secret_text` and **cannot be read back**. Use
  `wrangler pages secret put` (writes one binding) for production; it has no
  `--env` flag, so preview needs the API PATCH, which merges rather than replaces.
- To exercise the `profiles-changed` webhook without touching user data: the
  trigger is `AFTER INSERT OR UPDATE FOR EACH ROW`, so
  `update profiles set display_name = display_name where id = (…limit 1)` fires it
  while the row's `md5` stays identical. Read the result from
  `net._http_response.status_code` rather than inferring it.

## Rollback

Re-enable legacy keys on the dashboard or via the endpoint above. It is instant and
needs no redeploy: `_shared/serviceKey.ts` falls back to
`SUPABASE_SERVICE_ROLE_KEY`, and `hasServiceRoleBearer` accepts both key shapes.
Those two fallbacks are what made this a sequence rather than a flag day, and they
are worth keeping until every consumer has been on the new keys long enough to
trust.
