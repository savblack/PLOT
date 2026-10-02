// The cards on Home's two round 2 shelves (boards R2-4a to 4c). DiscoverView
// wraps them in its RailSection; the rules are in @plot/core
// (continueWatching.js, peopleFeed.js, peopleSuggestions.js).
//
// Continue watching is free for everyone. Your people is Premium: Free
// accounts never see the shelf, and a Premium member who follows nobody gets
// the invite with four suggestions from titles they have logged.
//
// Mobile parity: not shipped on mobile yet (issue 1093).
import { posterUrl, profileUrl } from '../utils/images.js';
import { PEOPLE as P } from '@plot/core/copy/people.js';
import { shortDayMonth } from '@plot/core/date.js';
import { FollowPill } from './PeopleFollow.jsx';
import './PeopleFollow.css';
import './HomeShelves.css';

/** Continue watching (board 4a): the poster, a thin progress line, what is next. */
export function ContinueCard({ item, onOpen }) {
  const img = posterUrl(item.posterPath, 'w185');
  return (
    <div className="media-card continue-card">
      <button type="button" className="media-card-hit interactive-surface" onClick={onOpen} aria-label={item.title}>
        <div className="media-card-img">{img ? <img src={img} alt="" loading="lazy" /> : <div className="media-card-img-placeholder" />}</div>
        <div className="continue-progress" aria-hidden="true"><span style={{ width: `${Math.round(item.progress * 100)}%` }} /></div>
        <div className="media-card-title">{item.title}</div>
        <div className="media-card-meta">{item.latest ? P.continueWatching.isOut(item.season, item.episode) : P.continueWatching.next(item.season, item.episode)}</div>
      </button>
    </div>
  );
}

const CHIP_CLASS = { outToday: 'people-chip people-chip--today', dated: 'people-chip people-chip--quiet' };

/** Who, and then the service or the date: "Florence Pugh · Netflix", "Pedro Pascal · 3 Dec". */
function shelfMeta(item, today) {
  const who = item.people.map(p => p.name).join(', ');
  const tail = item.date && item.date > today ? shortDayMonth(item.date) : item.network;
  return tail ? `${who} · ${tail}` : who;
}

/** One title on the Your people shelf (board 4b). */
export function PeopleShelfCard({ item, today, onOpen }) {
  const img = posterUrl(item.posterPath, 'w185');
  return (
    <div className="media-card people-card">
      <button type="button" className="media-card-hit interactive-surface" onClick={onOpen} aria-label={item.title}>
        <div className="media-card-img">{img ? <img src={img} alt="" loading="lazy" /> : <div className="media-card-img-placeholder" />}</div>
        <div className="media-card-title">{item.title}</div>
        <div className="media-card-meta">{shelfMeta(item, today)}</div>
        {item.chip && <div className="people-card-chip"><span className={CHIP_CLASS[item.chip] ?? 'people-chip'}>{P.chips[item.chip]}</span></div>}
      </button>
    </div>
  );
}

function reason(s) {
  if (s.kind === 'directed') return s.count > 1 ? P.shelf.directed(s.count) : P.shelf.directedOne(s.title);
  return s.count > 1 ? P.shelf.actedIn(s.count) : P.shelf.actedInOne(s.title);
}

/** The invite for someone who follows nobody yet (board 4c), minus its explanatory note. */
export function PeopleInvite({ suggestions, isFollowing, busyId, onToggle, onOpenPerson }) {
  if (!suggestions.length) return null;
  return (
    <div className="hist-card people-invite">
      {suggestions.map(s => (
        <div key={s.id} className="people-invite-person">
          <button type="button" className="people-invite-open" onClick={() => onOpenPerson(s.id)} aria-label={P.viewLabel(s.name)}>
            {profileUrl(s.profilePath) ? <img src={profileUrl(s.profilePath)} alt="" loading="lazy" /> : <span aria-hidden="true">{s.name.charAt(0)}</span>}
          </button>
          <b>{s.name}</b>
          <span className="people-invite-reason">{reason(s)}</span>
          <FollowPill following={isFollowing(s.id)} busy={busyId === s.id} name={s.name} size="xs"
            onClick={() => onToggle({ id: s.id, name: s.name, profile_path: s.profilePath, known_for_department: s.kind === 'directed' ? 'Directing' : 'Acting' })} />
        </div>
      ))}
    </div>
  );
}
