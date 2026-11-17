-- The account-session RPCs are for signed-in callers only. Supabase grants
-- EXECUTE on new public functions to anon directly, so the earlier
-- `revoke all ... from public` left anon able to call them (they raised
-- not_authenticated, but anon should not hold the grant at all).
revoke execute on function public.record_account_session(text) from anon;
revoke execute on function public.set_premium_trial_prompt_deferral(uuid, boolean) from anon;
