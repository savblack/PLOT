// One-time token bootstrap for Instagram and Threads.
//
// Usage:
//   1. Print the authorization URL:
//        node marketing/setup/exchange-tokens.mjs instagram
//        node marketing/setup/exchange-tokens.mjs threads
//   2. Open it in a browser logged into the PLOT account, approve, and copy
//      the ?code=... from the redirect.
//   3. Exchange it (stores the long-lived token in marketing_tokens):
//        node marketing/setup/exchange-tokens.mjs instagram <code>
//        node marketing/setup/exchange-tokens.mjs threads <code>
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, plus per platform:
//   instagram: IG_APP_ID, IG_APP_SECRET   (Meta app -> Instagram product)
//   threads:   TH_APP_ID, TH_APP_SECRET   (Meta app -> Threads use case)
// Optional: OAUTH_REDIRECT_URI (default https://theplot.tv/ — must be allow-
// listed in the Meta app settings).
import { getSupabase } from '../lib/supabase.mjs';
import { saveToken } from '../lib/tokens.mjs';

const REDIRECT = process.env.OAUTH_REDIRECT_URI || 'https://theplot.tv/';

const CONFIG = {
  instagram: {
    appId: () => process.env.IG_APP_ID,
    appSecret: () => process.env.IG_APP_SECRET,
    authUrl: (appId) =>
      `https://www.instagram.com/oauth/authorize?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
      '&scope=instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights' +
      '&response_type=code',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    graphBase: 'https://graph.instagram.com',
    exchangeGrant: 'ig_exchange_token',
    me: 'me?fields=user_id,username',
    accountIdField: 'user_id',
  },
  threads: {
    appId: () => process.env.TH_APP_ID,
    appSecret: () => process.env.TH_APP_SECRET,
    authUrl: (appId) =>
      `https://threads.net/oauth/authorize?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
      '&scope=threads_basic,threads_content_publish,threads_manage_insights' +
      '&response_type=code',
    tokenUrl: 'https://graph.threads.net/oauth/access_token',
    graphBase: 'https://graph.threads.net',
    exchangeGrant: 'th_exchange_token',
    me: 'v1.0/me?fields=id,username',
    accountIdField: 'id',
  },
};

const main = async () => {
  const [platform, code] = process.argv.slice(2);
  const cfg = CONFIG[platform];
  if (!cfg) {
    console.error('Usage: node marketing/setup/exchange-tokens.mjs <instagram|threads> [code]');
    process.exit(1);
  }
  const appId = cfg.appId();
  const appSecret = cfg.appSecret();
  if (!appId || !appSecret) {
    console.error(`Missing app credentials env vars for ${platform} (see file header).`);
    process.exit(1);
  }

  if (!code) {
    console.log(`Open this URL in a browser logged into the PLOT ${platform} account:\n`);
    console.log(cfg.authUrl(appId));
    console.log(`\nApprove, then re-run with the ?code=... value from the redirect URL.`);
    return;
  }

  // 1. code -> short-lived token
  const form = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT,
    code: code.replace(/#_$/, ''), // Meta appends #_ to redirect codes
  });
  const shortRes = await fetch(cfg.tokenUrl, { method: 'POST', body: form });
  const short = await shortRes.json();
  if (!shortRes.ok || !short.access_token) {
    throw new Error(`Short-lived token exchange failed: ${JSON.stringify(short)}`);
  }

  // 2. short-lived -> long-lived (60 days)
  const longUrl = `${cfg.graphBase}/access_token?grant_type=${cfg.exchangeGrant}` +
    `&client_secret=${appSecret}&access_token=${short.access_token}`;
  const longRes = await fetch(longUrl);
  const long = await longRes.json();
  if (!longRes.ok || !long.access_token) {
    throw new Error(`Long-lived token exchange failed: ${JSON.stringify(long)}`);
  }

  // 3. resolve account id
  const meRes = await fetch(`${cfg.graphBase}/${cfg.me}&access_token=${long.access_token}`);
  const me = await meRes.json();
  const accountId = me?.[cfg.accountIdField];
  if (!accountId) throw new Error(`Could not resolve account id: ${JSON.stringify(me)}`);

  const expiresAt = new Date(Date.now() + (long.expires_in ?? 60 * 86400) * 1000).toISOString();
  await saveToken(getSupabase(), platform, {
    account_id: String(accountId),
    access_token: long.access_token,
    expires_at: expiresAt,
  });
  console.log(`Saved ${platform} token for @${me.username} (account ${accountId}), expires ${expiresAt}.`);
};

main().catch((err) => { console.error(err); process.exit(1); });
