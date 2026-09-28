import { posterUrl } from '../utils/images.js';
import { CARD_IDS, CARD_FORMATS } from '@plot/core/shareCards.js';
import { SHARE_CARDS as T } from '../copy/shareCards.js';
import './ShareCard.css';

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
  cream: { card: '#F8F2EA', ghost: '#ECE6DE' },
  sage: { card: '#DBE1B0', ghost: '#CBD0A3' },
  pink: { card: '#FF88C8', ghost: '#F07EBC' },
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
  const img = posterUrl(item.poster_path, 'w342');
  return (
    <div className="rank-cut-frame sc-frame" style={{ '--bg': ring }}>
      <div className="sc-post">{img && <img src={img} alt="" crossOrigin="anonymous" />}</div>
      <span className="rank-cut">{item.rank}</span>
    </div>
  );
}

function Top5({ card, story }) {
  const rings = RING[card.ground] || RING.cream;
  if (story) {
    return (
      <>
        <div className="sc-title sc-title--nowrap">
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
      <div className="sc-title sc-title--nowrap">
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

/**
 * @param {{ card: object, format?: 'post'|'story', nodeRef?: import('react').Ref<HTMLDivElement> }} props
 */
export default function ShareCard({ card, format = 'post', nodeRef }) {
  const f = CARD_FORMATS[format] || CARD_FORMATS.post;
  const story = f.id === 'story';
  const Body = card.id === CARD_IDS.HIGHLIGHTS ? Highlights
    : card.id === CARD_IDS.STREAK ? Streak
    : Top5;
  return (
    <div
      ref={nodeRef}
      className={`sc sc--${card.ground} sc--${card.id}${story ? ' sc--story' : ''}`}
      style={{ width: f.width, height: f.height, '--u': `${f.width / 100}px` }}
    >
      <Ghost />
      {story && card.handle && <span className="sc-handle" aria-hidden="true">{card.handle}</span>}
      <Body card={card} story={story} />
    </div>
  );
}
