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
import { useWatchTogether, useWatchTogetherStatus } from '@plot/core/useWatchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { premiumPlansPath } from '../utils/premiumExplore.js';
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
 *   viewer: { id: string } | null, viewerProfile: any }} props
 */
export function WatchTogetherTile({ person, viewer, viewerProfile }) {
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
  };

  const body = {
    free: T.tile.freeBody, public: T.tile.publicBody(name), private: T.tile.privateBody(name),
    pending: T.tile.pendingBody(name), incoming: T.tile.incomingBody(name), paired: T.tile.pairedBody(name),
  }[mode];
  const foot = {
    free: T.tile.freeFoot(PLANS_PAGE.premium.priceSummary, name), public: T.tile.joinFree(name), private: T.tile.joinFree(name),
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
        {mode === 'free' && <button type="button" className="btn btn-primary" onClick={() => navigate(premiumPlansPath(`/u/${person.username}`))}>{T.tile.freeAction(name)}</button>}
        {(mode === 'public' || mode === 'private') && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => send(person.id))}>{T.tile.inviteAction(name)}</button>}
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
    </div>
  );
}
