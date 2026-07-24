// IndexNow ownership key. This is deliberately public: the matching file is
// served from https://theplot.tv/ so search engines can verify submitted URLs.
const KEY = '85a3ffbabc347122ac68bcba41e802aeffeb85a6473dceb08c0ea4b419b895fa';
const HOST = 'theplot.tv';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/IndexNow';
const MAX_URLS_PER_REQUEST = 10_000;

/**
 * Tell IndexNow about newly added, changed, or removed public PLOT URLs.
 * IndexNow shares accepted submissions with participating search engines.
 *
 * @param {string[]} urls Absolute canonical URLs on https://theplot.tv.
 * @param {{ fetch?: typeof fetch }} [options]
 * @returns {Promise<{ submitted: number, responses: number[] }>}
 */
export async function submitIndexNow(urls, { fetch: fetchImpl = fetch } = {}) {
  const validUrls = [...new Set(urls)].filter((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.host === HOST;
    } catch {
      return false;
    }
  });

  const responses = [];
  for (let i = 0; i < validUrls.length; i += MAX_URLS_PER_REQUEST) {
    const urlList = validUrls.slice(i, i + MAX_URLS_PER_REQUEST);
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
    });
    responses.push(response.status);
    if (!response.ok) throw new Error(`IndexNow rejected ${urlList.length} URL(s): HTTP ${response.status}`);
  }

  return { submitted: validUrls.length, responses };
}
