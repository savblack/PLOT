-- Scrub personal data from a RESTORED COPY of the Plot database, in place.
--
-- Run only against a throwaway sandbox (scripts/lib/pg-sandbox.sh), never a
-- real project: it rewrites every user-facing text value. It exists so a
-- migration can be tested against production's shape and volume without the
-- test machine holding members' personal data (decision 2026-11-12).
--
-- Deny by default. Every text-like column in public, private, auth and
-- storage is rewritten unless it is on the KEEP list below (categories,
-- catalog data, internal plumbing). Rewrites are sha256 of the old value
-- with a per-run secret key: consistent within a run, so foreign keys, unique
-- indexes and joins on text still line up, but not reversible by guessing.
-- jsonb keeps its shape and schema-like keys; other keys and every string are
-- rewritten. Secrets with no testing value (sessions, tokens, MFA, audit log)
-- are emptied.
--
-- If a rewrite breaks a constraint (a length or format check), it tries a
-- shorter value, then NULL, then empties the table. It never leaves a column
-- unscrubbed. The final check fails the whole run if anything that looks like
-- a real email address survives anywhere.
\set ON_ERROR_STOP on

-- A random key for this run only, mixed into every rewrite and never stored
-- outside this session. Values stay consistent within the run (so joins and
-- unique indexes hold) but cannot be reversed by hashing guesses, which a
-- plain md5 of an email would allow.
create temp table scrub_key as select gen_random_uuid()::text || gen_random_uuid()::text as k;

create or replace function pg_temp.scrub_text(v text, maxlen int) returns text
language sql stable as $$
  select case when v is null or v = '' then v
              else left('x' || encode(sha256(convert_to((select k from scrub_key) || v, 'UTF8')), 'hex'),
                        greatest(coalesce(maxlen, 33), 1)) end
$$;

-- Object keys that look like fixed schema names (theme, full_name) are kept so
-- the shape stays testable. Any other key (an email, a person's name, an
-- external id used as a key) is rewritten like a value.
create or replace function pg_temp.scrub_json(j jsonb) returns jsonb
language plpgsql stable as $$
declare out jsonb;
begin
  case jsonb_typeof(j)
    when 'object' then
      select coalesce(jsonb_object_agg(
               case when k ~ '^[a-z_][a-z0-9_]{0,40}$' then k else pg_temp.scrub_text(k, 33) end,
               pg_temp.scrub_json(v)), '{}'::jsonb)
        into out from jsonb_each(j) as e(k, v);
    when 'array' then
      select coalesce(jsonb_agg(pg_temp.scrub_json(v) order by i), '[]'::jsonb) into out from jsonb_array_elements(j) with ordinality as e(v, i);
    when 'string' then
      out := to_jsonb(pg_temp.scrub_text(j #>> '{}', 33));
    else
      out := j;
  end case;
  return out;
end $$;

-- Secrets and session state: no value for migration testing, so emptied.
do $$
declare t text;
begin
  foreach t in array array[
    'auth.sessions', 'auth.refresh_tokens', 'auth.flow_state', 'auth.one_time_tokens',
    'auth.mfa_challenges', 'auth.mfa_amr_claims', 'auth.mfa_factors', 'auth.webauthn_credentials',
    'auth.webauthn_challenges', 'auth.audit_log_entries', 'auth.oauth_authorizations', 'auth.oauth_consents',
    'storage.s3_multipart_uploads_parts', 'storage.s3_multipart_uploads'
  ] loop
    if to_regclass(t) is not null then
      execute format('truncate table %s cascade', t);
    end if;
  end loop;
end $$;

create temp table scrub_log (tbl text, col text, outcome text);

do $$
declare
  -- Column names that are categories or plumbing in every table they appear in.
  keep_any text[] := array[
    'status', 'state', 'media_type', 'type', 'kind', 'platform', 'region', 'country', 'locale',
    'language', 'currency', 'source', 'source_type', 'source_system', 'provider', 'provider_type',
    'provider_name', 'version', 'match_state', 'decision', 'action', 'phase', 'mode', 'role',
    'visibility', 'watchlist_visibility', 'subscription_status', 'tier_name', 'post_type',
    'release_kind', 'run_type', 'network', 'network_name', 'service', 'surface', 'subject_type',
    'token_type', 'response_type', 'code_challenge_method', 'authentication_method',
    'registration_type', 'aal', 'factor_type', 'severity', 'category', 'channel', 'plan',
    'poster_path', 'backdrop_path', 'profile_path', 'portrait_path', 'person_profile_path',
    'logo_path', 'still_path', 'bucket_id', 'aud', 'instance_id', 'timezone', 'release_date',
    'streaming_date', 'price_id', 'tmdb_refs', 'date_precision', 'versioning_status',
    'watch_together_requests_from'
  ];
  -- (table, column) pairs that are catalog data rather than anything a member wrote.
  keep_pair text[] := array[
    'storage.buckets.id', 'storage.buckets.name', 'storage.buckets.allowed_mime_types',
    'public.platform_charts.title', 'public.title_availability.title', 'public.people_feed.title',
    'public.people_feed.person_name', 'public.marketing_tracked_titles.title',
    'public.marketing_tracked_titles.tmdb_title', 'public.history.title', 'public.list_items.title',
    'public.watch_events.title', 'public.feed_posts.title', 'public.watching_progress.title'
  ];
  r record;
  rel text;
  done boolean;
begin
  for r in
    select c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable,
           c.character_maximum_length as maxlen
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    left join pg_type ty on ty.typname = c.udt_name
    where c.table_schema in ('public', 'private', 'auth', 'storage')
      and c.is_generated = 'NEVER'
      and (c.data_type in ('text', 'character varying', 'character', 'jsonb', 'json', 'inet', 'bytea')
           or (c.data_type = 'USER-DEFINED' and c.udt_name = 'citext')
           or (c.data_type = 'ARRAY' and c.udt_name in ('_text', '_varchar', '_citext')))
      and not (c.column_name = any (keep_any))
      and not ((c.table_schema || '.' || c.table_name || '.' || c.column_name) = any (keep_pair))
    order by 1, 2, 3
  loop
    rel := format('%I.%I', r.table_schema, r.table_name);
    done := false;
    -- Attempt 1: a deterministic replacement that fits the column.
    begin
      execute format('update %s set %I = %s where %I is not null', rel, r.column_name,
        case
          when r.data_type in ('jsonb') then format('pg_temp.scrub_json(%I)', r.column_name)
          when r.data_type in ('json') then format('pg_temp.scrub_json(%I::jsonb)::json', r.column_name)
          when r.data_type = 'inet' then '''0.0.0.0''::inet'
          when r.data_type = 'bytea' then '''''::bytea'
          when r.data_type = 'ARRAY' then format('array(select pg_temp.scrub_text(x::text, 33) from unnest(%I) x)::%s', r.column_name, r.udt_name::regtype)
          else format('pg_temp.scrub_text(%I::text, %s)::%s', r.column_name, coalesce(r.maxlen::text, 'null'), format_type((select atttypid from pg_attribute where attrelid = rel::regclass and attname = r.column_name), null))
        end,
        r.column_name);
      insert into scrub_log values (rel, r.column_name, 'rewritten');
      done := true;
    exception when others then null;
    end;
    -- Attempt 2: a short value, for format or length checks.
    if not done and r.data_type in ('text', 'character varying', 'character', 'USER-DEFINED') then
      begin
        execute format('update %s set %I = pg_temp.scrub_text(%I::text, 12) where %I is not null', rel, r.column_name, r.column_name, r.column_name);
        insert into scrub_log values (rel, r.column_name, 'rewritten short');
        done := true;
      exception when others then null;
      end;
    end if;
    -- Attempt 3: a one-letter placeholder, for columns that must be non-empty but short.
    if not done and r.data_type in ('text', 'character varying', 'character', 'USER-DEFINED') then
      begin
        execute format('update %s set %I = ''x'' where %I is not null', rel, r.column_name, r.column_name);
        insert into scrub_log values (rel, r.column_name, 'placeholder');
        done := true;
      exception when others then null;
      end;
    end if;
    -- Attempt 4: NULL, where allowed.
    if not done and r.is_nullable = 'YES' then
      begin
        execute format('update %s set %I = null', rel, r.column_name);
        insert into scrub_log values (rel, r.column_name, 'nulled');
        done := true;
      exception when others then null;
      end;
    end if;
    -- Last resort: no real value may survive.
    if not done then
      execute format('truncate table %s cascade', rel);
      insert into scrub_log values (rel, r.column_name, 'table emptied');
    end if;
  end loop;
end $$;

-- Report what happened, then refuse to finish if a real-looking email survived.
select outcome, count(*) from scrub_log group by outcome order by outcome;
select 'emptied: ' || tbl || ' (' || col || ')' from scrub_log where outcome = 'table emptied';

do $$
declare
  r record;
  hits bigint;
  total bigint := 0;
  where_found text := '';
begin
  for r in
    select c.table_schema, c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema in ('public', 'private', 'auth', 'storage')
      and c.data_type in ('text', 'character varying', 'character', 'jsonb', 'json', 'USER-DEFINED', 'ARRAY')
  loop
    execute format(
      -- Any address whose domain is not a reserved example domain counts,
      -- theplot.tv included: staff addresses are personal data too.
      $q$select count(*) from %I.%I where %I::text ~* '[a-z0-9._%%+-]+@(?!example\.(invalid|com|org)\M)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}'$q$,
      r.table_schema, r.table_name, r.column_name) into hits;
    if hits > 0 then
      total := total + hits;
      where_found := where_found || format(' %s.%s.%s(%s)', r.table_schema, r.table_name, r.column_name, hits);
    end if;
  end loop;
  if total > 0 then
    raise exception 'SCRUB FAILED: % email-like value(s) survived:%', total, where_found;
  end if;
  raise notice 'SCRUB OK: no email-like value left';
end $$;
