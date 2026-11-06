CREATE OR REPLACE FUNCTION public.set_brevo_api_key(p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  existing_id uuid;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id INTO existing_id FROM vault.secrets WHERE name = 'brevo_api_key' LIMIT 1;
  IF existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(existing_id, p_secret, 'brevo_api_key', 'Brevo v3 API Key');
  ELSE
    PERFORM vault.create_secret(p_secret, 'brevo_api_key', 'Brevo v3 API Key');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_brevo_api_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  val text;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT decrypted_secret INTO val FROM vault.decrypted_secrets WHERE name = 'brevo_api_key' LIMIT 1;
  RETURN val;
END;
$$;

REVOKE ALL ON FUNCTION public.set_brevo_api_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_brevo_api_key(text) TO service_role;

REVOKE ALL ON FUNCTION public.get_brevo_api_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_brevo_api_key() TO service_role;
