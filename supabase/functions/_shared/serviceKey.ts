// Resolves the key that authenticates an Edge Function as full-privilege.
//
// WHY THIS EXISTS: the legacy `service_role` JWT is being retired. It leaked
// into the schema — `supabase_functions.http_request` takes the Authorization
// header as a literal trigger argument, so two database webhooks carried it in
// their DDL, and from there it went into every pg_dump and every nightly backup
// artifact (see 20260814120000_webhook_bearer_to_vault.sql). Taking it out of
// the schema stops new copies being made; it does not invalidate the copies
// already taken. Only disabling legacy JWT keys on the project does that.
//
// The replacement `sb_secret_*` key cannot be delivered under a `SUPABASE_*`
// name: that prefix is reserved for values the platform injects, which is also
// why `SUPABASE_SERVICE_ROLE_KEY` cannot simply be overwritten with the new
// key. So the new key arrives as `SB_SECRET_KEY`.
//
// The precedence below is what makes the rotation a sequence rather than a flag
// day: set SB_SECRET_KEY, confirm every function still works, and only then
// disable the legacy keys. Until SB_SECRET_KEY is set this returns exactly what
// the callers read before, so deploying it ahead of the rotation is a no-op.
export function serviceKey(): string {
  return Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}
