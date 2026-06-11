// Inlined into every template by render.mjs (replaces the /*HELPERS_JS*/ marker).
// DOM-construction helpers — textContent only, no innerHTML, so third-party
// strings (TMDB titles) can never inject markup.

/* eslint-disable no-unused-vars */
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
};

const img = (className, src) => {
  const node = document.createElement('img');
  node.className = className;
  node.src = src;
  return node;
};

// Best full-bleed art for the current canvas: posters suit the 4:5 portrait
// card, backdrops suit 16:9 — fall back to whichever exists.
const pickArt = (title) => {
  const portrait = window.innerHeight > window.innerWidth;
  return portrait
    ? (title.poster_data_uri || title.backdrop_data_uri)
    : (title.backdrop_data_uri || title.poster_data_uri);
};

// A display headline with an italic accent segment: serifLine('7', ' days to go')
const accentLine = (plain, italic) => {
  const h = el('h1', 'display', plain);
  if (italic != null) h.append(el('em', null, italic));
  return h;
};

// Caps kicker line merging release kind + date: "STREAMING · FRIDAY 12 JUNE".
// kind: 'cinema' | 'streaming' | 'tv' (colors the kind word); either part optional.
const KIND_TEXT = { cinema: 'In cinemas', streaming: 'Streaming', tv: 'New series' };
const metaCaps = (kind, dateText) => {
  const line = el('div', 'meta-caps');
  if (kind && KIND_TEXT[kind]) line.append(el('span', `kind ${kind}`, KIND_TEXT[kind]));
  if (kind && KIND_TEXT[kind] && dateText) line.append(document.createTextNode('  ·  '));
  if (dateText) line.append(document.createTextNode(dateText));
  return line;
};

// Brand chrome on every card: big PLOT wordmark top-left, and a footer
// strip with the site. (TMDB attribution lives in the profile bios and the
// website footer, not on the cards.)
const plotMark = () => el('div', 'plot-mark', 'PLOT');

const plotFooter = () => {
  const footer = el('div', 'plot-footer');
  const site = el('span', 'site', 'theplot');
  site.append(el('b', null, '.tv'));
  footer.append(site);
  return footer;
};
