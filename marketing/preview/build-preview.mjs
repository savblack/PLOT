// Template QA contact sheet: renders every post type with live TMDB data in
// both sizes (plus light/dark where the template supports theming) into
// marketing/preview/out/. Needs only TMDB_API_KEY — no DB, no posting.
//
//   TMDB_API_KEY=... npm run mkt:preview
//   open marketing/preview/out/index.html
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmdb } from '../lib/tmdb.mjs';
import { renderCard, closeBrowser, SIZES } from '../lib/render.mjs';
import { POST_TYPES } from '../lib/post-types.mjs';
import { isoDate, addDays, formatWeekRange, formatWeekdayDayMonth, formatDayMonth } from '../lib/dates.mjs';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');

// Sample payloads from live TMDB data (IDs resolved at runtime, never hardcoded).
const samplePayloads = async () => {
  const today = isoDate(new Date());
  const [windowReleases, trending, upcoming] = await Promise.all([
    tmdb.getReleasesInWindow(today, addDays(today, 6)),
    tmdb.getTrending('all', 'week'),
    tmdb.getUpcomingMovies(),
  ]);

  const pool = [...windowReleases.theatrical, ...windowReleases.digital, ...windowReleases.tv]
    .filter(t => t.poster_path)
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 6);

  const slateTitles = pool.map(item => ({
    title: item.title || item.name,
    release_kind: item.release_kind,
    when_label: formatWeekdayDayMonth(item.media_type === 'tv' ? item.first_air_date : item.release_date),
    poster_path: item.poster_path,
    backdrop_path: item.backdrop_path,
  }));

  const trendItems = trending
    .filter(t => ['movie', 'tv'].includes(t.media_type) && t.poster_path)
    .slice(0, 10)
    .map((item, i) => ({
      rank: i + 1,
      title: item.title || item.name,
      media_type: item.media_type,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      movement: [{ dir: 'same' }, { dir: 'up', delta: 3 }, { dir: 'down', delta: 1 }, { dir: 'new' }][i % 4],
      movement_label: ['Holding the top spot', 'Up 3 this week', 'Down 1 this week', 'New this week'][i % 4],
    }));

  const hyped = upcoming.filter(m => m.poster_path && m.backdrop_path)[0] || trending[0];
  const hypedTitle = {
    title: hyped.title || hyped.name,
    poster_path: hyped.poster_path,
    backdrop_path: hyped.backdrop_path,
    where: 'Netflix',
  };

  const anniversaries = await tmdb.getAnniversaries(25, 50).catch(() => []);
  const otd = anniversaries.find(m => m.poster_path)
    || trending.find(t => t.media_type === 'movie' && t.poster_path);

  return {
    weekly_slate: { week_label: formatWeekRange(today, addDays(today, 6)), titles: slateTitles },
    trending_chart: { week_label: `Week of ${formatDayMonth(today)}`, items: trendItems },
    countdown: {
      days_until: 7,
      kind: 'cinema',
      when_label: formatWeekdayDayMonth(hyped.release_date || addDays(today, 7)),
      title: hypedTitle,
    },
    now_streaming: {
      providers: ['Netflix', 'Prime Video'], // payload-only: copy may use it, the image won't
      title: hypedTitle,
    },
    trailer_drop: {
      kind: 'cinema',
      when_label: formatWeekdayDayMonth(hyped.release_date || addDays(today, 30)),
      title: hypedTitle,
    },
    on_this_day: {
      years: 25,
      release_year: otd?.release_date ? Number(otd.release_date.slice(0, 4)) : 2001,
      title: {
        title: otd?.title,
        poster_path: otd?.poster_path,
        backdrop_path: otd?.backdrop_path,
      },
    },
  };
};

const main = async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const payloads = await samplePayloads();

  // Which platform sees which render (mirrors publish.mjs):
  //   portrait  -> Instagram carousel; landscape -> Threads carousel;
  //   X gets ONE landscape image: the first card that allows 'x'.
  //   cards[i].channels (null = all) limits a card to specific platforms.
  const allows = (card, ch) => !card.channels || card.channels.includes(ch);
  const channelLabel = (type, cards, cardIndex, size) => {
    const card = cards[cardIndex];
    const seq = (ch) => {
      const list = cards.filter(c => allows(c, ch));
      const pos = list.indexOf(card);
      return list.length > 1 ? ` · carousel ${pos + 1}/${list.length}` : '';
    };
    const parts = [];
    if (size === 'portrait') {
      if (allows(card, 'instagram')) {
        parts.push(`Instagram${seq('instagram')}`);
        if (type === 'weekly_slate' && cardIndex === 0) parts.push('email digest');
      }
    } else {
      if (allows(card, 'x') && cards.findIndex(c => allows(c, 'x')) === cardIndex) {
        parts.push('X · the single image');
      }
      if (allows(card, 'threads')) parts.push(`Threads${seq('threads')}`);
    }
    return parts.join('  +  ') || 'unused';
  };

  const entries = [];
  for (const [type, spec] of Object.entries(POST_TYPES)) {
    console.log(`Rendering ${type}…`);
    const cards = await spec.cards(payloads[type]);
    for (let i = 0; i < cards.length; i++) {
      for (const size of Object.keys(SIZES)) {
        const label = channelLabel(type, cards, i, size);
        if (label === 'unused') continue; // e.g. portrait render of an X-only card
        const file = `${type}-card${i}-${size}.jpg`;
        const jpeg = await renderCard(spec.template, cards[i].data, { size });
        await writeFile(path.join(OUT_DIR, file), jpeg);
        entries.push({ type, card: i, size, file, channel: label });
      }
    }
  }
  await closeBrowser();

  const groups = [...new Set(entries.map(e => e.type))].map(type => {
    const imgs = entries.filter(e => e.type === type).map(e =>
      `<figure><img src="${e.file}" loading="lazy"><figcaption><b>${e.channel}</b><br>${e.size === 'portrait' ? '1080×1350' : '1600×900'}</figcaption></figure>`
    ).join('');
    return `<section><h2>${type.replace(/_/g, ' ')}</h2><div class="grid">${imgs}</div></section>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PLOT marketing templates</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #18181B; color: #FAFAFA; padding: 40px; }
    h1 { font-size: 1.4rem; } h2 { font-size: 1.05rem; margin: 40px 0 12px; text-transform: capitalize; }
    .grid { display: flex; flex-wrap: wrap; gap: 16px; }
    figure { margin: 0; }
    img { width: 300px; border-radius: 10px; display: block; }
    figcaption { font-size: 0.72rem; color: #A1A1AA; margin-top: 6px; line-height: 1.5; }
    figcaption b { color: #FAFAFA; font-weight: 500; }
  </style></head><body>
  <h1>PLOT marketing templates — contact sheet</h1>
  <p style="color:#A1A1AA;font-size:0.85rem;">Live TMDB data, generated ${new Date().toISOString()}</p>
  ${groups}</body></html>`;

  await writeFile(path.join(OUT_DIR, 'index.html'), html);
  console.log(`\nWrote ${entries.length} renders + contact sheet to marketing/preview/out/index.html`);
};

main().catch(async (err) => { console.error(err); await closeBrowser(); process.exit(1); });
