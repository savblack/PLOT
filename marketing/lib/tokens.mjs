// IG/Threads long-lived tokens live in marketing_tokens (not GH secrets) so
// the weekly refresh job can rotate them without touching repo settings.
export const getToken = async (supabase, platform) => {
  const { data, error } = await supabase
    .from('marketing_tokens')
    .select('*')
    .eq('platform', platform)
    .maybeSingle();
  if (error) throw new Error(`Token lookup failed for ${platform}: ${error.message}`);
  if (!data) throw new Error(`No ${platform} token in marketing_tokens — run marketing/setup/exchange-tokens.mjs`);
  return data;
};

export const saveToken = async (supabase, platform, { account_id, access_token, expires_at }) => {
  const { error } = await supabase.from('marketing_tokens').upsert({
    platform,
    account_id,
    access_token,
    expires_at,
    refreshed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Token save failed for ${platform}: ${error.message}`);
};
