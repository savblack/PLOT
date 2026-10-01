// Settings › Privacy: who can see your Want to Watch. The rule is enforced by
// can_view_watchlist in the database; the choices and people come from
// @plot/core/watchlistVisibility.js, shared with mobile's settings screen.
import { useApp } from '../hooks/useApp.js';
import { SettingsSwitch } from './SettingsPage.jsx';
import { PersonAvatar } from './WatchTogetherParts.jsx';
import { personName } from '@plot/core/watchTogether.js';
import { useWatchlistVisibility, useWatchlistViewers, watchlistVisibilityOptions } from '@plot/core/watchlistVisibility.js';
import { PROFILE_PRIVACY } from '../copy/profilePrivacy.js';
import './WatchlistVisibilitySetting.css';

const T = PROFILE_PRIVACY.watchlist;

/** @param {{ is_follower: boolean, is_partner: boolean }} person */
function relation(person) {
  if (person.is_follower && person.is_partner) return T.followerAndPartner;
  return person.is_partner ? T.partner : T.follower;
}

export default function WatchlistVisibilitySetting() {
  const { user, profile } = useApp();
  const isPublic = !!profile?.is_public;
  const { visibility, loaded, setVisibility } = useWatchlistVisibility(user?.id, isPublic);
  const { people, setSelected } = useWatchlistViewers(visibility === 'selected' ? user?.id : null);

  return (
    <div className="wl-vis">
      <fieldset className="wl-vis-group">
        <legend className="settings-row-label">{T.heading}</legend>
        {watchlistVisibilityOptions(isPublic).map(value => (
          <label key={value} className="wl-vis-radio">
            <input type="radio" name="watchlist-visibility" value={value} checked={visibility === value}
              onChange={() => setVisibility(value)} disabled={!loaded} />
            <span>
              <span className="wl-vis-option">{T.option[value]}</span>
              <span className="wl-vis-hint">{T.hint[value]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {visibility === 'selected' && (
        <div className="wl-vis-group">
          <p className="settings-row-label">{T.pickHeading}</p>
          {people.length === 0 && <p className="wl-vis-hint">{T.pickEmpty}</p>}
          {people.map(p => (
            <div key={p.id} className="wl-vis-person">
              <PersonAvatar person={p} size="sm" />
              <span className="wl-vis-person-text">
                <span className="wl-vis-option">{personName(p)}</span>
                <span className="wl-vis-hint">{relation(p)}</span>
              </span>
              <SettingsSwitch label={`${T.pickHeading}: ${personName(p)}`} checked={p.selected} onChange={() => setSelected(p.id, !p.selected)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
