// Home's first-run card after onboarding: five steps, each ticking only when
// the action is really done (titles saved, an episode or a watch logged,
// someone followed, an import finished, an actor or director followed). The
// rules and the stored state's shape live in @plot/core/finishingTouches.js;
// this file is the web render.
// Mobile: apps/mobile/components/FinishingTouches.tsx, on the same core rules.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@plot/core/supabase.js';
import { tmdb } from '@plot/core/tmdb.js';
import { useFollows, followUser } from '@plot/core/useFollows.js';
import { usePeopleFollows } from '@plot/core/usePeopleFollows.js';
import { usePeopleSuggestions } from '@plot/core/useHomeShelves.js';
import { deriveFinishingTouches, finishingTouchesVisible, firstWatchlistShow } from '@plot/core/finishingTouches.js';
import { pointerAfterEpisode } from '@plot/core/watchingProgress.js';
import { useHistory } from '@plot/core/useHistory.js';
import { oncePerSession } from '@plot/core/oncePerSession.js';
import { favoriteWords } from '@plot/core/spelling.js';
import { PEOPLE } from '@plot/core/copy/people.js';
import { FINISHING_TOUCHES as T } from '../copy/finishingTouches.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import { COMMON } from '../copy/common.js';
import { availableImportSources } from '@plot/core/onboardingSetup.js';
import { getConfig } from '@plot/core/config.js';
import { createImportReporter, IMPORT_ENTRY_POINTS } from '@plot/core/importPipeline.js';
import { track, EVENTS } from '../lib/analytics.js';
import { useApp } from '../hooks/useApp.js';
import { useFollowPerson } from '../hooks/useFollowPerson.jsx';
import { closeFinishingTouches, hideFinishingTouchesFor, readFinishingTouches } from '../utils/finishingTouchesState.js';
import { profileUrl } from '../utils/images.js';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import FinishingTouchesCard from './FinishingTouchesCard.jsx';
import { FollowPill } from './PeopleFollow.jsx';
import ImportSourceIcon from './ImportSourceIcon.jsx';
import './FinishingTouches.css';

const wideScreen = () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches;

export default function FinishingTouches() {
  const { user, profile, watchlist, watching } = useApp();
  const history = useHistory(user?.id);
  const navigate = useNavigate();
  const [state, setState] = useState(() => readFinishingTouches(user?.id));
  const [expanded, setExpanded] = useState(wideScreen);
  const [sheet, setSheet] = useState(null);
  const follows = useFollows(user?.id, user?.id);
  const people = usePeopleFollows(user?.id);
  const fav = favoriteWords(profile?.region);
  const show = firstWatchlistShow(watchlist?.items);

  const savedCount = watchlist?.items?.length ?? 0;
  const progressDone = (watching?.items?.length ?? 0) > 0
    || (history.entries || []).some(entry => entry?.media_type === 'tv');
  const { steps, doneCount, total, allDone } = deriveFinishingTouches({
    savedCount,
    followingCount: follows.following,
    importDone: !!state?.importDone,
    peopleCount: people.follows.length,
    progressDone,
    traktImportDone: !!state?.traktImportDone,
    showProgress: !!show,
  });
  const visible = !!user && finishingTouchesVisible(state);

  useEffect(() => {
    if (!visible || watchlist?.loading) return;
    oncePerSession('finishing_touches_viewed', () => {
      track(EVENTS.FINISHING_TOUCHES_VIEWED, { done_count: doneCount, total });
    });
  }, [visible, watchlist?.loading, doneCount, total]);

  if (!visible) return null;

  const tiles = steps.map(step => {
    const base = { id: step.id, done: step.done };
    if (step.id === 'watchlist') return { ...base, title: T.steps.watchlist.title, sub: T.steps.watchlist.sub(savedCount) };
    if (step.id === 'progress') {
      const sub = step.done
        ? (state?.traktImportDone && !progressDone ? T.steps.progress.traktDoneSub : T.steps.progress.doneSub)
        : T.steps.progress.sub(show?.title || '');
      return { ...base, title: T.steps.progress.title, sub, cta: T.steps.progress.cta };
    }
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
      {sheet === 'progress' && show && (
        <UpToSheet show={show} watching={watching} onClose={closeSheet} />
      )}
      {sheet === 'friends' && <FriendsSheet userId={user.id} onClose={closeSheet} />}
      {sheet === 'import' && (
        <ResponsiveDialog title={T.importSheet.title} onClose={closeSheet} size="compact">
          <p className="ft-sheet-sub">{T.importSheet.sub}</p>
          <div className="ft-sources">
            {availableImportSources(getConfig()).map(src => (
              <button key={src.id} type="button" className="ft-source" onClick={() => {
                createImportReporter({ entry: IMPORT_ENTRY_POINTS.FINISHING_TOUCHES }).selected(src.id);
                navigate(`/import?source=${src.id}&from=${IMPORT_ENTRY_POINTS.FINISHING_TOUCHES}`);
              }}>
                <ImportSourceIcon id={src.id} name={src.name} />
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

/* ── Mark where you're up to: episode list for the first show still on the watchlist ── */
function UpToSheet({ show, watching, onClose }) {
  const pick = show;
  const [details, setDetails] = useState(null);
  const [failed, setFailed] = useState(false);
  const [selSeason, setSelSeason] = useState(1);
  const [seasonLoad, setSeasonLoad] = useState({ season: 0, episodes: null, failed: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    tmdb.getTVDetails(pick.id).then(data => {
      if (!alive) return;
      if (!data) { setFailed(true); return; }
      setDetails(data);
      const first = (data.seasons || []).find(s => s.season_number > 0);
      if (first) setSelSeason(first.season_number);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [pick.id]);

  useEffect(() => {
    if (!details) return undefined;
    let alive = true;
    const season = selSeason;
    tmdb.getSeason(pick.id, season).then(data => {
      if (!alive) return;
      setSeasonLoad({ season, episodes: data?.episodes || [], failed: !data });
    }).catch(() => { if (alive) setSeasonLoad({ season, episodes: [], failed: true }); });
    return () => { alive = false; };
  }, [details, pick.id, selSeason]);

  const episodes = seasonLoad.season === selSeason ? seasonLoad.episodes : null;
  const epFailed = seasonLoad.season === selSeason && seasonLoad.failed;

  const tick = async (ep) => {
    if (busy || !episodes) return;
    setBusy(true);
    setError('');
    const item = {
      id: pick.id,
      media_type: 'tv',
      title: details?.name || pick.title,
      name: details?.name || pick.title,
      poster_path: details?.poster_path ?? pick.poster_path,
    };
    if (!watching?.isWatching(pick.id)) {
      const started = await watching.startWatching(item);
      if (!started) { setError(T.steps.progress.saveError); setBusy(false); return; }
    }
    const next = pointerAfterEpisode(selSeason, ep.episode_number, episodes.length);
    if (!next) { setError(T.steps.progress.saveError); setBusy(false); return; }
    const result = await watching.setProgress(pick.id, next.season, next.episode, { reason: 'episode', undo: true });
    setBusy(false);
    if (!result?.ok) { setError(T.steps.progress.saveError); return; }
    onClose();
  };

  const seasons = (details?.seasons || []).filter(s => s.season_number > 0);
  const title = details?.name || pick.title;

  return (
    <ResponsiveDialog title={T.steps.progress.title} onClose={onClose} size="compact">
      <p className="ft-sheet-sub">{T.steps.progress.sheetSub(title)}</p>
      {failed && <p className="ft-sheet-empty">{MEDIA_PANEL.episodesLoadError}</p>}
      {seasons.length > 1 && (
        <label className="ft-season">
          <span className="ft-sheet-h">{MEDIA_PANEL.chooseSeason}</span>
          <select value={selSeason} onChange={e => setSelSeason(Number(e.target.value))}>
            {seasons.map(s => <option key={s.season_number} value={s.season_number}>{MEDIA_PANEL.seasonLabel(s.season_number)}</option>)}
          </select>
        </label>
      )}
      {error && <p className="ft-sheet-empty" role="alert">{error}</p>}
      {episodes === null && !failed ? <p className="ft-sheet-empty">{COMMON.loading}</p> : null}
      {episodes && episodes.length === 0 ? (
        <p className="ft-sheet-empty">{epFailed ? MEDIA_PANEL.episodesLoadError : MEDIA_PANEL.noEpisodesAvailable}</p>
      ) : null}
      {episodes && episodes.length > 0 && (
        <ul className="ft-eps">
          {episodes.map(ep => (
            <li key={ep.episode_number}>
              <button
                type="button"
                className="ft-ep"
                disabled={busy}
                aria-label={T.steps.progress.tickEpisode(ep.episode_number, ep.name)}
                onClick={() => tick(ep)}
              >
                <b>{`E${String(ep.episode_number).padStart(2, '0')}`}</b>
                <span>{ep.name || MEDIA_PANEL.seasonEpisode(selSeason, ep.episode_number)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ResponsiveDialog>
  );
}
