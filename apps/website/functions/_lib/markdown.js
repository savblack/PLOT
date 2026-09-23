// Pricing isn't public yet (SHOW_PRICING_PAGE, see _middleware.js) — don't
// advertise the Plans page to AI crawlers while it 302s for everyone else.
function homepageMarkdown(showPricingPage) {
  const moreInfo = [
    '- [About plot](https://theplot.tv/about)',
    '- [Changelog](https://theplot.tv/changelog)',
    ...(showPricingPage ? ['- [Plans](https://theplot.tv/plans)'] : []),
    '- [Privacy policy](https://theplot.tv/privacy)',
    '- [Terms of service](https://theplot.tv/terms)',
  ].join('\n');

  return `# plot — Your movie & TV companion

plot is the beautiful way to track what you watch. Log, rate, and share your movie and TV taste in one place.

## What plot helps you do

- Keep a personal timeline of movies and shows you have watched.
- Write private notes and ratings, and build watchlists for what is next.
- Curate and share lists that reflect your taste.
- See new releases and decide what to watch without searching each streaming service.

## Get started

Create an account or sign in at https://app.theplot.tv.

## More information

${moreInfo}

plot's public endpoints are listed at https://theplot.tv/.well-known/api-catalog and cover newsletter signup only. There is no public API for member data: personal viewing history, lists, ratings, notes, and account details require the member's authenticated, explicit permission.
`;
}

/** @param {Request} request */
export function acceptsMarkdown(request) {
  return (request.headers.get('accept') || '')
    .split(',')
    .some((entry) => {
      const [mediaType, ...parameters] = entry.trim().toLowerCase().split(';');
      const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
      return mediaType === 'text/markdown' && quality?.trim() !== 'q=0';
    });
}

/**
 * @param {Request} request
 * @param {{ SHOW_PRICING_PAGE?: string }} [env]
 */
export function homepageMarkdownResponse(request, env) {
  const headers = new Headers({
    'Content-Type': 'text/markdown; charset=utf-8',
    'Vary': 'Accept',
  });
  const body = request.method === 'HEAD' ? null : homepageMarkdown(env?.SHOW_PRICING_PAGE === 'true');
  return new Response(body, { headers });
}
