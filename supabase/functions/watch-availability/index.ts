/**
 * Resolves a title's legal VOD offers through the JustWatch Content Partner API.
 *
 * The browser supplies a TMDB id, not a title string, so the partner verifies
 * the exact movie/show before PLOT exposes a provider clickout. The token stays
 * server-side. This function intentionally returns no data when the partner
 * token is absent; clients retain TMDB's regional availability and its exact
 * JustWatch title page rather than reverting to a provider search.
 */
function allowedOrigin(origin: string | null) {
  if (!origin) return 'https://app.theplot.tv';
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) return origin;
    if (hostname === 'theplot.tv' || hostname.endsWith('.theplot.tv') || hostname.endsWith('.vercel.app')) return origin;
  } catch { /* use canonical origin */ }
  return 'https://app.theplot.tv';
}

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(origin),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

const BASE = 'https://apis.justwatch.com/contentpartner/v2/content';
const REGION_LOCALES: Record<string, string> = {
  AU: 'en_AU', US: 'en_US', GB: 'en_GB', NZ: 'en_NZ', CA: 'en_CA', ZA: 'en_ZA',
  IE: 'en_IE', DE: 'de_DE', FR: 'fr_FR', ES: 'es_ES', IT: 'it_IT', BR: 'pt_BR',
  MX: 'es_MX', JP: 'ja_JP', NL: 'en_NL', SE: 'en_SE', NO: 'en_NO', PT: 'pt_PT',
  IN: 'en_IN', TH: 'en_TH', HK: 'zh_HK', TW: 'zh_TW',
};
const OFFER_TYPES = new Set(['flatrate', 'rent', 'buy', 'free', 'ads']);
const providerCache = new Map<string, { expires: number, providers: Map<number, any> }>();

function json(body: unknown, origin: string | null, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } });
}

function safeUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch { return null; }
}

async function providers(locale: string, token: string) {
  const cached = providerCache.get(locale);
  if (cached && cached.expires > Date.now()) return cached.providers;
  const response = await fetch(`${BASE}/providers/all/locale/${locale}?token=${encodeURIComponent(token)}`);
  if (!response.ok) throw new Error(`Provider lookup failed (${response.status})`);
  const list = await response.json();
  const mapped = new Map((Array.isArray(list) ? list : []).map((provider) => [Number(provider.id), provider]));
  providerCache.set(locale, { providers: mapped, expires: Date.now() + 24 * 60 * 60 * 1000 });
  return mapped;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, origin, 405);

  const token = Deno.env.get('JUSTWATCH_PARTNER_TOKEN');
  if (!token) return json({ configured: false, offers: [] }, origin, 503);

  const url = new URL(req.url);
  const tmdbId = url.searchParams.get('tmdb_id') || '';
  const mediaType = url.searchParams.get('media_type');
  const region = (url.searchParams.get('region') || '').toUpperCase();
  const locale = REGION_LOCALES[region];
  if (!/^\d+$/.test(tmdbId) || (mediaType !== 'movie' && mediaType !== 'tv') || !locale) {
    return json({ error: 'Invalid title or region' }, origin, 400);
  }

  try {
    const objectType = mediaType === 'tv' ? 'show' : 'movie';
    const offersUrl = `${BASE}/offers/object_type/${objectType}/id_type/tmdb/id/${tmdbId}/locale/${locale}?token=${encodeURIComponent(token)}`;
    const [offerResponse, providerMap] = await Promise.all([
      fetch(offersUrl),
      providers(locale, token),
    ]);
    if (!offerResponse.ok) return json({ error: 'Availability lookup failed' }, origin, offerResponse.status === 404 ? 404 : 502);
    const title = await offerResponse.json();
    if (String(title?.tmdb_id) !== tmdbId || title?.object_type !== objectType) {
      return json({ error: 'Title verification failed' }, origin, 502);
    }
    const titleUrl = safeUrl(title?.full_path ? `https://www.justwatch.com${title.full_path}` : null);
    const offers = (Array.isArray(title?.offers) ? title.offers : [])
      .filter((offer) => OFFER_TYPES.has(offer?.monetization_type))
      .map((offer) => {
        const provider = providerMap.get(Number(offer.provider_id));
        return {
          providerId: Number(offer.provider_id),
          providerName: provider?.clear_name || provider?.technical_name || 'Watch provider',
          logoPath: safeUrl(provider?.icon_url),
          offerType: offer.monetization_type,
          price: Number.isFinite(offer.retail_price) ? offer.retail_price : null,
          currency: typeof offer.currency === 'string' ? offer.currency : null,
          providerUrl: safeUrl(offer?.urls?.standard_web),
        };
      });
    return json({ title_verified: true, title_url: titleUrl, offers }, origin);
  } catch (error) {
    console.error('watch-availability failed', error);
    return json({ error: 'Availability lookup failed' }, origin, 502);
  }
});
