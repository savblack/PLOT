// Turns a drafted issue of "the week" into two files:
//   the Substack body, with the front matter and GIF notes removed
//   an email preview in the same words, plus the plot header and footer
// It does not rewrite sentences. write-issue.mjs is what drafts them. See THE-WEEK.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { colors } from '@plot/core/tokens.js';
import { articleErrors } from '../../supabase/functions/_shared/articleRules.js';

const APP = 'https://app.theplot.tv';
const INK = colors.light.textPrimary;
const FAINT = colors.light.textMuted;
const PINK = colors.light.accentText;
const HAIR = '#e6dfd3';
const PAPER = colors.light.bg;
const DISPLAY = "'Gabarito', 'DM Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const GIF_LINE = /^GIF:\s+\S.+$/;

const CANNED = [
  [/^\s*in this (issue|newsletter|email)\b/i, 'The letter starts with the week, not "in this issue".'],
  [/\blet's dive in\b/i, 'Cut "let\'s dive in".'],
  [/\bwithout further ado\b/i, 'Cut "without further ado".'],
  [/\bhere(?:'|’)s what you need to know\b/i, 'Cut "here\'s what you need to know".'],
  [/\bas an ai\b/i, 'A model does not appear in the letter.'],
  [/\bgenerated (?:this|the) (?:issue|letter|newsletter)\b/i, 'A model does not appear in the letter.'],
  [/\bonboarding\b/i, 'People on Plot names titles. It does not explain how the list was filtered.'],
];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function parseIssue(raw) {
  const text = String(raw).replace(/^\uFEFF/, '');
  if (!text.startsWith('---\n')) {
    return { error: 'The issue needs front matter, starting with ---.' };
  }
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return { error: 'The front matter never closes.' };
  const fields = {};
  for (const line of text.slice(4, end).split('\n')) {
    const match = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!match) continue;
    fields[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return {
    subject: fields.subject || '',
    previewText: fields.preview_text || '',
    date: fields.date || '',
    author: fields.author || '',
    body: text.slice(end + '\n---\n'.length),
  };
}

const plotLinks = (body) => [...body.matchAll(/https?:\/\/(?:www\.|app\.)?theplot\.tv[^\s)]*/gi)];
const images = (body) => [...body.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)];
const urlsIn = (body) => [...body.matchAll(/https?:\/\/[^)\s]+/gi)].map((match) => match[0].replace(/[.,]$/, ''));

const PUBLICATIONS = [
  'apnews.com', 'variety.com', 'hollywoodreporter.com', 'latimes.com', 'nytimes.com',
  'theguardian.com', 'rogerebert.com', 'vulture.com', 'indiewire.com', 'washingtonpost.com',
  'rollingstone.com', 'ew.com', 'vanityfair.com', 'newyorker.com', 'time.com', 'npr.org',
  'bbc.com', 'bbc.co.uk', 'theatlantic.com', 'avclub.com', 'polygon.com', 'ign.com',
  'deadline.com', 'thewrap.com', 'slashfilm.com', 'empireonline.com', 'reuters.com',
  'usatoday.com', 'theplaylist.net',
];

const parsedUrl = (url) => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

const redditThread = (url) => /reddit\.com\/r\/[^/]+\/comments\/[^/]+/i.test(url);

const saveLink = (url) => {
  const parsed = parsedUrl(url);
  if (!parsed || parsed.hostname !== 'app.theplot.tv' || parsed.pathname !== '/save') return false;
  const kind = parsed.searchParams.get('media_type');
  const id = Number(parsed.searchParams.get('tmdb_id'));
  return (kind === 'movie' || kind === 'tv') && Number.isInteger(id) && id > 0 && parsed.searchParams.get('src') === 'newsletter';
};

const publicationReview = (url) => {
  const parsed = parsedUrl(url);
  if (!parsed || parsed.pathname.length <= 1) return false;
  const host = parsed.hostname.replace(/^www\./, '');
  return PUBLICATIONS.some((site) => host === site || host.endsWith(`.${site}`));
};

const homepage = (url) => {
  const parsed = parsedUrl(url);
  return parsed ? parsed.pathname === '/' || parsed.pathname === '' : false;
};

const sectionBody = (body, title) => {
  const match = body.match(new RegExp(`^#{2,3}\\s+${title}\\s*$`, 'im'));
  if (!match) return null;
  const rest = body.slice(match.index + match[0].length);
  const next = rest.search(/^#{1,3}\s+/m);
  return next === -1 ? rest : rest.slice(0, next);
};

const TITLE_SECTIONS = ['In theaters', 'What everyone\'s talking about', 'Now on TV and Streaming', 'Coming up'];

const italicTitles = (section) => [...section.matchAll(/(^|[^*])\*([^*\n]+)\*(?!\*)/g)].length;
const comingUpEntries = (section) => section.split(/\n{2,}/)
  .filter((part) => /^\*[^*\n]+\*/.test(part.trim()));
const trailerLines = (section) => [...section.matchAll(/^TRAILER: https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/gm)];

// What's On prose checks that also apply to the letter. Three conflicts stay
// as letter exceptions: "critics are" and "reviews are" are how the letter
// reports volume, TMDB is named only in the closing footnote, and an audience score is
// allowed only as a dated gap with a critic figure. Article shape rules
// (a ratings closer, a cap on how often Rotten Tomatoes is named) stay on
// the articles.
const ALLOWED_NARRATION = /narrates research or reception \("(?:critics (?:are|were)|reviews are)"\)/i;
const AUDIENCE_SCORE = /\baudience (?:score|rating)\b|\bpopcornmeter\b|\bverified hot\b/i;
const DATED_DAY = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/i;
const CRITIC_FIGURE = /\b\d{1,3}\s*percent\b[^.]{0,80}\bcritic\b|\bcritic\b[^.]{0,80}\b\d{1,3}\s*percent\b/i;

const houseProseProblems = (subject, body) => {
  const paragraphs = body.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  const problems = [];
  for (const error of articleErrors({ page_title: subject, page_body: paragraphs.filter((part) => !part.startsWith('Image: ')) })) {
    if (/cites an audience score/.test(error)) continue;
    if (/names TMDB/.test(error)) continue;
    if (/cites a rating \d+ times/.test(error)) continue;
    if (/closes on a ratings sentence/.test(error)) continue;
    if (ALLOWED_NARRATION.test(error)) continue;
    problems.push(error
      .replace(/^page_title/, 'The subject')
      .replace(/^page_body\[\d+\]/, 'The letter'));
  }
  const footnote = paragraphs[paragraphs.length - 1] || '';
  const beforeFootnote = paragraphs.slice(0, -1).filter((part) => !part.startsWith('Image: ')).join('\n');
  if (/\bTMDB\b/.test(beforeFootnote)) {
    problems.push('Name TMDB only in the closing footnote.');
  }
  if (!/\bTMDB\b/.test(footnote)) {
    problems.push('The closing footnote names TMDB as the source of the chart and the artwork.');
  }
  for (const paragraph of paragraphs) {
    if (!AUDIENCE_SCORE.test(paragraph)) continue;
    if (DATED_DAY.test(paragraph) && CRITIC_FIGURE.test(paragraph)) continue;
    problems.push('An audience score is only for the gap with critics, and the sentence names the day.');
    break;
  }
  return problems;
};

export function lintIssue(issue) {
  if (issue.error) return [issue.error];
  const problems = [];
  const author = issue.author.trim();
  if (author.toLowerCase() !== 'plot') {
    problems.push('author is plot. Do not sign a person\'s name.');
  }

  const subject = issue.subject.trim();
  if (subject.length < 8) problems.push('Write a subject. It is also the Substack title.');
  if (/^this week in film\s*&\s*tv\b/i.test(subject)) {
    problems.push('That subject belongs to the old generated digest.');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue.date)) problems.push('date is YYYY-MM-DD.');
  else if (subject !== `Week of ${weekLabel(issue.date)}`) {
    problems.push(`The subject is Week of ${weekLabel(issue.date)}. It is the Substack title and email subject.`);
  }

  const preview = issue.previewText?.trim() || '';
  if (!preview || preview.length > 160) problems.push('Write preview_text: a specific Substack preview of 1 to 160 characters.');
  const body = issue.body;
  const firstBlock = body.trim().split(/\n{2,}/)[0] || '';
  if (/^(?:!\[|Image:|TRAILER:|#{1,3}\s)/.test(firstBlock.trim())) {
    problems.push('Start with the overview, before the featured artwork and its caption.');
  }
  if (body.includes('WRITE THIS')) problems.push('Replace every WRITE THIS before rendering.');
  if (body.includes('<!--')) problems.push('Take the notes out of the issue. They are not part of the letter.');
  if (/[—–]/.test(body) || /[—–]/.test(subject)) {
    problems.push('Use a period or a comma. A dash in the middle of a sentence is the tell this audience looks for.');
  }
  if (/[“”‘’]/.test(body) || /[“”‘’]/.test(subject)) {
    problems.push('Use straight quotes.');
  }
  for (const [pattern, message] of CANNED) {
    if (pattern.test(body)) problems.push(message);
  }
  const urls = urlsIn(body);
  const seen = new Set();
  for (const url of urls) {
    if (seen.has(url)) {
      problems.push(`This source is used more than once: ${url}. One page cannot carry two titles.`);
      break;
    }
    seen.add(url);
  }
  const home = urls.find(homepage);
  if (home) problems.push(`A homepage is not a source: ${home}`);
  if (!urls.some(redditThread)) {
    problems.push('Link a Reddit thread you opened. A subreddit homepage does not count.');
  }
  if (!urls.some(publicationReview)) {
    problems.push('Link a critic on the publication\'s own site. A score roundup does not count.');
  }
  for (const title of TITLE_SECTIONS) {
    const section = sectionBody(body, title);
    if (section === null) problems.push(`The letter needs ${title}, with more than one title.`);
    else {
      const minimum = (title === 'Coming up' || title === 'In theaters') ? 3 : 2;
      if (italicTitles(section) < minimum) problems.push(`${title} needs at least ${minimum} titles.`);
    }
  }
  const comingUp = sectionBody(body, 'Coming up');
  if (comingUp !== null) {
    const entries = comingUpEntries(comingUp);
    if (trailerLines(comingUp).length !== entries.length) {
      problems.push('Every Coming up title needs one official YouTube trailer.');
    }
    if (images(comingUp).length) {
      problems.push('Coming up uses trailer embeds, not promotional images.');
    }
  }
  const charts = sectionBody(body, 'The charts');
  if (charts === null || !/trending/i.test(charts)) {
    problems.push('The charts section introduces the trending chart.');
  } else {
    if (!charts.includes(weekLabel(issue.date))) {
      problems.push(`Date the trending top ten for ${weekLabel(issue.date)}.`);
    }
    if ((charts.match(/^\s*\d+\.\s+\S/gm) || []).length < 5) {
      problems.push('List at least five TMDB trending titles.');
    }
  }
  const weekend = sectionBody(body, 'Weekend watch');
  if (weekend === null) {
    problems.push('The letter needs Weekend watch, with more than one title.');
  } else {
    if (italicTitles(weekend) < 2) problems.push('Weekend watch needs more than one title.');
    if (!/\bwatchlist\b/i.test(weekend)) {
      problems.push('Weekend watch asks the reader to add these titles to their Plot watchlist before the weekend.');
    }
    const weekendUrls = urlsIn(weekend);
    if (weekendUrls.filter(saveLink).length < 2) {
      problems.push('Weekend watch needs a save link for each title it asks the reader to keep.');
    }
    if (!weekendUrls.some((url) => !/theplot\.tv/i.test(url))) {
      problems.push('Weekend watch needs a source for why these titles are this weekend\'s watch.');
    }
    const earlier = TITLE_SECTIONS.map((title) => sectionBody(body, title) || '').join('\n').toLowerCase();
    const names = [...new Set(
      [...weekend.matchAll(/(^|[^*])\*([^*\n]+)\*(?!\*)/g)].map((match) => match[2].trim().toLowerCase()),
    )];
    const repeated = names.filter((name) => earlier.includes(`*${name}*`));
    if (names.length - repeated.length < 1) {
      problems.push('Weekend watch needs a title the letter has not already recommended.');
    }
    if (repeated.length > 1) {
      problems.push('Weekend watch can bring back one title the letter already recommended, not the whole list.');
    }
  }
  const titleMedia = new Map();
  for (const url of urls) {
    const parsed = parsedUrl(url);
    if (!parsed || !/(^|\.)theplot\.tv$/i.test(parsed.hostname) || parsed.hostname.startsWith('app.')) continue;
    const match = parsed.pathname.match(/^\/(movie|tv)\/[^/]+-(\d+)$/);
    if (match) titleMedia.set(match[2], match[1]);
  }
  for (const url of urls) {
    const parsed = parsedUrl(url);
    if (!parsed || !saveLink(url)) continue;
    const id = parsed.searchParams.get('tmdb_id');
    const known = titleMedia.get(id);
    const kind = parsed.searchParams.get('media_type');
    if (known && known !== kind) {
      problems.push(`The save link for ${id} says ${kind}. The title URL says ${known}.`);
      break;
    }
  }
  const people = sectionBody(body, 'People on Plot');
  if (people !== null) {
    problems.push('People on Plot is paused. Leave the section out.');
    if (/\b\d+\s+(people|person|users|saves|searches|lookups)\b/i.test(people)
      || /\b(one|two|three|a single|only a few|a handful of) (person|people|users)\b/i.test(people)
      || /\b(small|tiny|early) (audience|user base)\b/i.test(people)
      || /\bthe list is (short|small)\b/i.test(people)) {
      problems.push('People on Plot names titles. It does not say how many people, or that the list is small.');
    }
  }
  const gifNotes = body.split('\n').filter((line) => GIF_LINE.test(line.trim()));
  const plots = plotLinks(body).length;
  if (plots < 4) {
    problems.push(`The letter has ${plots} links to Plot. It needs at least 4. Each one does a job.`);
  }
  if (plots > 16) {
    problems.push(`The letter has ${plots} links to Plot. The cap is 16. Do not put a save link on every row.`);
  }
  const memeImages = images(body).filter((match) => !/image\.tmdb\.org/i.test(match[2] || match[1]) && !/featured|promotional|backdrop|poster/i.test(match[1]));
  const slots = memeImages.length + gifNotes.length;
  if (slots < 1) problems.push('Leave a place for a meme or a gif. A GIF: line is the slot when you have no image.');
  if (slots > 3) problems.push(`The letter has ${slots} gifs. The cap is 3.`);
  const prose = body.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/\s+/g, ' ').trim();
  if (prose.length < 200) problems.push('The letter is too short to be an issue.');
  problems.push(...houseProseProblems(subject, body));
  return problems;
}

const weekLabel = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', timeZone: 'UTC',
  });
};

// `escaped` is for hrefs taken from text inline() has already escaped, so a
// query's & is not turned into &amp;amp; and dropped from the link.
const linkHtml = (text, url, { escaped = false } = {}) => {
  const plot = /theplot\.tv/i.test(url);
  const color = plot ? PINK : INK;
  return `<a href="${escaped ? url : esc(url)}" style="color:${color};text-decoration:underline;">${text}</a>`;
};

const inline = (raw) => {
  let html = esc(raw);
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => {
    if (alt.startsWith('Cover: ')) {
      return `<table role="presentation" width="100%" background="${url}" style="background:#171717 url('${url}') center/cover no-repeat;border-radius:12px;overflow:hidden;"><tr><td height="260" valign="bottom"><div style="padding:18px;background:rgba(0,0,0,0.72);color:#ffffff;font-family:${SANS};font-size:25px;font-weight:700;line-height:1.15;">${alt.slice(7)}</div></td></tr></table>`;
    }
    const poster = /poster/i.test(alt);
    const width = poster ? 180 : 536;
    return `<img src="${url}" alt="${alt}" width="${width}" style="display:block;width:${poster ? '180px' : '100%'};max-width:${width}px;height:auto;border-radius:12px;border:1px solid ${HAIR};margin:8px 0 4px;">`;
  });
  html = html.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_, text, url) => linkHtml(text, url, { escaped: true }));
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return html;
};

const blocks = (body, { review = false } = {}) => {
  const parts = body.trim().split(/\n{2,}/);
  return parts.map((part) => {
    const lines = part.split('\n');
    if (lines.length === 1 && GIF_LINE.test(lines[0].trim())) {
      return `<div style="font-family:${SANS};font-size:13px;line-height:1.45;color:${FAINT};background:#f6f1e8;border-radius:8px;padding:10px 12px;margin:14px 0 0;">Production note. This line is not in the sent letter.<br>${inline(lines[0].trim())}</div>`;
    }
    const trailer = part.match(/^TRAILER: https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/);
    if (trailer) {
      const id = trailer[1];
      const preview = `<a href="https://www.youtube.com/watch?v=${id}" style="color:${INK};"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="Watch the official trailer" width="536" style="display:block;width:100%;height:auto;border-radius:12px;">Watch the official trailer on YouTube</a>`;
      return review ? `<details style="margin-top:12px;font-family:${SANS};"><summary style="cursor:pointer;"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="Official trailer preview" width="536" style="display:block;width:100%;height:auto;border-radius:12px;">Play the official trailer</summary><iframe loading="lazy" title="Featured official trailer" src="https://www.youtube-nocookie.com/embed/${id}" style="width:100%;aspect-ratio:16/9;border:0;margin-top:12px;" allowfullscreen></iframe></details><div style="font-family:${SANS};font-size:12px;">${linkHtml('Watch on YouTube', `https://www.youtube.com/watch?v=${id}`)}</div>` : preview;
    }
    if (part.startsWith('Chart and title artwork:')) {
      return `<div style="font-family:${SANS};font-size:11px;line-height:1.5;color:${FAINT};margin:24px 0 0;">${inline(part)}</div>`;
    }
    if (part.startsWith('Image: ')) {
      return `<div style="font-family:${SANS};font-size:11px;line-height:1.5;color:${FAINT};margin:6px 0 16px;">${inline(part)}</div>`;
    }
    const heading = lines[0].match(/^(#{1,3})\s+(.+)$/);
    if (heading && lines.length === 1) {
      const size = heading[1].length === 1 ? 28 : 13;
      const style = heading[1].length === 1
        ? `font-family:${DISPLAY};font-size:${size}px;font-weight:700;line-height:1.15;letter-spacing:-0.03em;color:${INK};margin:28px 0 0;`
        : `font-family:${SANS};font-size:${size}px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${INK};margin:32px 0 0;`;
      return `<div style="${style}">${inline(heading[2])}</div>`;
    }
    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      const items = lines.map((line) => `<li style="margin:0 0 6px;">${inline(line.replace(/^[-*]\s+/, ''))}</li>`).join('');
      return `<ul style="font-family:${SANS};font-size:16px;line-height:1.55;color:${INK};margin:12px 0 0;padding-left:20px;">${items}</ul>`;
    }
    if (lines.every((line) => /^\d+\.\s+/.test(line))) {
      const items = lines.map((line) => `<li style="margin:0 0 6px;">${inline(line.replace(/^\d+\.\s+/, ''))}</li>`).join('');
      return `<ol style="font-family:${SANS};font-size:16px;line-height:1.55;color:${INK};margin:12px 0 0;padding-left:20px;">${items}</ol>`;
    }
    return `<div style="font-family:${SANS};font-size:16px;line-height:1.6;color:${INK};margin:14px 0 0;">${lines.map(inline).join('<br>')}</div>`;
  }).join('\n');
};

// GIF: lines are production notes. They never appear in the post.
export function publishedBody(body) {
  return body
    .split('\n')
    .filter((line) => !GIF_LINE.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n/, '')
    .replace(/\s+$/, '');
}

export function gifNotes(body) {
  return body.split('\n').map((line) => line.trim()).filter((line) => GIF_LINE.test(line));
}

export function renderSubstack(issue) {
  return publishedBody(issue.body).replace(/^TRAILER: /gm, '') + '\n';
}

export function renderEmail(issue, { unsubscribeUrl = '{{unsubscribe_url}}', review = false } = {}) {
  const label = weekLabel(issue.date);
  const body = review ? issue.body : publishedBody(issue.body);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(issue.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(issue.previewText || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
  <tr><td align="center" style="padding:30px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${HAIR};border-radius:16px;">
      <tr><td style="padding:44px 32px 0;text-align:center;">
        <img src="${APP}/logo-email.png" width="78" height="43" alt="plot" style="display:block;width:78px;height:43px;margin:0 auto;border:0;">
        <div style="font-family:${SANS};font-size:12px;font-weight:400;letter-spacing:0.12em;text-transform:uppercase;color:${FAINT};margin-top:14px;">the week of ${esc(label)}</div>
      </td></tr>
      <tr><td style="padding:8px 32px 36px;">
        ${blocks(body, { review })}
      </td></tr>
      <tr><td style="padding:22px 32px 26px;border-top:1px solid ${HAIR};background:#fafafa;border-radius:0 0 16px 16px;">
        <div style="font-family:${SANS};font-size:12px;line-height:1.6;color:${FAINT};">
          You're receiving this because you subscribed at theplot.tv.
          <a href="${esc(unsubscribeUrl)}" style="color:${FAINT};text-decoration:underline;">Unsubscribe</a><br>
          SUSUMU HOUSE &middot; Level 1, 63-73 Ann Street, Surry Hills, NSW 2010<br>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function renderIssueFile(path) {
  const raw = readFileSync(path, 'utf8');
  const issue = parseIssue(raw);
  const problems = lintIssue(issue);
  if (problems.length) {
    const error = new Error(problems.join('\n'));
    error.problems = problems;
    throw error;
  }
  const stem = basename(path).replace(/\.md$/, '');
  const dir = dirname(path);
  const illustrated = { ...issue };
  const emailPath = join(dir, `${stem}.email.html`);
  const reviewPath = join(dir, `${stem}.review.html`);
  const substackPath = join(dir, `${stem}.substack.md`);
  writeFileSync(emailPath, renderEmail(illustrated));
  writeFileSync(reviewPath, renderEmail(illustrated, { review: true }));
  writeFileSync(substackPath, renderSubstack(illustrated));
  const previewPath = join(dir, `${stem}.preview.txt`);
  writeFileSync(previewPath, `${issue.previewText.trim()}\n`);
  const notes = gifNotes(issue.body);
  const gifsPath = join(dir, `${stem}.gifs.txt`);
  if (notes.length) writeFileSync(gifsPath, `${notes.join('\n')}\n`);
  return { emailPath, reviewPath, substackPath, previewPath, gifsPath: notes.length ? gifsPath : '', subject: issue.subject };
}

const isMain = process.argv[1] && process.argv[1].endsWith('render-issue.mjs');
if (isMain) {
  const path = process.argv[2];
  if (!path) {
    console.error('Pass the issue file. Copy marketing/newsletter/issue-template.md first.');
    process.exit(1);
  }
  try {
    const out = renderIssueFile(path);
    console.log(out.substackPath);
    console.log(out.emailPath);
    console.log(out.reviewPath);
    console.log('Preview only. The unsubscribe link is a token until each recipient gets their own.');
    console.log(`Subject: ${out.subject}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
