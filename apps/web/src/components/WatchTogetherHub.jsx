// Watch together's hub at /together. Nov 14 2026 (round 3A): one card, one
// button. History's frame: the left column is a single card (who's watching
// as a row of faces, a one-line count, one pink button), the right column one
// shelf of what you share. Requests are a one-line notice in the card; search,
// the demo and inviting more people are quiet links. With nobody yet the card
// leads with the invite link, because most people invite someone not on Plot.
// Mockups: https://claude.ai/artifact/VMDXnp5BmJJd9ekX2FS7QH (round 3)
// Rules: @plot/core watchTogether.js (hubStage, joinNames, sharedOnDate).
// Mobile parity: apps/mobile/components/watch/WatchHub.tsx.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { personName, hubStage, joinNames, sharedOnDate } from '@plot/core/watchTogether.js';
import { useWatchTogetherTitles, useWatchTogetherSuggestions, useWatchTogetherExampleTitles, startWatchTogetherSession, useUpgradeNews } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { readStorage, writeStorage, removeStorage } from '../utils/storage.js';
import { useInviteShare } from '../hooks/useInviteShare.js';
import { EVENTS, track } from '../lib/analytics.js';
import { AcceptDialog, PersonAvatar } from './WatchTogetherParts.jsx';
import { Demo, FriendSearch, PersonRow } from './WatchTogetherStart.jsx';
import { RailSection } from './DiscoverView.jsx';
import MediaCard from './MediaCard.jsx';
import PremiumGateButton from './PremiumGateButton.jsx';
import './WatchTogetherHub.css';

const H = T.hub;
const GROUP = 'group';
const reportGate = () => track(EVENTS.PREMIUM_GATE_HIT, { feature: 'watch_together' });

// "You're on Premium" news: who upgrading unlocked (core: useUpgradeNews).
const NEWS_STORAGE = { getItem: readStorage, setItem: writeStorage, removeItem: removeStorage };
function useNews(wt, premium) {
  const { unlockedIds, dismiss } = useUpgradeNews({ partners: wt.partners, loading: wt.loading, premium, storage: NEWS_STORAGE });
  return { unlocked: wt.partners.filter(p => unlockedIds.includes(p.other_id)), dismiss };
}

/** A face that picks who's watching. The picked one gets the accent ring. */
function Face({ label, picked, onPick, children }) {
  return (
    <button type="button" className="wth-face" aria-pressed={picked} onClick={onPick}>
      <span className="wth-face-img">{children}</span>
      <span className="wth-face-name">{label}</span>
    </button>
  );
}

/* ── With nobody yet ─────────────────────────────────────────────────── */

function InviteCard({ link }) {
  const { url, display, copied, share, copy, sharedAt } = link;
  const waiting = !!sharedAt;
  return (
    <section className="hist-card wth-main-card" aria-labelledby="wth-card-title">
      <span className="wth-ghost" aria-hidden="true">{waiting ? '…' : '+'}</span>
      <h2 className="wth-main-title" id="wth-card-title">{waiting ? H.waitingTitle : H.inviteLead}</h2>
      <p className="wth-body">{waiting ? H.sharedOn(sharedOnDate(sharedAt)) : H.inviteLeadBody}</p>
      {!waiting && (
        // The words your friend receives, so it's clear this goes outside Plot.
        <div className="wth-bubble">
          <span>{T.link.shareText}</span>
          <span className="wth-bubble-link">{display}</span>
        </div>
      )}
      <button type="button" className="btn btn-primary wth-main-btn" onClick={share} disabled={!url}>{waiting ? H.shareAgain : H.sendInvite}</button>
      <span className="wth-note">
        {waiting ? H.notifyNote : H.inviteFree}{' '}
        <button type="button" className="wth-link" onClick={copy} disabled={!url}>{copied ? T.link.copied : T.link.copy}</button>
      </span>
    </section>
  );
}

/* ── With people ─────────────────────────────────────────────────────── */

function PeopleCard({ partners, decidable, selected, onSelect, incoming, outgoing, onReview, onCancel, onDecide, onOpenGroup }) {
  const chosen = selected === GROUP ? null : partners.find(p => p.other_id === selected);
  return (
    <section className="hist-card wth-main-card" aria-label={H.whosWatching}>
      {incoming.length > 0 && (
        <button type="button" className="wth-notice" onClick={() => onReview(incoming[0])}>
          {H.requestNotice(personName(incoming[0]), incoming.length - 1)} · <u>{T.requests.review}</u>
        </button>
      )}
      {outgoing.map(p => (
        <span key={p.other_id} className="wth-notice wth-notice--quiet">
          {H.waitingOn(personName(p))} · <button type="button" className="wth-link" onClick={() => onCancel(p)}>{T.requests.cancel}</button>
        </span>
      ))}
      {partners.length > 0 && (
        <>
          <div className="wth-faces" role="group" aria-label={H.whosWatching}>
            {partners.map(p => (
              <Face key={p.other_id} label={personName(p).split(' ')[0]} picked={selected === p.other_id} onPick={() => onSelect(p.other_id)}>
                <PersonAvatar person={p} />
              </Face>
            ))}
            {decidable.length > 1 && (
              <Face label={decidable.length === 2 ? H.both : H.everyone} picked={selected === GROUP} onPick={() => onSelect(GROUP)}>
                <span className="wth-faces-mini" aria-hidden="true">
                  {decidable.slice(0, 2).map(p => <PersonAvatar key={p.other_id} person={p} size="sm" />)}
                </span>
              </Face>
            )}
          </div>
          <h2 className="wth-main-title">
            {selected === GROUP ? T.overlap.groupHeading : chosen ? H.savedCount(personName(chosen), chosen.overlap_count ?? 0) : ''}
          </h2>
          {selected === GROUP
            ? <button type="button" className="btn btn-primary wth-main-btn" onClick={onOpenGroup}>{T.overlap.groupAction}</button>
            : chosen?.can_decide === false
              ? <PremiumGateButton reason="watchTogether" className="btn btn-primary wth-main-btn" onOpen={reportGate} />
              : chosen && <button type="button" className="btn btn-primary wth-main-btn" onClick={() => onDecide(chosen)}>{H.decideWith(personName(chosen))}</button>}
          {chosen?.can_decide === false && <span className="wth-note">{T.start.premiumCardBody}</span>}
        </>
      )}
    </section>
  );
}

/** One shelf: what you share with whoever is picked, with See all. */
function SharedShelf({ partners }) {
  const { openPanel, watchlist } = useApp();
  const locked = partners.some(p => p.can_decide === false);
  const { titles, loading } = useWatchTogetherTitles(locked ? [] : partners.map(p => p.other_id));
  const names = joinNames(partners.map(personName));
  // Locked: the card above already says one of you needs Premium.
  if (locked) return null;
  if (loading && !titles.length) return null;
  if (!titles.length) return <p className="wth-note">{H.nothingShared(names)}</p>;
  const all = `/together/with/${partners.map(p => encodeURIComponent(p.username)).join(',')}`;
  return (
    <RailSection title={H.savedWith(names)} subtitle={String(titles.length)} headerRight={<Link className="wth-link" to={all}>{H.seeAll}</Link>}>
      {titles.map(t => <MediaCard key={`${t.media_type}:${t.tmdb_id}`} item={{ ...t, id: t.tmdb_id }} openPanel={openPanel} watchlist={watchlist} />)}
    </RailSection>
  );
}

/** With nobody yet: your watchlist, faded, as what they'll see first. */
function PreviewShelf({ premium }) {
  const { watchlist, openPanel } = useApp();
  const [demo, setDemo] = useState(false);
  const pool = useWatchTogetherExampleTitles(watchlist?.items);
  const items = (watchlist?.items || []).filter(i => i.poster_path).slice(0, 12);
  return (
    <>
      {items.length > 0 && (
        <div className="wth-preview">
          <RailSection title={H.previewFirst} subtitle={H.previewMatched}>
            {items.map(i => <MediaCard key={`${i.media_type}:${i.tmdb_id}`} item={{ ...i, id: i.tmdb_id }} openPanel={openPanel} watchlist={watchlist} />)}
          </RailSection>
        </div>
      )}
      <button type="button" className="wth-link wth-demo-link" aria-expanded={demo} onClick={() => setDemo(v => !v)}>{H.seeHow}</button>
      {demo && <div className="wth-demo"><Demo key={pool.length >= 5 ? 'ready' : 'waiting'} premium={premium} pool={pool} /></div>}
    </>
  );
}

/* ── The hub ─────────────────────────────────────────────────────────── */

export default function WatchTogetherHub({ wt, premium, profile }) {
  const navigate = useNavigate();
  const { user } = useApp();
  // One instance for the page, so sharing from the card moves the page on.
  const link = useInviteShare();
  const { people: suggested, loading: suggestionsLoading, refresh: refreshSuggestions } = useWatchTogetherSuggestions(user?.id);
  const [reviewing, setReviewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(/** @type {string | null} */ (null));
  const [finding, setFinding] = useState(false);
  const [sent, setSent] = useState(() => new Set());
  const news = useNews(wt, premium);
  const { partners, incoming, outgoing } = wt;

  // Blank only until the first load. Later refreshes (after an invite or a
  // reply) keep the page up, so a half-typed search isn't wiped.
  const [ready, setReady] = useState(false);
  if (!ready && !wt.loading && !suggestionsLoading) setReady(true);
  if (!ready) return <div className="hist-page wth-page" aria-busy="true" />;

  const stage = hubStage({ partners, incoming, outgoing, sharedAt: link.sharedAt });
  const decidable = partners.filter(p => p.can_decide !== false);
  // The first partner who can decide starts picked, so the button works in one tap.
  const selected = selectedId ?? (decidable[0] || partners[0])?.other_id ?? null;
  const shelfPartners = selected === GROUP ? decidable : partners.filter(p => p.other_id === selected);

  const decideWith = async (person) => {
    const result = await startWatchTogetherSession(person.other_id);
    if (result.ok) navigate(`/together/session/${result.data}`);
  };
  const openGroup = () => navigate(`/together/with/${decidable.map(p => encodeURIComponent(p.username)).join(',')}`);
  const answer = async (person, accept, shareFull) => {
    setBusy(true);
    await wt.respond(person.other_id, accept, shareFull);
    setBusy(false);
    setReviewing(null);
  };
  const invite = async (person) => {
    const result = await wt.send(person.id);
    if (result.ok) { setSent(prev => new Set(prev).add(person.id)); refreshSuggestions(); }
    return result.ok;
  };

  return (
    <div className="hist-page wth-page">
      {/* Phones only: at sidebar widths the shell heading is the h1. */}
      <h1 className="sr-only phone-only-h1">{H.title}</h1>

      <div className="hist-body">
        <aside className="hist-side wth-side">
          {news.unlocked.length > 0 && (
            <section className="hist-card wth-news" role="status">
              <span className="wth-body"><b>{H.upgradedTitle}.</b> {H.upgradedBody(news.unlocked.map(personName))}</span>
              <button type="button" className="wth-link" onClick={news.dismiss}>{H.dismiss}</button>
            </section>
          )}
          {stage === 'people' ? (
            <PeopleCard
              partners={partners} decidable={decidable} selected={selected} onSelect={setSelectedId}
              incoming={incoming} outgoing={outgoing}
              onReview={setReviewing} onCancel={(p) => wt.cancel(p.other_id)}
              onDecide={decideWith} onOpenGroup={openGroup}
            />
          ) : <InviteCard link={link} />}

          {stage === 'people'
            ? <button type="button" className="wth-link" onClick={link.share} disabled={!link.url}>{H.inviteSomeone}</button>
            : <button type="button" className="wth-link" aria-expanded={finding} onClick={() => setFinding(v => !v)}>{H.findOnPlot}</button>}
          {finding && stage !== 'people' && (
            <div className="wth-find">
              <FriendSearch sent={sent} onInvite={invite} />
              {suggested.length > 0 && (
                <div className="wt-list">
                  {suggested.map(p => <PersonRow key={p.id} person={p} sent={sent.has(p.id)} onInvite={invite} />)}
                </div>
              )}
            </div>
          )}
        </aside>

        <div className="hist-stream wth-stream">
          <div className="discover-sections">
            {stage === 'people'
              ? shelfPartners.length > 0 && <SharedShelf key={selected} partners={shelfPartners} />
              : <PreviewShelf premium={premium} />}
          </div>
        </div>
      </div>

      {reviewing && (
        <AcceptDialog person={reviewing} viewer={profile} busy={busy}
          onClose={() => setReviewing(null)}
          onDecline={() => answer(reviewing, false)}
          onAccept={(shareFull) => answer(reviewing, true, shareFull)} />
      )}
    </div>
  );
}
