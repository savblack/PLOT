// Home's first-run card after onboarding: four steps, each ticking only when
// the action is really done (titles saved, someone followed, an import
// finished, an actor or director followed). The rules and the stored state's
// shape live in @plot/core/finishingTouches.js; this file is the web render.
// Mobile parity: the card is not on mobile yet (see the PR's parity issue).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@plot/core/supabase.js';
import { tmdb } from '@plot/core/tmdb.js';
import { useFollows, followUser } from '@plot/core/useFollows.js';
import { usePeopleFollows } from '@plot/core/usePeopleFollows.js';
import { usePeopleSuggestions } from '@plot/core/useHomeShelves.js';
import { deriveFinishingTouches, finishingTouchesVisible } from '@plot/core/finishingTouches.js';
import { favoriteWords } from '@plot/core/spelling.js';
import { PEOPLE } from '@plot/core/copy/people.js';
import { FINISHING_TOUCHES as T } from '../copy/finishingTouches.js';
import { IMPORT_SOURCES } from '@plot/core/onboardingSetup.js';
import { createImportReporter, IMPORT_ENTRY_POINTS } from '@plot/core/importPipeline.js';
import { track, EVENTS } from '../lib/analytics.js';
import { useApp } from '../hooks/useApp.js';
import { useFollowPerson } from '../hooks/useFollowPerson.jsx';
import { closeFinishingTouches, hideFinishingTouchesFor, readFinishingTouches } from '../utils/finishingTouchesState.js';
import { profileUrl } from '../utils/images.js';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import FinishingTouchesCard from './FinishingTouchesCard.jsx';
import { FollowPill } from './PeopleFollow.jsx';
import './FinishingTouches.css';

const wideScreen = () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches;

export default function FinishingTouches() {
  const { user, profile, watchlist } = useApp();
  const navigate = useNavigate();
  const [state, setState] = useState(() => readFinishingTouches(user?.id));
  const [expanded, setExpanded] = useState(wideScreen);
  const [sheet, setSheet] = useState(null);
  const follows = useFollows(user?.id, user?.id);
  const people = usePeopleFollows(user?.id);
  const fav = favoriteWords(profile?.region);

  const savedCount = watchlist?.items?.length ?? 0;
  const { steps, doneCount, total, allDone } = deriveFinishingTouches({
    savedCount,
    followingCount: follows.following,
    importDone: !!state?.importDone,
    peopleCount: people.follows.length,
  });

  if (!user || !finishingTouchesVisible(state)) return null;

  const tiles = steps.map(step => {
    const base = { id: step.id, done: step.done };
    if (step.id === 'watchlist') return { ...base, title: T.steps.watchlist.title, sub: T.steps.watchlist.sub(savedCount) };
    if (step.id === 'friends') {
      return { ...base, title: T.steps.friends.title, sub: step.done ? T.steps.friends.doneSub(follows.following) : T.steps.friends.sub, cta: T.steps.friends.cta };
    }
    if (step.id === 'import') {
      return { ...base, title: T.steps.import.title, sub: step.done ? T.steps.import.doneSub : T.steps.import.sub, cta: T.steps.import.cta };
    }
    const first = people.follows[0]?.name;
    return {
      ...base,
      title: T.steps.people.title(fav.pluralLower),
      sub: step.done && first ? T.steps.people.doneSub(first, people.follows.length - 1) : T.steps.people.sub,
      cta: T.steps.people.cta,
    };
  });

  const closeSheet = () => {
    setSheet(null);
    follows.refresh();
  };

  return (
    <>
      <FinishingTouchesCard
        tiles={tiles}
        doneCount={doneCount}
        total={total}
        allDone={allDone}
        expanded={expanded}
        onToggle={() => setExpanded(open => !open)}
        onHide={() => { track(EVENTS.FINISHING_TOUCHES_HIDDEN, { done_count: doneCount }); setState(hideFinishingTouchesFor(user.id)); }}
        onClose={() => setState(closeFinishingTouches(user.id))}
        onAction={(id) => { track(EVENTS.FINISHING_TOUCH_OPENED, { step: id }); setSheet(id); }}
      />
      {sheet === 'friends' && <FriendsSheet userId={user.id} onClose={closeSheet} />}
      {sheet === 'import' && (
        <ResponsiveDialog title={T.importSheet.title} onClose={closeSheet} size="compact">
          <p className="ft-sheet-sub">{T.importSheet.sub}</p>
          <div className="ft-sources">
            {IMPORT_SOURCES.map(src => (
              <button key={src.id} type="button" className="ft-source" onClick={() => {
                createImportReporter({ entry: IMPORT_ENTRY_POINTS.FINISHING_TOUCHES }).selected(src.id);
                navigate(`/import?source=${src.id}&from=${IMPORT_ENTRY_POINTS.FINISHING_TOUCHES}`);
              }}>
                <span className="ft-source-mark" aria-hidden="true">{src.name[0]}</span>
                <span className="ft-source-text"><b>{src.name}</b><span>{src.hint}</span></span>
              </button>
            ))}
          </div>
        </ResponsiveDialog>
      )}
      {sheet === 'people' && <PeopleSheet watchlistItems={watchlist?.items ?? []} favourites={fav.pluralLower} onClose={closeSheet} />}
    </>
  );
}

/* ── Find your people: suggested public profiles, followed in place ── */
function FriendsSheet({ userId, onClose }) {
  const { openSearch } = useApp();
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState({});

  useEffect(() => {
    let alive = true;
    supabase.rpc('suggested_users', { p_limit: 6 }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setFailed(true); setRows([]); return; }
      setRows(data || []);
    });
    return () => { alive = false; };
  }, []);

  const follow = async (row) => {
    setStatus(s => ({ ...s, [row.id]: 'busy' }));
    const result = await followUser({ viewerId: userId, targetId: row.id });
    setStatus(s => ({ ...s, [row.id]: result.ok ? (result.status || 'accepted') : undefined }));
  };

  return (
    <ResponsiveDialog title={T.friendsSheet.title} onClose={onClose} size="compact">
      <p className="ft-sheet-sub">{T.friendsSheet.sub}</p>
      {rows === null ? null : rows.length === 0 ? (
        <p className="ft-sheet-empty">{failed ? T.friendsSheet.loadError : T.friendsSheet.empty}</p>
      ) : (
        <ul className="ft-people">
          {rows.map(row => {
            const name = row.display_name || row.username;
            const s = status[row.id];
            return (
              <li key={row.id}>
                <span className="ft-avatar" aria-hidden="true">{row.avatar_url ? <img src={row.avatar_url} alt="" /> : name.charAt(0).toUpperCase()}</span>
                <span className="ft-person"><b>{name}</b>{row.display_name && <span>@{row.username}</span>}</span>
                <button
                  type="button"
                  className={`btn btn-secondary btn-sm${s && s !== 'busy' ? ' follow-pill--on' : ''}`}
                  disabled={!!s}
                  onClick={() => follow(row)}
                >
                  {s === 'pending' ? T.friendsSheet.requested : s === 'accepted' ? T.friendsSheet.following : T.friendsSheet.follow}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="ft-sheet-link" onClick={() => { onClose(); openSearch?.(); }}>{T.friendsSheet.search}</button>
    </ResponsiveDialog>
  );
}

/* ── Follow your favourites: a preview of Your people, then people from the watchlist ── */
const fetchDetails = (type, id) => (type === 'tv' ? tmdb.getTVDetails(id) : tmdb.getMovieDetails(id));

function PeopleSheet({ watchlistItems, favourites, onClose }) {
  const follow = useFollowPerson();
  const titles = useMemo(() => watchlistItems.map(i => ({ tmdb_id: i.tmdb_id, media_type: i.media_type })), [watchlistItems]);
  const { suggestions, loading } = usePeopleSuggestions(titles, fetchDetails, { enabled: titles.length > 0 });
  const reason = (s) => (s.kind === 'directed'
    ? (s.count > 1 ? PEOPLE.shelf.directed(s.count) : PEOPLE.shelf.directedOne(s.title))
    : (s.count > 1 ? PEOPLE.shelf.actedIn(s.count) : PEOPLE.shelf.actedInOne(s.title)));
  const lead = suggestions[0];

  return (
    <ResponsiveDialog title={T.peopleSheet.title(favourites)} onClose={onClose} size="compact">
      <p className="ft-sheet-sub">{T.peopleSheet.sub}</p>
      <div className="ft-preview" aria-label={T.peopleSheet.previewLabel}>
        <div className="ft-preview-head"><b>{T.peopleSheet.previewTitle}</b><span>{T.peopleSheet.previewLabel}</span></div>
        <div className="ft-preview-cards" aria-hidden="true">
          <span className="ft-preview-card"><i /><span><b>{PEOPLE.chips.inCinemas}</b><span>{lead?.name || PEOPLE.director}</span></span></span>
          <span className="ft-preview-card"><i /><span><b>{PEOPLE.chips.newSeason}</b><span>{suggestions[1]?.name || PEOPLE.creator}</span></span></span>
        </div>
      </div>
      <h3 className="ft-sheet-h">{T.peopleSheet.fromWatchlist}</h3>
      {!loading && suggestions.length === 0 ? (
        <p className="ft-sheet-empty">{T.peopleSheet.empty}</p>
      ) : (
        <ul className="ft-people">
          {suggestions.map(s => (
            <li key={s.id}>
              <span className="ft-avatar" aria-hidden="true">{profileUrl(s.profilePath) ? <img src={profileUrl(s.profilePath)} alt="" /> : s.name.charAt(0)}</span>
              <span className="ft-person"><b>{s.name}</b><span>{reason(s)}</span></span>
              <FollowPill
                following={follow.isFollowing(s.id)}
                busy={follow.busyId === s.id}
                name={s.name}
                onClick={() => follow.toggle({ id: s.id, name: s.name, profile_path: s.profilePath, known_for_department: s.kind === 'directed' ? 'Directing' : 'Acting' })}
              />
            </li>
          ))}
        </ul>
      )}
      {follow.sheet}
    </ResponsiveDialog>
  );
}
