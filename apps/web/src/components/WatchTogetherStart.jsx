// Watch together for someone with nobody to watch with yet: the people they
// follow and what they have in common (or a pitch when they follow nobody), an
// example and a try-it demo, how it works, their invite link and a note for
// people who were invited. Free members see the Premium prompt; everyone can
// invite. Design: the "Watch together on Free" row of the canvas linked from
// docs/design/watch-together/README.md. Rules: @plot/core watchTogether.js.
// Mobile parity: not built yet; tracked in the Watch together PR.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { personName, pickDemoDeck, demoPartnerSaysYes } from '@plot/core/watchTogether.js';
import { useWatchTogetherLink, useWatchTogetherExampleTitles } from '@plot/core/useWatchTogether.js';
import { buildWatchTogetherLinkUrl, SHARE_ORIGIN } from '@plot/core/sharing.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { posterUrl } from '../utils/images.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
import { isPreviewDeployment } from '../utils/previewDeployment.js';
import { shareUrl } from '../utils/share.js';
import { readStorage, writeStorage } from '../utils/storage.js';
import { PersonAvatar } from './WatchTogetherParts.jsx';

const S = T.start;

// Tone blocks stand in for posters in the example; it is not real data.
// Shades come from tokens in WatchTogetherView.css (.wt-ph-1 to .wt-ph-5).
const EXAMPLE_POSTERS = [1, 2, 3, 4, 5];

export function Wordmark() {
  return <span className="wt-wordmark">plot</span>;
}

/** Links point at the host you're on for previews (they use Staging's data). */
function linkOrigin() {
  return isPreviewDeployment() && typeof window !== 'undefined' ? window.location.origin : SHARE_ORIGIN;
}

/** The reusable invite link, its preview, and Share / Copy. */
export function InviteLinkCard({ compact = false }) {
  const { user, profile, watchlist } = useApp();
  // Real posters: your saved titles first, topped up from trending.
  const pool = useWatchTogetherExampleTitles(compact ? null : watchlist?.items);
  const posters = Array.from({ length: 5 }, (_, i) => pool[i] || null);
  const { key } = useWatchTogetherLink(user?.id);
  const [copied, setCopied] = useState(false);
  const url = buildWatchTogetherLinkUrl({ username: profile?.username || '', key: key || '', origin: linkOrigin() });
  const name = personName(profile || {});
  const display = url ? url.replace(/^https?:\/\//, '') : '';

  const share = async () => {
    if (!url) return;
    const result = await shareUrl({ url, title: T.link.previewTitle(name), text: T.link.shareText });
    if (result.ok && result.method === 'copy') setCopied(true);
  };
  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* clipboard blocked */ }
  };

  if (compact) {
    return (
      <section className="wt-card wt-linkcard wt-linkcard--compact">
        <span className="wt-person-text">
          <span className="wt-person-name">{T.link.inviteTitle}</span>
          <span className="wt-note">{T.link.inviteBody}</span>
        </span>
        <div className="wt-linkrow">
          <span className="wt-linkurl">{display}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={copy} disabled={!url}>{copied ? T.link.copied : T.link.copy}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={share} disabled={!url}>{T.link.share}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="wt-card wt-linkcard" aria-labelledby="wt-link-title">
      <span className="wt-kicker">{T.link.kicker}</span>
      <h2 className="wt-card-title" id="wt-link-title">{T.link.title}</h2>
      <p className="wt-card-body">{T.link.body}</p>
      <div className="wt-linkpreview" aria-hidden="true">
        <div className="wt-linkpreview-art">
          <span className="wt-linkpreview-kicker">{T.navLabel}</span>
          <span className="wt-linkpreview-row">
            {posters.map((t, i) => (
              t
                ? <img key={`${t.media_type}:${t.tmdb_id}`} className={`wt-linkpreview-poster wt-linkpreview-poster--${i}`} src={posterUrl(t.poster_path, 'w185')} alt="" loading="lazy" />
                : <span key={i} className={`wt-linkpreview-poster wt-linkpreview-poster--${i} wt-ph-${i + 1}`} />
            ))}
          </span>
          <span className="wt-linkpreview-mark"><Wordmark /></span>
        </div>
        <div className="wt-linkpreview-meta">
          <PersonAvatar person={profile} size="sm" />
          <span className="wt-person-text">
            <span className="wt-person-name">{T.link.previewTitle(name)}</span>
            <span className="wt-note wt-linkpreview-url">{display}</span>
          </span>
        </div>
      </div>
      <div className="wt-top-actions">
        <button type="button" className="btn btn-primary" onClick={share} disabled={!url}>{T.link.share}</button>
        <button type="button" className="btn btn-secondary" onClick={copy} disabled={!url}>{copied ? T.link.copied : T.link.copy}</button>
      </div>
    </section>
  );
}

function PremiumPrompt({ label }) {
  return (
    <div className="wt-premium-prompt">
      <Link to={premiumPlansPath('/together')} className="btn btn-primary">{label}</Link>
      <span className="wt-note">{S.premiumNote(PLANS_PAGE.premium.priceSummary)}</span>
    </div>
  );
}

function Overlaps({ people, premium, sent, onInvite }) {
  return (
    <section className="wt-card" aria-labelledby="wt-start-title">
      <h2 className="wt-card-title" id="wt-start-title">{S.overlapsTitle}</h2>
      <p className="wt-card-body">{premium ? S.premiumOverlapsBody : S.overlapsBody}</p>
      <div className="wt-section">
        {people.map(p => (
          <div key={p.id} className="wt-row">
            <PersonAvatar person={p} />
            <span className="wt-person-text"><span className="wt-person-name">{personName(p)}</span></span>
            {typeof p.overlap_count === 'number'
              ? <span className="wt-count">{S.inCommon(p.overlap_count)}</span>
              : <span className="wt-note">{S.countLater}</span>}
            {sent.has(p.id)
              ? <span className="wt-chip">{T.invite.sent}</span>
              : <button type="button" className="btn btn-secondary btn-sm" onClick={() => onInvite(p)}>{T.invite.invite}</button>}
          </div>
        ))}
      </div>
      {!premium && <PremiumPrompt label={S.getPremium} />}
    </section>
  );
}

function Pitch({ premium }) {
  return (
    <section className="wt-card" aria-labelledby="wt-start-title">
      <h2 className="wt-card-title" id="wt-start-title">{S.pitchTitle}</h2>
      <p className="wt-card-body">{S.pitchBody}</p>
      {!premium && <PremiumPrompt label={S.getPremium} />}
      <HowItWorks premium={premium} inCard />
    </section>
  );
}

function Example({ titles }) {
  const shown = titles.slice(0, 5);
  return (
    <div className="wt-card wt-example">
      <div className="wt-demo-head wt-example-head">
        <div className="wt-person">
          <span className="wt-avatar wt-avatar--md" aria-hidden="true">{S.exampleName.charAt(0)}</span>
          <span className="wt-person-text"><span className="wt-person-name">{S.examplePair}</span><span className="wt-note">{S.exampleCount}</span></span>
        </div>
        <span className="wt-example-badge">{S.example}</span>
      </div>
      <div className="wt-example-body">
      <ul className="wt-example-posters">
        {shown.length
          ? shown.map(t => (
            <li key={`${t.media_type}:${t.tmdb_id}`} className="wt-example-title">
              <img className="wt-example-poster" src={posterUrl(t.poster_path, 'w185')} alt="" loading="lazy" />
              <span className="wt-example-caption">{t.title}</span>
            </li>
          ))
          : EXAMPLE_POSTERS.map(n => <li key={n} className="wt-example-title" aria-hidden="true"><span className={`wt-example-poster wt-ph-${n}`} /></li>)}
      </ul>
      {shown[0] && (
        <div className="wt-person wt-example-match">
          <svg className="wt-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>
          <span className="wt-person-text"><span className="wt-person-name">{S.exampleMatch(shown[0].title)}</span><span className="wt-note">{S.exampleMatchNote}</span></span>
        </div>
      )}
      </div>
    </div>
  );
}

/**
 * Five of your own titles (topped up from trending), with an example partner
 * who answers at random and always matches by the last card. Each answer shows
 * what you and Sam said. The parent keys this on the pool size, so the deck is
 * drawn once real titles have loaded.
 */
function Demo({ premium, pool }) {
  const [deck, setDeck] = useState(() => pickDemoDeck(pool));
  const [index, setIndex] = useState(0);
  const [match, setMatch] = useState(null);
  const [last, setLast] = useState(/** @type {{ title: string, mine: boolean, theirs: boolean } | null} */ (null));
  const card = deck[index];
  const name = S.exampleName;
  const say = (yes) => (yes ? T.session.yes : T.session.no);
  const again = () => { setDeck(pickDemoDeck(pool)); setIndex(0); setMatch(null); setLast(null); };
  const answer = (yes) => {
    const theirs = demoPartnerSaysYes({ index, total: deck.length, matchedSoFar: !!match });
    setLast({ title: card.title, mine: yes, theirs });
    if (yes && theirs) setMatch(card);
    setIndex(i => i + 1);
  };

  const head = (
    <div className="wt-demo-head">
      <span className="wt-section-label">{S.demoHeading}</span>
      <span className="wt-example-badge">{S.example}</span>
    </div>
  );
  const response = last && (
    <div className="wt-demo-response" role="status">
      <span className="wt-note">{last.title}</span>
      <span className="wt-demo-answers">
        <span className={`wt-demo-answer${last.mine ? ' yes' : ''}`}>{S.demoYouSaid(say(last.mine))}</span>
        <span className={`wt-demo-answer${last.theirs ? ' yes' : ''}`}>{S.demoTheySaid(name, say(last.theirs))}</span>
      </span>
    </div>
  );

  if (!deck.length) {
    return <div className="wt-card wt-example wt-demo">{head}<p className="wt-note">{S.demoEmpty}</p></div>;
  }
  if (match) {
    return (
      <div className="wt-card wt-example wt-demo" role="status">
        {head}
        <DemoPoster title={match} />
        <span className="wt-chip wt-chip--accent">{S.demoDoneTitle}</span>
        <span className="wt-person-name">{match.title}</span>
        <p className="wt-card-body">{S.demoDoneBody}</p>
        <div className="wt-top-actions">
          {!premium && <Link to={premiumPlansPath('/together')} className="btn btn-primary btn-sm">{S.getPremium}</Link>}
          <button type="button" className="btn btn-secondary btn-sm" onClick={again}>{S.demoAgain}</button>
        </div>
      </div>
    );
  }
  if (!card) {
    return (
      <div className="wt-card wt-example wt-demo">
        {head}
        {response}
        <span className="wt-person-name">{S.demoNoMatchTitle}</span>
        <p className="wt-card-body">{S.demoNoMatchBody}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={again}>{S.demoAgain}</button>
      </div>
    );
  }
  const year = (card.release_date || '').slice(0, 4);
  return (
    <div className="wt-card wt-example wt-demo">
      {head}
      <DemoPoster title={card} counter={T.session.counter(index + 1, deck.length)} />
      <span className="wt-person-name wt-center">{card.title}</span>
      {year && <span className="wt-note">{[year, card.media_type === 'tv' ? T.overlap.show : null].filter(Boolean).join(' · ')}</span>}
      <div className="wt-top-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => answer(false)}>{T.session.no}</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => answer(true)}>{T.session.yes}</button>
      </div>
      {response}
      <p className="wt-note wt-center">{S.demoNote}</p>
    </div>
  );
}

function DemoPoster({ title, counter }) {
  const url = posterUrl(title.poster_path, 'w342');
  return (
    <span className="wt-demo-poster">
      {url ? <img src={url} alt="" /> : <span className="wt-poster--empty" aria-hidden="true" />}
      {counter && <span className="wt-swipe-counter">{counter}</span>}
    </span>
  );
}

function HowItWorks({ premium, inCard = false }) {
  const steps = premium ? [{ ...S.steps[0], body: S.premiumFirstStep }, ...S.steps.slice(1)] : S.steps;
  const Heading = inCard ? 'h3' : 'h2';
  return (
    <section className={`wt-how${inCard ? ' wt-how--in-card' : ''}`} aria-labelledby={inCard ? 'wt-how-title-card' : 'wt-how-title'}>
      <Heading className="wt-card-title" id={inCard ? 'wt-how-title-card' : 'wt-how-title'}>{S.howTitle}</Heading>
      <ol className="wt-steps">
        {steps.map((step, i) => (
          <li key={step.title} className="wt-step">
            <span className="wt-step-n" aria-hidden="true">{i + 1}</span>
            <span className="wt-person-text"><span className="wt-person-name">{step.title}</span><span className="wt-note">{step.body}</span></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * @param {{ premium: boolean, suggested: import('@plot/core/watchTogether.js').WatchTogetherSuggestion[],
 *   onInvite: (person: { id: string }) => Promise<boolean> }} props
 */
const WELCOME_KEY = 'plot_wt_premium_welcome_dismissed';

/** "You're on Premium" on the Premium start page, until it's dismissed. */
function PremiumWelcome() {
  const [show, setShow] = useState(() => readStorage(WELCOME_KEY) !== '1');
  if (!show) return null;
  const dismiss = () => { writeStorage(WELCOME_KEY, '1'); setShow(false); };
  return (
    <div className="wt-welcome" role="status">
      <svg className="wt-welcome-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" /><path d="M3 13a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M6 19v2" /><path d="M18 19v2" /></svg>
      <span className="wt-banner-text"><span className="wt-banner-title">{S.premiumTitle}</span><span className="wt-welcome-body">{S.premiumBody}</span></span>
      <button type="button" className="wt-welcome-close" aria-label={T.hub.dismiss} onClick={dismiss}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}

export default function WatchTogetherStart({ premium, suggested, onInvite }) {
  const { watchlist } = useApp();
  const titles = useWatchTogetherExampleTitles(watchlist?.items);
  const [sent, setSent] = useState(() => new Set());
  const invite = async (person) => {
    if (await onInvite(person)) setSent(prev => new Set(prev).add(person.id));
  };

  if (premium) {
    // Inviting is the job now: people, then the link, then how it works, and
    // the demo last as something to try while waiting.
    return (
      <div className="wt-start wt-start--premium">
        <h1 className="wt-sr">{T.hub.title}</h1>
        <div className="wt-start-welcome"><PremiumWelcome /></div>
        <div className="wt-start-top">
          {suggested.length
            ? <Overlaps people={suggested} premium sent={sent} onInvite={invite} />
            : <Pitch premium />}
        </div>
        <div className="wt-start-link"><InviteLinkCard /></div>
        {suggested.length > 0 && <div className="wt-start-how"><HowItWorks premium /></div>}
        <div className="wt-start-seeit">
          <div className="wt-person-text">
            <h2 className="wt-card-title">{S.seeItTitle}</h2>
            <span className="wt-note">{S.premiumSeeItBody}</span>
          </div>
          <div className="wt-start-pair wt-start-pair--single">
            <Demo key={titles.length >= 5 ? 'ready' : 'waiting'} premium pool={titles} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wt-start">
      <h1 className="wt-sr">{T.hub.title}</h1>
      <div className="wt-start-top">
        {suggested.length
          ? <Overlaps people={suggested} premium={premium} sent={sent} onInvite={invite} />
          : <Pitch premium={premium} />}
      </div>
      <div className="wt-start-seeit">
        <div className="wt-person-text">
          <h2 className="wt-card-title">{S.seeItTitle}</h2>
          <span className="wt-note">{S.seeItBody}</span>
        </div>
        <div className="wt-start-pair">
          <Example titles={titles} />
          <Demo key={titles.length >= 5 ? 'ready' : 'waiting'} premium={premium} pool={titles} />
        </div>
      </div>
      {suggested.length > 0 && <div className="wt-start-how"><HowItWorks /></div>}
      <div className="wt-start-link"><InviteLinkCard /></div>
      <div className="wt-start-note">
        <div className="wt-banner wt-banner--plain">
          <span className="wt-banner-text"><span className="wt-banner-title">{S.gotInviteTitle}</span><span className="wt-note">{S.gotInviteBody}</span></span>
        </div>
      </div>
    </div>
  );
}
