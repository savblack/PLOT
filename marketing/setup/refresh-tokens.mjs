// Weekly token refresh: IG/Threads long-lived tokens last 60 days; refresh
// any with <21 days remaining (3 missed weeks of slack before expiry).
import { getSupabase } from '../lib/supabase.mjs';
import { saveToken } from '../lib/tokens.mjs';
import { refreshInstagramToken } from '../publish/instagram.mjs';
import { refreshThreadsToken } from '../publish/threads.mjs';

const REFRESHERS = { instagram: refreshInstagramToken, threads: refreshThreadsToken };

const main = async () => {
  const supabase = getSupabase();
  const threshold = new Date(Date.now() + 21 * 86400000).toISOString();

  const { data: tokens, error } = await supabase
    .from('marketing_tokens')
    .select('*')
    .lt('expires_at', threshold);
  if (error) throw new Error(error.message);

  if (!tokens?.length) {
    console.log('All tokens have >21 days remaining.');
    return;
  }

  let failures = 0;
  for (const token of tokens) {
    try {
      const refreshed = await REFRESHERS[token.platform](token.access_token);
      await saveToken(supabase, token.platform, {
        account_id: token.account_id,
        access_token: refreshed.access_token,
        expires_at: new Date(Date.now() + (refreshed.expires_in ?? 60 * 86400) * 1000).toISOString(),
      });
      console.log(`Refreshed ${token.platform} token.`);
    } catch (err) {
      failures++;
      console.error(`Refresh failed for ${token.platform}: ${err.message}`);
    }
  }
  if (failures) process.exit(1); // turn the workflow red -> failure email fires
};

main().catch((err) => { console.error(err); process.exit(1); });
