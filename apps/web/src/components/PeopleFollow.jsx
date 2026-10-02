// Following people (Premium) on web: the + badge on a cast headshot, the
// Directed by / Created by row, the Follow button on a person's page, and the
// follow toast. Round 2 design, boards R2-1a/1b/1c, 2a/2b/2d.
//
// What is followed and the Premium rule live in @plot/core/usePeopleFollows.js
// (one shared store, the database decides who may follow); copy in
// @plot/core/copy/people.js. Free accounts get the existing upgrade sheet with
// the alerts reason, up front when billing already says Free, otherwise when
// the insert comes back premium_required.
//
// Mobile parity: not shipped on mobile yet (issue 1093).
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFollowPerson } from '../hooks/useFollowPerson.jsx';
import { on, PERSON_FOLLOWED_EVENT } from '@plot/core/events.js';
import { PEOPLE as P } from '@plot/core/copy/people.js';
import { profileUrl } from '../utils/images.js';
import './PeopleFollow.css';

export const PlusIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
export const TickIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>;

/**
 * A cast headshot with its own Follow badge (variant A on board 1b). The face
 * opens the person; the badge is a separate button. Desktop shows the badge on
 * hover or focus, phones always; a followed person keeps the accent tick.
 */
export function CastFollowCard({ person, following, busy, onOpen, onToggle, showFollow = true }) {
  const image = profileUrl(person.profile_path);
  const role = person.character || person.roles?.[0]?.character;
  return (
    <div className={`panel-cast-card cast-follow${following ? ' cast-follow--on' : ''}`}>
      <span className="cast-follow-face">
        <button type="button" className="cast-follow-open" onClick={onOpen} aria-label={P.viewLabel(person.name)}>
          {image
            ? <img src={image} alt="" loading="lazy" />
            : <span className="panel-cast-fallback" aria-hidden="true">{person.name?.charAt(0)}</span>}
        </button>
        {showFollow && (
          <button
            type="button"
            className="cast-follow-badge"
            onClick={onToggle}
            disabled={busy}
            aria-pressed={following}
            aria-label={following ? P.followingLabel(person.name) : P.followLabel(person.name)}
          >
            {following ? <TickIcon /> : <PlusIcon />}
          </button>
        )}
      </span>
      <button type="button" className="cast-follow-text" onClick={onOpen} tabIndex={-1} aria-hidden="true">
        <span className="panel-cast-name">{person.name}</span>
        {role && <span className="panel-cast-role">{role}</span>}
      </button>
    </div>
  );
}

/** "Directed by" / "Created by": headshot, name, role, and Follow to the right. */
export function CrewFollowRow({ person, roleLabel, following, busy, onOpen, onToggle, showFollow = true }) {
  const image = profileUrl(person.profile_path);
  return (
    <div className="crew-follow-row">
      <button type="button" className="crew-follow-open" onClick={onOpen} aria-label={P.viewLabel(person.name)}>
        {image ? <img src={image} alt="" loading="lazy" /> : <span className="crew-follow-fallback" aria-hidden="true">{person.name?.charAt(0)}</span>}
        <span className="crew-follow-text">
          <span className="crew-follow-name">{person.name}</span>
          <span className="crew-follow-role">{roleLabel}</span>
        </span>
      </button>
      {showFollow && <FollowPill following={following} busy={busy} name={person.name} onClick={onToggle} size="xs" />}
    </div>
  );
}

/** The compact Follow / Following button. */
export function FollowPill({ following, busy, name, onClick, size = 'sm' }) {
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-${size} follow-pill${following ? ' follow-pill--on' : ''}`}
      onClick={onClick}
      disabled={busy}
      aria-pressed={following}
      aria-label={following ? P.followingLabel(name) : P.followLabel(name)}
    >
      {following ? <TickIcon /> : <PlusIcon />}
      {following ? P.following : P.follow}
    </button>
  );
}

/** Follow on a person's page (board 2a), with the short explainer beside it. */
export function PersonFollow({ person }) {
  const f = useFollowPerson();
  const navigate = useNavigate();
  if (!f.signedIn || !person?.id || !person?.name) return null;
  const following = f.isFollowing(person.id);
  return (
    <div className="person-follow">
      <FollowPill following={following} busy={f.busyId === person.id} name={person.name} onClick={() => f.toggle(person)} />
      {following
        ? <button type="button" className="person-follow-note person-follow-link" onClick={() => navigate('/your-people')}>{P.page.title}</button>
        : <span className="person-follow-note">{P.explainer}</span>}
      {f.failed && <span className="person-follow-note" role="alert">{P.error}</span>}
      {f.sheet}
    </div>
  );
}

/** The follow toast itself (board 2b / 2d): headshot, message, View. */
export function FollowToastView({ name, profilePath, upcoming, onView, onDismiss, variant = 'surface' }) {
  const image = profileUrl(profilePath);
  return (
    <div className={`follow-toast follow-toast--${variant}`} role="status" aria-live="polite">
      {image ? <img className="follow-toast-face" src={image} alt="" /> : <span className="follow-toast-face" aria-hidden="true">{name?.charAt(0)}</span>}
      <span className="follow-toast-message">{P.toast.added(name, upcoming)}</span>
      <button type="button" className={variant === 'dark' ? 'follow-toast-link' : 'btn btn-secondary btn-sm'} onClick={onView}>{P.toast.view}</button>
      <button type="button" className="follow-toast-close" aria-label={P.toast.dismiss} onClick={onDismiss}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

const SHOW_MS = 7000;

/** One host in the app shell listens for follows and shows the toast. */
export function FollowToastHost() {
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    const off = on(PERSON_FOLLOWED_EVENT, (payload) => {
      setToast(payload);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), SHOW_MS);
    });
    return () => { off(); if (timer.current) clearTimeout(timer.current); };
  }, []);
  if (!toast) return null;
  return (
    <FollowToastView
      {...toast}
      onView={() => { setToast(null); navigate('/your-people'); }}
      onDismiss={() => setToast(null)}
    />
  );
}
