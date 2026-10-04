import { posterUrl, profileUrl } from '../utils/images.js';
import { CARD_IDS, CARD_FORMATS, shareCardPalette } from '@plot/core/shareCards.js';
import { SHARE_CARDS as T } from '../copy/shareCards.js';
import './ShareCard.css';

// TMDB only sends CORS headers when a request carries an Origin, and sends no
// Vary. A poster already cached from a plain <img> elsewhere in the app is
// reused for this crossOrigin request and rejected, so the card's images get
// their own cache key.
const corsSafe = (url) => (url ? `${url}?sc=1` : url);

/* A share card at its native pixel size (1200x800 for a post, 1080x1920 for
   a story). Every measurement in ShareCard.css is a multiple of --u, one
   hundredth of the card's width, so the layout is the one approved on the
   canvas at any size. The sheet scales the whole thing down with a transform
   for the preview and hands the unscaled node to html-to-image for the PNG.

   DOM-only by nature (it is what gets rasterised); mobile draws the same
   card in React Native and captures it with view-shot. The data comes from
   @plot/core/shareCards.js so the two agree on every number. */

const RING = {
  // The rank numeral's ring must match what it sits on. Where a numeral
  // crosses the ghost wordmark it takes the ghost's blended colour instead of
  // the card's; on the landscape Top 5 that is every numeral but the fourth.
  // The vars are set by a theme family's palette (shareCardPalette); the
  // literals are the default look.
  cream: { card: 'var(--sc-r-cream, #F8F2EA)', ghost: 'var(--sc-r-cream-g, #ECE6DE)' },
  sage: { card: 'var(--sc-r-sage, #DBE1B0)', ghost: 'var(--sc-r-sage-g, #CBD0A3)' },
  pink: { card: 'var(--sc-r-pink, #FF88C8)', ghost: 'var(--sc-r-pink-g, #F07EBC)' },
};

function Ghost() {
  return <div className="sc-ghost" aria-hidden="true"><span>plot</span></div>;
}

function Foot({ right }) {
  return (
    <div className="sc-foot">
      <span className="sc-wm">plot</span>
      <span className="sc-url">{right || T.site}</span>
    </div>
  );
}

function Highlights({ card, story }) {
  const labels = { titles: T.titlesWatched, onScreen: T.onScreen, genre: T.topGenre, rating: T.averageRating };
  return (
    <>
      <div className="sc-title">{T.highlightsTitle(card.year, card.isCurrentYear)}</div>
      <div className={`sc-hl${story ? ' sc-hl--story' : ''}`}>
        {card.tiles.map(t => (
          <div key={t.key} className="sc-panel sc-tile">
            <div className="sc-big">{t.value}</div>
            <div className="sc-lab">{labels[t.key]}</div>
          </div>
        ))}
      </div>
      <Foot />
    </>
  );
}

function Streak({ card, story }) {
  return (
    <>
      <div className="sc-title">{T.streakTitle}</div>
      <div className={`sc-panel sc-streak${story ? ' sc-streak--story' : ''}`}>
        <span className="sc-big sc-streak-n">{card.days}</span>
        <span className="sc-streak-days">{T.days}</span>
      </div>
      <Foot />
    </>
  );
}

function Poster({ item, ring }) {
  const img = corsSafe(posterUrl(item.poster_path, 'w342'));
  return (
    <div className="rank-cut-frame sc-frame" style={{ '--bg': ring }}>
      <div className="sc-post">{img && <img src={img} alt="" crossOrigin="anonymous" />}</div>
      <span className="rank-cut">{item.rank}</span>
    </div>
  );
}

function Top5({ card, story }) {
  const rings = RING[card.ground] || RING.cream;
  // A full name ("Savannah Black's Top 5") plus the chip is wider than the
  // card at the usual title size, which wraps the chip and pushes the footer
  // off the bottom.
  const titleCls = `sc-title sc-title--nowrap${(card.owner || '').length > 9 ? ' sc-title--long' : ''}`;
  if (story) {
    return (
      <>
        <div className={titleCls}>
          {T.top5Short(card.owner)}
          <span className="sc-kind">{card.kind === 'tv' ? T.kindTv : T.kindMovies}</span>
        </div>
        <div className="sc-top5 sc-top5--story">
          {card.items.map(it => (
            <figure key={it.rank} className="sc-row">
              <Poster item={it} ring={rings.card} />
              <figcaption className="sc-cap sc-cap--story">{it.title}</figcaption>
            </figure>
          ))}
        </div>
        <Foot />
      </>
    );
  }
  // "Savannah's Top 5 TV series" wraps at 1200 wide, so the kind is a chip
  // on the post card too, the same as the story.
  return (
    <>
      <div className={titleCls}>
        {T.top5Short(card.owner)}
        <span className="sc-kind">{card.kind === 'tv' ? T.kindTv : T.kindMovies}</span>
      </div>
      <div className="sc-top5">
        {card.items.map(it => (
          <figure key={it.rank} className="sc-col">
            <Poster item={it} ring={it.rank === 4 ? rings.card : rings.ghost} />
            <figcaption className="sc-cap">{it.title}</figcaption>
          </figure>
        ))}
      </div>
      <Foot right={card.handle} />
    </>
  );
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function Activity({ card, story }) {
  // The post shows the year to date; a story is too narrow for that many
  // columns, so it shows the last quarter.
  const { weeks, months, best } = story ? card.quarter : card;
  const cols = weeks.length;
  return (
    <>
      <div className="sc-title">{T.activityTitle}</div>
      <div className="sc-panel sc-act">
        {/* Cells fill the panel but stop growing at a size that looks right, so
            a young year (a few columns) is a small grid, not a few huge squares. */}
        <div className="sc-hm" style={{ gridTemplateColumns: `auto repeat(${cols}, minmax(0, 1fr))`, maxWidth: `calc(var(--u) * ${cols * (story ? 6 : 2.7) + (story ? 7 : 4)})` }}>
          <span style={{ gridRow: 1, gridColumn: 1 }} />
          {months.map(m => <span key={`${m.label}-${m.col}`} className="sc-hm-m" style={{ gridRow: 1, gridColumn: m.col + 2 }}>{m.label}</span>)}
          {/* Every cell is placed by hand: with the month labels sitting in
              row 1 by column, auto-placement would pour the cells into the
              gaps beside them. */}
          {[0, 1, 2, 3, 4, 5, 6].map(d => (
            <div key={d} className="sc-hm-r" style={{ display: 'contents' }}>
              <span className="sc-hm-d" style={{ gridRow: d + 2, gridColumn: 1 }}>{DAY_LABELS[d]}</span>
              {weeks.map((w, wi) => {
                const c = w[d];
                const cls = ['sc-hm-c', c.best ? 'sc-hm-c--best' : c.level ? `sc-hm-c--l${c.level}` : '', c.future || c.before ? 'sc-hm-c--off' : '', c.today ? 'sc-hm-c--today' : ''].filter(Boolean).join(' ');
                return <i key={wi} className={cls} style={{ gridRow: d + 2, gridColumn: wi + 2 }} />;
              })}
            </div>
          ))}
        </div>
        {best && (
          <div className="sc-hm-legend"><i className="sc-hm-c sc-hm-c--best" /><span>{T.bestDay(best.label, best.count)}</span></div>
        )}
      </div>
      <Foot />
    </>
  );
}

function Crowd({ card, story }) {
  // The arc runs from the left end (harsher) to the right (kinder); the
  // gauge is 0..1 along it. Radius 42 around (50,54) in a 100x60 box.
  const angle = Math.PI * (1 - card.gauge);
  const ex = 50 + 42 * Math.cos(angle), ey = 54 - 42 * Math.sin(angle);
  // The arc never exceeds a half circle, so the large-arc flag is always 0.
  const large = 0;
  return (
    <>
      <div className="sc-title">{T.crowdTitle}</div>
      <div className={`sc-panel sc-crowd${story ? ' sc-crowd--story' : ''}`}>
        <div className="sc-arc">
          <svg viewBox="0 0 100 60">
            <path d="M8 54 A42 42 0 0 1 92 54" fill="none" style={{ stroke: 'var(--sc-empty, #F1E9DC)' }} strokeWidth="9" strokeLinecap="round" />
            {card.gauge > 0.02 && <path d={`M8 54 A42 42 0 ${large} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`} fill="none" style={{ stroke: 'var(--sc-accent, #FF88C8)' }} strokeWidth="9" strokeLinecap="round" />}
            <text x="50" y="44" textAnchor="middle" fontFamily="Gabarito" fontWeight="700" fontSize="17" style={{ fill: 'var(--sc-ink, #292924)' }}>{card.delta}</text>
            <text x="50" y="56" textAnchor="middle" fontFamily="DM Sans" fontWeight="600" fontSize="6" style={{ fill: 'var(--sc-soft, #5F5A52)' }} letterSpacing=".8">{T.crowdWord[card.word]}</text>
          </svg>
        </div>
        <div className="sc-crowd-text">
          <div className="sc-big sc-crowd-head">{card.headline}</div>
          {card.except && <div className="sc-sub">{card.except}</div>}
          <div className="sc-lab">{T.crowdAcross(card.compared)}</div>
        </div>
      </div>
      <Foot />
    </>
  );
}

function Genres({ card }) {
  return (
    <>
      <div className="sc-title">{T.genresTitle}</div>
      <div className="sc-panel sc-genres">
        {card.rows.map((r, i) => (
          <div key={r.name} className="sc-bar">
            <span className="sc-bar-n">{r.name}</span>
            <span className="sc-bar-t"><span className={`sc-bar-f${i === 0 ? ' sc-bar-f--lead' : ''}`} style={{ width: `${Math.max(r.width, 14)}%` }}>{r.pct}%</span></span>
            <span className="sc-bar-c">{T.genreCount(r.count)}</span>
          </div>
        ))}
      </div>
      <Foot />
    </>
  );
}

function Person({ card, story }) {
  const img = corsSafe(profileUrl(card.profile_path, 'w185'));
  return (
    <>
      <div className="sc-title">{T.personTitle}</div>
      <div className={`sc-panel sc-person${story ? ' sc-person--story' : ''}`}>
        <div className="sc-person-avatar">{img ? <img src={img} alt="" crossOrigin="anonymous" /> : <span>{(card.name || '?').charAt(0)}</span>}</div>
        <div className="sc-person-text">
          <div className="sc-big sc-person-name">{card.name}</div>
          {card.line && <div className="sc-sub">{card.line}.</div>}
          <div className="sc-chips">{card.titles.map(t => <span key={t} className="sc-chip">{t}</span>)}</div>
        </div>
      </div>
      <Foot />
    </>
  );
}

function MonthWrap({ card }) {
  const rows = [
    [T.rowTitles, String(card.count)],
    [T.rowBestNight, card.bestNight ? `${card.bestNight.label} · ${T.nightCount(card.bestNight.count)}` : T.none],
    [T.rowFiveStars, card.fiveStars.length ? card.fiveStars.slice(0, 2).join(', ') : T.none],
    [T.rowDidntFinish, String(card.dnf)],
  ];
  return (
    <>
      <div className="sc-title">{T.monthWrapTitle(card.monthName)}</div>
      <div className="sc-panel sc-wrap">
        {rows.map(([label, value]) => (
          <div key={label} className="sc-wrap-row"><span>{label}</span><b>{value}</b></div>
        ))}
      </div>
      <Foot />
    </>
  );
}

/**
 * `family` is a Premium theme family id ('sage', 'mist', 'blush', 'plum',
 * 'ink') to draw the card in that family's colours; leave it out for the
 * default look.
 * @param {{ card: object, format?: 'post'|'story', family?: string, nodeRef?: import('react').Ref<HTMLDivElement> }} props
 */
export default function ShareCard({ card, format = 'post', family, nodeRef }) {
  const f = CARD_FORMATS[format] || CARD_FORMATS.post;
  const story = f.id === 'story';
  const Body = card.id === CARD_IDS.HIGHLIGHTS ? Highlights
    : card.id === CARD_IDS.STREAK ? Streak
    : card.id === CARD_IDS.MONTH_WRAP ? MonthWrap
    : card.id === CARD_IDS.ACTIVITY ? Activity
    : card.id === CARD_IDS.CROWD ? Crowd
    : card.id === CARD_IDS.GENRES ? Genres
    : card.id === CARD_IDS.PERSON ? Person
    : Top5;
  return (
    <div
      ref={nodeRef}
      className={`sc sc--${card.ground} sc--${card.id}${story ? ' sc--story' : ''}`}
      style={{ width: f.width, height: f.height, '--u': `${f.width / 100}px`, ...shareCardPalette(family) }}
    >
      <Ghost />
      {story && card.handle && <span className="sc-handle" aria-hidden="true">{card.handle}</span>}
      <Body card={card} story={story} />
    </div>
  );
}
