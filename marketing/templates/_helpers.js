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

// Full-bleed art: prefer the backdrop in BOTH orientations — it's cinematic
// key art, reads cleanly behind type, and avoids posters' baked-in titles and
// odd crops. Poster is only a fallback when no backdrop exists.
const pickArt = (title) => title.backdrop_data_uri || title.poster_data_uri;

// A display headline with an accent segment: serifLine('7', ' days to go')
const accentLine = (plain, italic) => {
  const h = el('h1', 'display', plain);
  if (italic != null) h.append(el('em', null, italic));
  return h;
};

// Caps kicker line merging release kind + date: "STREAMING · FRIDAY, JUNE 12".
// The date string is already US order (see formatWeekdayDayMonth).
// kind: 'cinema' | 'streaming' | 'rental' | 'tv' (colors the kind word); either part optional.
const KIND_TEXT = { cinema: 'In cinemas', streaming: 'Streaming', rental: 'At home', tv: 'New series' };
const metaCaps = (kind, dateText) => {
  const line = el('div', 'meta-caps');
  if (kind && KIND_TEXT[kind]) line.append(el('span', `kind ${kind}`, KIND_TEXT[kind]));
  if (kind && KIND_TEXT[kind] && dateText) line.append(document.createTextNode('  ·  '));
  if (dateText) line.append(document.createTextNode(dateText));
  return line;
};

// Brand chrome on every card: big plot wordmark top-left, and a footer
// strip with the site. (TMDB attribution lives in the profile bios and the
// website footer, not on the cards.)
const WORDMARK_PATH = '/*WORDMARK_PATH*/';
const plotMark = () => {
  const mark = el('div', 'plot-mark');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '52 -681 1568 871');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'plot');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('style', 'display:block;height:.871em;width:1.568em;overflow:visible');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', WORDMARK_PATH);
  svg.append(path);
  mark.append(svg);
  return mark;
};

const plotFooter = () => {
  const footer = el('div', 'plot-footer');
  const site = el('span', 'site', 'the');
  site.append(el('b', null, 'plot'));
  site.append(document.createTextNode('.tv'));
  footer.append(site);
  return footer;
};
