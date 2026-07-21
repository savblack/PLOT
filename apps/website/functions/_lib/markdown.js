const HOMEPAGE_MARKDOWN = `# PLOT — Your film & TV companion

PLOT is the beautiful way to track what you watch. Log, rate, and share your film and TV taste in one place.

## What PLOT helps you do

- Keep a personal timeline of films and shows you have watched.
- Write private notes and ratings, and build watchlists for what is next.
- Curate and share lists that reflect your taste.
- See new releases and decide what to watch without searching each streaming service.

## Get started

Create an account or sign in at https://app.theplot.tv.

## More information

- [About PLOT](https://theplot.tv/about.html)
- [Plans](https://theplot.tv/plans.html)
- [Privacy policy](https://theplot.tv/privacy.html)
- [Terms of service](https://theplot.tv/terms.html)

PLOT does not offer a public third-party API. Personal viewing history, lists, ratings, notes, and account details require the member's authenticated, explicit permission.
`;

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

/** @param {Request} request */
export function homepageMarkdownResponse(request) {
  const headers = new Headers({
    'Content-Type': 'text/markdown; charset=utf-8',
    'Vary': 'Accept',
  });
  return new Response(request.method === 'HEAD' ? null : HOMEPAGE_MARKDOWN, { headers });
}
