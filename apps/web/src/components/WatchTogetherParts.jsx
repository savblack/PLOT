// Watch together pieces shown outside /together: the tile on someone's
// profile, the accept dialog (profile, notifications and the hub) and the
// Settings › Privacy section. Rules and data live in @plot/core
// (watchTogether.js, useWatchTogether.js). Mobile parity: not built yet;
// tracked in the Watch together PR.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import { SettingsSwitch } from './SettingsPage.jsx';
import { supabase } from '@plot/core/supabase.js';
import { updateProfile } from '@plot/core/profile.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { tileMode, tileShowsCount, personName, REQUESTS_FROM_OPTIONS } from '@plot/core/watchTogether.js';
import { useWatchTogether, useWatchTogetherStatus, useWatchTogetherLink } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { useApp } from '../hooks/useApp.js';
import { collectionPath, customListKey } from '@plot/core/listCollections.js';
import './WatchTogetherView.css';

export function PersonAvatar({ person, size = 'md' }) {
  const name = personName(person);
  return person?.avatar_url
    ? <img className={`wt-avatar wt-avatar--${size}`} src={person.avatar_url} alt="" />
    : <span className={`wt-avatar wt-avatar--${size}`} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>;
}

function Check() {
  return <svg className="wt-yes" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>;
}
function Cross() {
  return <svg className="wt-no" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>;
}

/**
 * "Watch together with Jess?" What the other person will and won't see, with
 * the private-profile opt-in to share the full watchlist.
 *
 * @param {{ person: { display_name?: string | null, username?: string | null, avatar_url?: string | null },
 *   viewerIsPublic: boolean, busy?: boolean, onAccept: (shareFull: boolean) => void, onDecline: () => void, onClose: () => void }} props
 */
export function AcceptDialog({ person, viewerIsPublic, busy = false, onAccept, onDecline, onClose }) {
  const [shareFull, setShareFull] = useState(false);
  const name = personName(person);
  return (
    <ResponsiveDialog title={T.accept.title(name)} onClose={onClose}
      footer={<div className="wt-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onDecline} disabled={busy}>{T.accept.notNow}</button>
        <button type="button" className="btn btn-primary" onClick={() => onAccept(shareFull)} disabled={busy}>{T.accept.accept}</button>
      </div>}>
      <div className="wt-accept">
        <div className="wt-accept-card">
          <p className="wt-accept-label">{T.accept.willSee(name)}</p>
          <p className="wt-accept-line"><Check />{T.accept.seesOverlap}</p>
          <p className="wt-accept-line"><Check />{T.accept.seesPicks}</p>
          <p className="wt-accept-label">{T.accept.wontSee(name)}</p>
          {!viewerIsPublic && <p className="wt-accept-line"><Cross />{T.accept.hidesRest}</p>}
          <p className="wt-accept-line"><Cross />{T.accept.hidesPrivateLists}</p>
          <p className="wt-accept-line"><Cross />{T.accept.hidesNotes}</p>
        </div>
        {!viewerIsPublic && (
          <div className="wt-accept-card wt-accept-share">
            <span>
              <span className="wt-accept-share-title">{T.accept.shareFull}</span>
              <span className="wt-note">{T.accept.shareFullBody(name)}</span>
            </span>
            <SettingsSwitch label={T.accept.shareFull} checked={shareFull} onChange={() => setShareFull(v => !v)} />
          </div>
        )}
        <p className="wt-note wt-center">{T.accept.foot(name)}</p>
      </div>
    </ResponsiveDialog>
  );
}

/**
 * The Watch together card on someone else's profile.
 *
 * @param {{ person: { id: string, username: string, display_name?: string | null, is_public?: boolean },
 *   viewer: { id: string } | null, viewerProfile: any, onChange?: () => void }} props
 *   `onChange` runs after any send, cancel or reply, so a parent holding its
 *   own partner list can refresh it.
 */
export function WatchTogetherTile({ person, viewer, viewerProfile, onChange }) {
  const navigate = useNavigate();
  const { status, refresh } = useWatchTogetherStatus(person?.id, viewer?.id);
  const { send, cancel, respond } = useWatchTogether(viewer?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  if (!viewer || !person || !status) return null;

  const name = personName(person);
  const mode = tileMode({ viewerPremium: isPremiumProfile(viewerProfile), targetPublic: !!person.is_public, state: status.state });
  const showCount = tileShowsCount(mode, status.overlap_count);

  const run = async (fn) => {
    setBusy(true); setError(null);
    const result = await fn();
    if (result && !result.ok) setError(T.errors[result.code]);
    await refresh();
    setBusy(false);
    onChange?.();
  };

  const body = {
    free: person.is_public ? T.tile.publicBody(name) : T.tile.privateBody(name), public: T.tile.publicBody(name), private: T.tile.privateBody(name),
    pending: T.tile.pendingBody(name), incoming: T.tile.incomingBody(name), paired: T.tile.pairedBody(name),
  }[mode];
  const foot = {
    free: T.tile.freeFoot, public: T.tile.joinFree(name), private: T.tile.joinFree(name),
    pending: T.tile.pendingFoot, incoming: null, paired: T.tile.pairedFoot,
  }[mode];

  return (
    <section className="wt-tile" aria-label={T.tile.kicker}>
      <div className="wt-tile-head">
        <span className="wt-kicker">{T.tile.kicker}</span>
        {mode === 'free' && <span className="wt-premium">{PLANS_PAGE.premium.name}</span>}
        {mode === 'pending' && <span className="wt-chip">{T.tile.requestSent}</span>}
        {mode === 'paired' && <span className="wt-chip wt-chip--ok">{T.tile.watchingTogether}</span>}
      </div>
      {showCount
        ? <p className="wt-tile-count"><strong>{status.overlap_count}</strong><span>{T.tile.onBoth}</span></p>
        : (mode === 'private' || mode === 'pending') && <p className="wt-tile-lock">{mode === 'pending' ? T.tile.waitingTitle(name) : T.tile.privateTitle(name)}</p>}
      <p className="wt-tile-body">{body}</p>
      {error && <p className="wt-error" role="alert">{error}</p>}
      <div className="wt-tile-actions">
        {(mode === 'free' || mode === 'public' || mode === 'private') && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => send(person.id))}>{T.tile.inviteAction(name)}</button>}
        {mode === 'pending' && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(() => cancel(person.id))}>{T.requests.cancel}</button>}
        {mode === 'incoming' && <button type="button" className="btn btn-primary" onClick={() => setReviewing(true)}>{T.tile.incomingAction}</button>}
        {mode === 'paired' && <button type="button" className="btn btn-primary" onClick={() => navigate(`/together/with/${encodeURIComponent(person.username)}`)}>{T.tile.pairedAction}</button>}
      </div>
      {foot && <p className="wt-note">{foot}</p>}
      {reviewing && (
        <AcceptDialog person={person} viewerIsPublic={!!viewerProfile?.is_public} busy={busy}
          onClose={() => setReviewing(false)}
          onDecline={() => { setReviewing(false); run(() => respond(person.id, false)); }}
          onAccept={(shareFull) => { setReviewing(false); run(() => respond(person.id, true, shareFull)); }} />
      )}
    </section>
  );
}

/**
 * Settings › Privacy › Watch together: who can send you requests, and the
 * people you watch together with. The per-person watchlist switch only shows
 * while your profile is private (a public watchlist is already visible).
 *
 * @param {{ user: { id: string } | null, profile: any }} props
 */
export function WatchTogetherSettings({ user, profile }) {
  const userId = user?.id;
  const { partners, setShareFull, end } = useWatchTogether(userId);
  const { key, reset } = useWatchTogetherLink(userId);
  const [resetDone, setResetDone] = useState(false);
  const [from, setFrom] = useState(/** @type {string | null} */ (null));

  // Read here rather than in App's profile select so the app keeps loading
  // before the migration that adds the column is live.
  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('profiles').select('watch_together_requests_from').eq('id', userId).maybeSingle();
    setFrom(data?.watch_together_requests_from ?? 'profile');
  }, [userId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load the saved setting once
  useEffect(() => { load(); }, [load]);

  const choose = async (value) => {
    setFrom(value);
    const { error } = await updateProfile({ userId, patch: { watch_together_requests_from: value } });
    if (error) load();
  };

  const labels = { profile: T.settings.fromProfile, following: T.settings.fromFollowing, none: T.settings.fromNone };
  const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="wt-settings">
      <fieldset className="wt-settings-group">
        <legend className="wt-accept-label">{T.settings.whoCanRequest}</legend>
        {REQUESTS_FROM_OPTIONS.map(value => (
          <label key={value} className="wt-radio">
            <input type="radio" name="wt-requests-from" value={value} checked={from === value} onChange={() => choose(value)} disabled={from === null} />
            {labels[value]}
          </label>
        ))}
      </fieldset>
      <div className="wt-settings-group">
        <p className="wt-accept-label">{T.settings.partners}</p>
        {partners.length === 0 && <p className="wt-note">{T.settings.none}</p>}
        {partners.map(p => (
          <div key={p.other_id} className="wt-settings-partner">
            <div className="wt-person">
              <PersonAvatar person={p} />
              <span className="wt-person-text">
                <span className="wt-person-name">{personName(p)}</span>
                <span className="wt-note">{T.settings.since(dateFmt.format(new Date(p.accepted_at || p.created_at)), p.overlap_count ?? 0)}</span>
              </span>
              <button type="button" className="btn btn-secondary btn-sm wt-stop" onClick={() => end(p.other_id)}>{T.settings.stop}</button>
            </div>
            {!profile?.is_public && (
              <div className="wt-settings-share">
                <span>{T.settings.shareFull}</span>
                <SettingsSwitch label={`${T.settings.shareFull}: ${personName(p)}`} checked={p.i_share_full} onChange={() => setShareFull(p.other_id, !p.i_share_full)} />
              </div>
            )}
          </div>
        ))}
        <p className="wt-note">{T.settings.stopNote}</p>
      </div>
      <div className="wt-settings-group">
        <p className="wt-accept-label">{T.link.kicker}</p>
        <div className="wt-person">
          <span className="wt-person-text"><span className="wt-note">{T.link.resetNote}</span></span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!key || resetDone}
            onClick={async () => { const r = await reset(); if (r.ok) setResetDone(true); }}>{T.link.reset}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Make a shared list from the overlap list: name, a head start from the
 * titles you've both saved (or empty), and who's on it (partners only).
 *
 * @param {{ partner: { other_id: string, username: string, display_name?: string | null },
 *   overlapCount: number, onClose: () => void }} props
 */
export function ShareListDialog({ partner, overlapCount, onClose }) {
  const navigate = useNavigate();
  const { user, profile, customLists } = useApp();
  const { partners } = useWatchTogether(user?.id);
  const L = T.sharedList;
  const [name, setName] = useState(() => L.defaultName(personName(profile || {}), personName(partner)));
  const [seed, setSeed] = useState(overlapCount > 0);
  const [extra, setExtra] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const others = partners.filter(p => p.other_id !== partner.other_id);

  const create = async () => {
    setBusy(true); setError(null);
    const members = [partner.other_id, ...extra];
    const id = await customLists.createSharedList(name, members, seed ? partner.other_id : null);
    setBusy(false);
    if (id) { onClose(); navigate(collectionPath(customListKey(id))); } else setError(L.error);
  };

  return (
    <ResponsiveDialog title={L.sheetTitle} onClose={onClose}
      footer={<div className="wt-dialog-actions">
        <button type="button" className="btn btn-primary" onClick={create} disabled={busy || !name.trim()}>{L.create}</button>
      </div>}>
      <div className="wt-accept">
        <label className="wt-field">
          <span className="wt-accept-label">{L.name}</span>
          <input type="text" className="wt-search" value={name} onChange={e => setName(e.target.value)} />
        </label>
        <fieldset className="wt-settings-group">
          <legend className="wt-accept-label">{L.startWith}</legend>
          {overlapCount > 0 && (
            <label className="wt-radio">
              <input type="radio" name="wt-start" checked={seed} onChange={() => setSeed(true)} />
              <span><span className="wt-person-name">{L.startBoth(overlapCount)}</span><br /><span className="wt-note">{L.startBothNote}</span></span>
            </label>
          )}
          <label className="wt-radio">
            <input type="radio" name="wt-start" checked={!seed} onChange={() => setSeed(false)} />
            <span><span className="wt-person-name">{L.startEmpty}</span><br /><span className="wt-note">{L.startEmptyNote}</span></span>
          </label>
        </fieldset>
        <div className="wt-settings-group">
          <span className="wt-accept-label">{L.whosOn}</span>
          <div className="wt-chips">
            <span className="wt-filter active">{personName(partner)}</span>
            {others.map(p => (
              <button key={p.other_id} type="button" className={`wt-filter${extra.has(p.other_id) ? ' active' : ''}`} aria-pressed={extra.has(p.other_id)}
                onClick={() => setExtra(prev => { const next = new Set(prev); if (next.has(p.other_id)) next.delete(p.other_id); else next.add(p.other_id); return next; })}>
                {personName(p)}
              </button>
            ))}
          </div>
          <span className="wt-note">{L.whosOnNote}</span>
        </div>
        {error && <p className="wt-error" role="alert">{error}</p>}
      </div>
    </ResponsiveDialog>
  );
}

/**
 * "Add people" on a shared list: partners who aren't on it yet.
 *
 * @param {{ list: { id: string, people?: { user_id: string }[] }, onAdd: (id: string) => Promise<boolean>, onClose: () => void }} props
 */
export function SharedListPeopleDialog({ list, onAdd, onClose }) {
  const { user } = useApp();
  const { partners } = useWatchTogether(user?.id);
  const onList = new Set((list.people || []).map(p => p.user_id));
  const [added, setAdded] = useState(() => new Set());
  const candidates = partners.filter(p => !onList.has(p.other_id));
  const L = T.sharedList;
  return (
    <ResponsiveDialog title={L.addPeople} onClose={onClose}>
      <div className="wt-accept">
        <p className="wt-note">{L.addPeopleNote}</p>
        {candidates.length === 0 && <p className="wt-note">{L.noOneToAdd}</p>}
        {candidates.map(p => (
          <div key={p.other_id} className="wt-row">
            <PersonAvatar person={p} />
            <span className="wt-person-text"><span className="wt-person-name">{personName(p)}</span></span>
            {added.has(p.other_id)
              ? <span className="wt-chip wt-chip--ok">{L.shared}</span>
              : <button type="button" className="btn btn-primary btn-sm" onClick={async () => { if (await onAdd(p.other_id)) setAdded(prev => new Set(prev).add(p.other_id)); }}>{L.add}</button>}
          </div>
        ))}
      </div>
    </ResponsiveDialog>
  );
}

/**
 * "Saved by Sam too" on a title page: partners who saved this title and have
 * it on both watchlists. One partner opens your shared titles; more opens the
 * picker.
 *
 * @param {{ tmdbId: number, mediaType: string }} props
 */
export function SavedByTooRow({ tmdbId, mediaType }) {
  const navigate = useNavigate();
  const { user } = useApp();
  const [people, setPeople] = useState([]);
  useEffect(() => {
    if (!user?.id || !tmdbId) return undefined;
    let live = true;
    supabase.rpc('watch_together_savers', { p_tmdb_id: Number(tmdbId), p_media_type: mediaType }).then(({ data }) => {
      if (live) setPeople(data || []);
    });
    return () => { live = false; };
  }, [user?.id, tmdbId, mediaType]);
  if (!people.length) return null;
  const names = people.map(personName);
  const to = people.length === 1 ? `/together/with/${encodeURIComponent(people[0].username)}` : '/together/pick';
  return (
    <button type="button" className="wt-banner wt-saved-too interactive-surface" onClick={() => navigate(to)}>
      <span className="wt-banner-text">
        <span className="wt-banner-title">{T.savedToo.title(names)}</span>
        <span className="wt-note">{people.length === 1 ? T.savedToo.one : T.savedToo.many}</span>
      </span>
      <span className="wt-stack" aria-hidden="true">{people.slice(0, 3).map(p => <PersonAvatar key={p.id} person={p} size="sm" />)}</span>
      <svg className="wt-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
    </button>
  );
}
