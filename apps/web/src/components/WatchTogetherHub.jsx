// Watch together's hub at /together, Nov 2026 redesign. The same frame as
// History and My Lists: a 264px column of cards on the left (who's watching,
// requests, the invite link) and shelves of what you share on the right.
// Phones stack the column above the shelves (.hist-body). With nobody yet,
// the invite card leads and puts the link first, because most people invite
// someone who isn't on Plot.
// Mockups: https://claude.ai/artifact/VMDXnp5BmJJd9ekX2FS7QH
// Rules: @plot/core watchTogether.js (hubStage, joinNames, titleMeta).
// Mobile parity: apps/mobile/components/watch/WatchHub.tsx.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { personName, filterByKind, hubStage, joinNames, sharedOnDate } from '@plot/core/watchTogether.js';
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
import { Tag } from './Chip.jsx';
import './WatchTogetherHub.css';

const H = T.hub;
const reportGate = () => track(EVENTS.PREMIUM_GATE_HIT, { feature: 'watch_together' });

// "You're on Premium" news: who upgrading unlocked (core: useUpgradeNews).
const NEWS_STORAGE = { getItem: readStorage, setItem: writeStorage, removeItem: removeStorage };
function useNews(wt, premium) {
  const { unlockedIds, dismiss } = useUpgradeNews({ partners: wt.partners, loading: wt.loading, premium, storage: NEWS_STORAGE });
  return { unlocked: wt.partners.filter(p => unlockedIds.includes(p.other_id)), dismiss };
}

function SideCard({ title, labelledBy, children, className = '' }) {
  return (
    <section className={`hist-card wth-side-card ${className}`} aria-labelledby={labelledBy}>
      <div className="hist-card-head"><h2 className="hist-card-title wth-card-title" id={labelledBy}>{title}</h2></div>
      {children}
    </section>
  );
}

/* ── Left column ─────────────────────────────────────────────────────── */

/** The invite card: leads the column with nobody yet, then a short card. */
function InviteCard({ stage, link }) {
  const { url, display, copied, share, copy, sharedAt } = link;
  const copyButton = <button type="button" className="btn btn-secondary btn-sm" onClick={copy} disabled={!url}>{copied ? T.link.copied : T.link.copy}</button>;
  if (stage === 'people') {
    return (
      <SideCard title={H.inviteMore} labelledBy="wth-invite-title">
        <span className="wth-note">{H.inviteFree}</span>
        <div className="wth-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={share} disabled={!url}>{T.link.share}</button>
          {copyButton}
        </div>
      </SideCard>
    );
  }
  if (stage === 'waiting' && sharedAt) {
    return (
      <SideCard title={H.waitingTitle} labelledBy="wth-invite-title" className="wth-side-card--lead">
        <div className="wth-row-head">
          <span className="wth-ghost wth-pulse" aria-hidden="true">…</span>
          <span className="wth-note">{H.sharedOn(sharedOnDate(sharedAt))}</span>
        </div>
        <div className="wth-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={share} disabled={!url}>{H.shareAgain}</button>
          {copyButton}
        </div>
        <span className="wth-note">{H.notifyNote}</span>
      </SideCard>
    );
  }
  return (
    <SideCard title={H.inviteTitle} labelledBy="wth-invite-title" className="wth-side-card--lead">
      <p className="wth-body">{H.inviteBody}</p>
      {/* The words your friend receives, so it's clear this goes outside Plot. */}
      <div className="wth-bubble">
        <span>{T.link.shareText}</span>
        <span className="wth-bubble-link">{display}</span>
      </div>
      <div className="wth-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={share} disabled={!url}>{H.sendInvite}</button>
        {copyButton}
      </div>
      <span className="wth-note">{H.inviteFree}</span>
    </SideCard>
  );
}

/** Who's watching: pick a person (or everyone) and the shelves follow. */
function WhoCard({ partners, decidable, selected, groupId, onSelect, onDecide, onOpenGroup }) {
  const chosen = selected === groupId ? null : partners.find(p => p.other_id === selected);
  const locked = chosen?.can_decide === false;
  return (
    <SideCard title={H.whosWatching} labelledBy="wth-who-title">
      <div className="wth-who" role="group" aria-labelledby="wth-who-title">
        {partners.map(p => (
          <button key={p.other_id} type="button" className="wth-who-row" aria-pressed={selected === p.other_id} onClick={() => onSelect(p.other_id)}>
            <span className="wth-radio" aria-hidden="true" />
            <PersonAvatar person={p} size="sm" />
            <span className="wth-who-text">
              <span className="wth-who-name">{personName(p)}</span>
              <span className="wth-note">{H.bothSaved(p.overlap_count ?? 0)}</span>
            </span>
            {p.can_decide === false && <Tag label={H.needsPremium} />}
          </button>
        ))}
        {decidable.length > 1 && (
          <button type="button" className="wth-who-row" aria-pressed={selected === groupId} onClick={() => onSelect(groupId)}>
            <span className="wth-radio" aria-hidden="true" />
            <span className="wth-faces">{decidable.slice(0, 3).map(p => <PersonAvatar key={p.other_id} person={p} size="sm" />)}</span>
            <span className="wth-who-text">
              <span className="wth-who-name">{H.allOfYou}</span>
              <span className="wth-note">{T.overlap.savedByAll}</span>
            </span>
          </button>
        )}
      </div>
      {selected === groupId
        ? <button type="button" className="btn btn-primary btn-sm" onClick={onOpenGroup}>{T.overlap.groupAction}</button>
        : locked
          ? <PremiumGateButton reason="watchTogether" className="btn btn-primary btn-sm" onOpen={reportGate} />
          : chosen && <button type="button" className="btn btn-primary btn-sm" onClick={() => onDecide(chosen)}>{H.decideWith(personName(chosen))}</button>}
    </SideCard>
  );
}

function RequestsCard({ incoming, outgoing, busy, onReview, onDecline, onCancel }) {
  if (!incoming.length && !outgoing.length) return null;
  return (
    <SideCard title={H.requests} labelledBy="wth-requests-title">
      <div className="wth-who">
        {incoming.map(p => (
          <div key={p.other_id} className="wth-request">
            <span className="wth-row-head">
              <PersonAvatar person={p} size="sm" />
              <span className="wth-who-text"><span className="wth-who-name">{personName(p)}</span><span className="wth-note">{T.requests.wantsTo}</span></span>
            </span>
            <span className="wth-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onReview(p)} disabled={busy}>{T.requests.review}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDecline(p)} disabled={busy}>{T.requests.decline}</button>
            </span>
          </div>
        ))}
        {outgoing.map(p => (
          <div key={p.other_id} className="wth-request">
            <span className="wth-row-head">
              <PersonAvatar person={p} size="sm" />
              <span className="wth-who-text"><span className="wth-who-name">{personName(p)}</span><span className="wth-note">{T.requests.sent}</span></span>
            </span>
            <span className="wth-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCancel(p)}>{T.requests.cancel}</button>
            </span>
          </div>
        ))}
      </div>
    </SideCard>
  );
}

/** People already on Plot: search and the people you follow. Second to the link. */
function OnPlotCard({ suggested, sent, onInvite }) {
  return (
    <SideCard title={suggested.length ? H.peopleYouFollow : H.onPlot} labelledBy="wth-onplot-title">
      <FriendSearch sent={sent} onInvite={onInvite} />
      {suggested.length > 0 && (
        <div className="wt-list wth-onplot-list">
          {suggested.map(p => <PersonRow key={p.id} person={p} sent={sent.has(p.id)} onInvite={onInvite} />)}
        </div>
      )}
    </SideCard>
  );
}

/* ── Right column ────────────────────────────────────────────────────── */

/** Shared titles as MediaCard items (MediaCard reads `id`). */
const asItem = (t) => ({ ...t, id: t.tmdb_id });

function SharedShelves({ partners }) {
  const { openPanel, watchlist } = useApp();
  const locked = partners.some(p => p.can_decide === false);
  const { titles, loading } = useWatchTogetherTitles(locked ? [] : partners.map(p => p.other_id));
  const names = joinNames(partners.map(personName));
  if (locked) return <p className="wth-note wth-shelf-note">{H.lockedShelf}</p>;
  if (loading && !titles.length) return null;
  if (!titles.length) return <p className="wth-note wth-shelf-note">{H.nothingShared(names)}</p>;
  const shelves = [
    ['movie', H.moviesWith(names)],
    ['tv', H.showsWith(names)],
  ].map(([kind, title]) => [kind, title, filterByKind(titles, kind)]).filter(([, , list]) => list.length);
  return shelves.map(([kind, title, list]) => (
    <RailSection key={kind} title={title} subtitle={String(list.length)}>
      {list.map(t => <MediaCard key={`${t.media_type}:${t.tmdb_id}`} item={asItem(t)} openPanel={openPanel} watchlist={watchlist} />)}
    </RailSection>
  ));
}

/** With nobody yet: your own watchlist, faded, as the shelf that will fill in. */
function PreviewShelf() {
  const { watchlist, openPanel } = useApp();
  const items = (watchlist?.items || []).filter(i => i.poster_path).slice(0, 12);
  if (!items.length) return null;
  return (
    <div className="wth-preview">
      <RailSection title={H.yourWatchlist} subtitle={String(watchlist.items.length)}>
        {items.map(i => <MediaCard key={`${i.media_type}:${i.tmdb_id}`} item={{ ...i, id: i.tmdb_id }} openPanel={openPanel} watchlist={watchlist} />)}
      </RailSection>
      <p className="wth-note wth-shelf-note">{H.previewNote}</p>
    </div>
  );
}

function HowItWorks({ premium }) {
  const { watchlist } = useApp();
  const pool = useWatchTogetherExampleTitles(watchlist?.items);
  return (
    <section className="discover-section wth-section" aria-labelledby="wth-how">
      <div className="discover-section-header"><div className="discover-section-heading"><h2 className="discover-section-title" id="wth-how">{H.seeHow}</h2></div></div>
      <div className="wth-demo"><Demo key={pool.length >= 5 ? 'ready' : 'waiting'} premium={premium} pool={pool} /></div>
    </section>
  );
}

/* ── The hub ─────────────────────────────────────────────────────────── */

export default function WatchTogetherHub({ wt, premium, profile }) {
  const navigate = useNavigate();
  const { user } = useApp();
  // One instance for the page, so sharing from the card moves the page on.
  const link = useInviteShare();
  const { sharedAt } = link;
  const { people: suggested, loading: suggestionsLoading, refresh: refreshSuggestions } = useWatchTogetherSuggestions(user?.id);
  const [reviewing, setReviewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(/** @type {string | null} */ (null));
  const [sent, setSent] = useState(() => new Set());
  const news = useNews(wt, premium);
  const { partners, incoming, outgoing } = wt;

  // Blank only until the first load. Later refreshes (after an invite or a
  // reply) keep the page up, so a half-typed search isn't wiped.
  const [ready, setReady] = useState(false);
  if (!ready && !wt.loading && !suggestionsLoading) setReady(true);
  if (!ready) return <div className="hist-page wth-page" aria-busy="true" />;

  const stage = hubStage({ partners, incoming, outgoing, sharedAt });
  const decidable = partners.filter(p => p.can_decide !== false);
  const groupId = 'group';
  // The first partner who can decide starts selected, so the shelves show
  // something straight away.
  const selected = selectedId ?? (decidable[0] || partners[0])?.other_id ?? null;
  const shelfPartners = selected === groupId ? decidable : partners.filter(p => p.other_id === selected);

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
        <aside className="hist-side">
          {news.unlocked.length > 0 && (
            <section className="hist-card wth-side-card" role="status">
              <span className="wth-who-text">
                <span className="hist-card-title">{H.upgradedTitle}</span>
                <span className="wth-note">{H.upgradedBody(news.unlocked.map(personName))}</span>
              </span>
              <div className="wth-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => decideWith(news.unlocked[0])}>{H.decideWith(personName(news.unlocked[0]))}</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={news.dismiss}>{H.dismiss}</button>
              </div>
            </section>
          )}
          {stage === 'people' ? (
            <>
              {partners.length > 0 && (
                <WhoCard partners={partners} decidable={decidable} selected={selected} groupId={groupId}
                  onSelect={setSelectedId} onDecide={decideWith} onOpenGroup={openGroup} />
              )}
              <RequestsCard incoming={incoming} outgoing={outgoing} busy={busy}
                onReview={setReviewing} onDecline={(p) => answer(p, false)} onCancel={(p) => wt.cancel(p.other_id)} />
              <InviteCard stage={stage} link={link} />
            </>
          ) : (
            <>
              <InviteCard stage={stage} link={link} />
              <OnPlotCard suggested={suggested} sent={sent} onInvite={invite} />
            </>
          )}
        </aside>

        <div className="hist-stream wth-stream">
          <div className="discover-sections">
            {stage === 'people'
              ? shelfPartners.length > 0 && <SharedShelves key={selected} partners={shelfPartners} />
              : (
                <>
                  <PreviewShelf />
                  <HowItWorks premium={premium} />
                </>
              )}
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
