// Shared parts of Watch together: the invite link card, rows of people to
// invite, username search and the try-it demo. The hub that arranges them is
// WatchTogetherHub.jsx (Nov 2026 redesign; the dark start page is gone).
// Mobile parity: apps/mobile/components/watch/WatchTogetherStart.tsx.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { personName, pickDemoDeck, demoPartnerSaysYes } from '@plot/core/watchTogether.js';
import { useUserSearch } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { posterUrl } from '../utils/images.js';
import { PersonAvatar } from './WatchTogetherParts.jsx';
import { useInviteShare } from '../hooks/useInviteShare.js';
import PlotLogo from './PlotLogo.jsx';
import PremiumGateButton from './PremiumGateButton.jsx';
import { EVENTS, track } from '../lib/analytics.js';
import { Tag } from './Chip.jsx';
import SearchField from './SearchField.jsx';

// The hub and start page open the upgrade sheet from a button; the overlap
// page reports this itself when it loads locked.
const reportWatchTogetherGate = () => track(EVENTS.PREMIUM_GATE_HIT, { feature: 'watch_together' });

const S = T.start;

export function Wordmark() {
  return <span className="wt-wordmark"><PlotLogo inherit /></span>;
}

/** The invite link with Share and Copy, for the invite and landing pages. */
export function InviteLinkCard() {
  const { url, display, copied, share, copy } = useInviteShare();
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

/** A row for someone you can invite: their name, a note, and Invite. */
export function PersonRow({ person, note, sent, onInvite }) {
  return (
    <div className="wt-row">
      <PersonAvatar person={person} />
      <span className="wt-person-text">
        <span className="wt-person-name">{personName(person)}</span>
        {person.username && <span className="wt-note">@{person.username}</span>}
      </span>
      {note}
      {sent
        ? <Tag label={T.invite.sent} />
        : <button type="button" className="btn btn-secondary btn-sm" onClick={() => onInvite(person)}>{T.invite.invite}</button>}
    </div>
  );
}

/**
 * Search people by name or @username to invite. Results open under the box;
 * with nothing typed it shows nothing, because the suggested people have
 * their own list.
 */
export function FriendSearch({ sent, onInvite, onDark = false }) {
  const { user } = useApp();
  const [query, setQuery] = useState('');
  const [failed, setFailed] = useState(false);
  const { searching, results } = useUserSearch(query, { excludeId: user?.id });

  const invite = async (person) => {
    setFailed(false);
    if (!(await onInvite(person))) setFailed(true);
  };

  return (
    <div className={`wt-find${onDark ? ' wt-find--dark' : ''}`}>
      <SearchField id="wt-find-search" className="wt-search-field" placeholder={T.invite.search} ariaLabel={S.findLabel} value={query} onChange={setQuery} />
      {failed && <p className="wt-error" role="alert">{T.errors.generic}</p>}
      {searching && results && (
        <div className="wt-find-results">
          {results.length === 0 && <p className="wt-note">{S.findNone}</p>}
          {results.map(p => <PersonRow key={p.id} person={p} sent={sent.has(p.id)} onInvite={invite} />)}
        </div>
      )}
    </div>
  );
}

/** Your reusable invite link as a pill, for the hero. */
/** The try-it demo with an example partner, Sam. */
export function Demo({ premium, pool }) {
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
        <Tag tone="accent" label={S.demoDoneTitle} />
        <span className="wt-person-name">{match.title}</span>
        <p className="wt-card-body">{S.demoDoneBody}</p>
        <div className="wt-top-actions">
          {!premium && <PremiumGateButton reason="watchTogether" onOpen={reportWatchTogetherGate} />}
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
