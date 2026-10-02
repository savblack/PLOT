// Your people (board R2-5a): the people you follow on the left (hover a row to
// unfollow, search to add one), and their new and upcoming work by date or by
// person on the right. The Show filter is the same SideFilters rows as every
// other page: TV, Movies, Cinema.
//
// Reached from Home's Your people shelf, the follow toast, the Notifications
// footer, Following on a person's page and Settings. No sidebar item yet.
//
// Data and rules: @plot/core/usePeopleFollows.js and @plot/core/peopleFeed.js.
// Mobile parity: not shipped on mobile yet (issue 1093).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { usePeopleFeed, usePeopleFollows } from '@plot/core/usePeopleFollows.js';
import { feedItems, filterFeedByType, groupByDate, groupByPerson } from '@plot/core/peopleFeed.js';
import { localDateStr, monthLongName, shortDayMonth, weekdayDayMonth } from '@plot/core/date.js';
import { ALL_TYPES } from '@plot/core/mediaFilters.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { PEOPLE as P } from '@plot/core/copy/people.js';
import { tmdb } from '@plot/core/tmdb.js';
import { posterUrl, profileUrl } from '../utils/images.js';
import SideFilters from './SideFilters.jsx';
import { TYPE_ROWS } from './sideFilterRows.js';
import { IconSearch } from './navIcons.jsx';
import { FollowPill } from './PeopleFollow.jsx';
import { useFollowPerson } from '../hooks/useFollowPerson.jsx';
import './PeopleFollow.css';
import './YourPeopleView.css';

const CHIP_CLASS = { outToday: 'people-chip people-chip--today', dated: 'people-chip people-chip--quiet' };

/** The badge line above a title: who, and how, when it isn't acting. */
function peopleLine(item) {
  return item.people.map(p => p.role === 'director' ? `${p.name}, ${P.page.directing}`
    : p.role === 'creator' ? `${p.name}, ${P.page.creating}` : p.name).join(' · ');
}

/** The date column: the day for anything dated, "since" for what is already out. */
function whenLine(item, today) {
  if (!item.date) return '';
  if (item.date >= today) return weekdayDayMonth(item.date);
  if (item.mediaType === 'tv' && item.premiereDrop === 1) return P.page.weeklySince(shortDayMonth(item.date));
  return P.page.since(shortDayMonth(item.date));
}

export function FeedRow({ item, today, saved, onSave, onOpen }) {
  const chips = [
    item.chip && { key: 'chip', className: CHIP_CLASS[item.chip] ?? 'people-chip', label: P.chips[item.chip] },
    item.chip !== 'newSeason' && item.kind === 'season' && { key: 'season', className: 'people-chip', label: P.chips.newSeason },
    item.network && { key: 'net', className: 'people-chip people-chip--quiet', label: item.network },
    item.mediaType === 'tv' && item.premiereDrop > 1 && { key: 'drop', className: 'people-chip people-chip--quiet', label: P.page.allEpisodes(item.premiereDrop) },
  ].filter(Boolean);
  return (
    <div className="people-row">
      <button type="button" className="people-row-open" onClick={onOpen}>
        {item.posterPath ? <img className="people-row-poster" src={posterUrl(item.posterPath, 'w92')} alt="" loading="lazy" /> : <span className="people-row-poster" aria-hidden="true" />}
        <span className="people-row-text">
          <span className="people-row-who">{peopleLine(item)}</span>
          <span className="people-row-title">{item.title}{item.kind === 'season' ? ` · ${P.page.season(item.season)}` : ''}</span>
          {chips.length > 0 && <span className="people-row-chips">{chips.map(c => <span key={c.key} className={c.className}>{c.label}</span>)}</span>}
        </span>
      </button>
      <span className="people-row-when">{whenLine(item, today)}</span>
      <button type="button" className={`btn btn-secondary btn-xs people-row-save${saved ? ' people-row-save--on' : ''}`} onClick={onSave} aria-pressed={saved}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
        {saved ? P.page.saved : P.page.save}
      </button>
    </div>
  );
}

/** Search TMDB people and follow one from the results. */
function FollowSearch({ follow }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      tmdb.searchPeople(term).then(data => {
        if (active) setResults((data?.results ?? []).filter(p => p?.id && p?.name).slice(0, 6));
      }).catch(() => { if (active) setResults([]); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);
  const shown = query.trim().length >= 2 ? results : null;
  return (
    <div className="people-search">
      <label className="hist-search people-search-field">
        <IconSearch />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={P.page.searchPlaceholder} aria-label={P.page.searchLabel} />
      </label>
      {shown && (
        <div className="people-search-results">
          {shown.length === 0 && <p className="people-muted">{P.page.noResults}</p>}
          {shown.map(person => (
            <div key={person.id} className="people-follow-row">
              <PersonAvatar path={person.profile_path} name={person.name} />
              <span className="people-follow-text"><b>{person.name}</b><span>{person.known_for_department}</span></span>
              <FollowPill following={follow.isFollowing(person.id)} busy={follow.busyId === person.id} name={person.name} onClick={() => follow.toggle(person)} size="xs" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonAvatar({ path, name }) {
  const src = profileUrl(path);
  return src ? <img className="people-avatar" src={src} alt="" loading="lazy" /> : <span className="people-avatar" aria-hidden="true">{name?.charAt(0)}</span>;
}

/** Pure layout; data comes from YourPeopleView (and from a story). */
export function YourPeoplePage({ follows, items, today, loading, view, setView, typeFilters, setTypeFilters, follow, onUnfollow, onOpenPerson, onOpenTitle, isSaved, onSave }) {
  const filtered = filterFeedByType(items, typeFilters);
  const todayYear = Number(today.slice(0, 4));
  const sections = view === 'person'
    ? groupByPerson(filtered, follows).map(g => ({ key: `p${g.person.id}`, title: g.person.name, items: g.items }))
    : groupByDate(filtered).map(g => ({
      key: g.key,
      title: g.key === 'out' ? P.page.outNow : monthLongName(Number(g.key.slice(0, 4)), Number(g.key.slice(5, 7)) - 1, todayYear),
      items: g.items,
    }));
  return (
    <div className="hist-page people-page">
      <div className="hist-toolbar people-toolbar">
        <span className="hist-toolbar-sub">{P.page.subtitle}</span>
        <div className="cal-scope" role="group" aria-label={P.page.title}>
          <button type="button" className={`cal-scope-btn${view === 'date' ? ' active' : ''}`} aria-pressed={view === 'date'} onClick={() => setView('date')}>{P.page.byDate}</button>
          <button type="button" className={`cal-scope-btn${view === 'person' ? ' active' : ''}`} aria-pressed={view === 'person'} onClick={() => setView('person')}>{P.page.byPerson}</button>
        </div>
      </div>
      <div className="cal-body">
        <aside className="cal-side people-side">
          <section className="hist-card people-following">
            <div className="hist-card-head">
              <span className="hist-card-title">{P.page.followingTitle}</span>
              <span className="people-muted">{P.page.peopleCount(follows.length)}</span>
            </div>
            <div className="people-following-list">
              {follows.map(f => (
                <div key={f.tmdb_person_id} className="people-follow-row people-follow-row--manage">
                  <button type="button" className="people-follow-open" onClick={() => onOpenPerson(f.tmdb_person_id)}>
                    <PersonAvatar path={f.profile_path} name={f.name} />
                    <span className="people-follow-text"><b>{f.name}</b><span>{f.known_for === 'Directing' ? P.page.directingDept : P.page.acting}</span></span>
                  </button>
                  <button type="button" className="btn btn-secondary btn-xs people-unfollow" onClick={() => onUnfollow(f.tmdb_person_id)}>{P.unfollow}</button>
                </div>
              ))}
            </div>
            <FollowSearch follow={follow} />
          </section>
          <section className="hist-card home-filter-card">
            <SideFilters typeRows={TYPE_ROWS} typeFilters={typeFilters} setTypeFilters={setTypeFilters} genreFilters={[]} setGenreFilters={() => {}} genres={[]} showGenre={false} />
          </section>
        </aside>
        <div className="cal-stream people-stream">
          {!loading && follows.length === 0 && <div className="empty-state"><div className="empty-body">{P.page.empty}</div></div>}
          {!loading && follows.length > 0 && sections.length === 0 && <p className="people-muted">{P.page.nothing}</p>}
          {sections.map(section => (
            <section key={section.key} className="cal-stream-group">
              <div className="cal-stream-month"><h2 className="cal-stream-month-name">{section.title}</h2><span className="cal-stream-month-count">{P.page.titleCount(section.items.length)}</span></div>
              <div className="people-rows">
                {section.items.map(item => (
                  <FeedRow key={item.key} item={item} today={today} saved={isSaved(item)} onSave={() => onSave(item)} onOpen={() => onOpenTitle(item)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      {follow.sheet}
    </div>
  );
}

export default function YourPeopleView() {
  const { user, profile, openPanel, watchlist } = useApp();
  const navigate = useNavigate();
  const people = usePeopleFollows(user?.id);
  const follow = useFollowPerson();
  const [view, setView] = useState('date');
  const [typeFilters, setTypeFilters] = useState(ALL_TYPES);
  const today = localDateStr();
  const ids = useMemo(() => people.follows.map(f => f.tmdb_person_id), [people.follows]);
  const { rows, loading } = usePeopleFeed(ids, { today, version: people.feedVersion });
  const items = useMemo(() => feedItems(rows, { region: profile?.region || DEFAULT_REGION, today }), [rows, profile?.region, today]);
  return (
    <YourPeoplePage
      follows={people.follows}
      items={items}
      today={today}
      loading={people.loading || loading}
      view={view}
      setView={setView}
      typeFilters={typeFilters}
      setTypeFilters={setTypeFilters}
      follow={follow}
      onUnfollow={id => people.unfollow(id)}
      onOpenPerson={id => navigate(`/person/${id}`)}
      onOpenTitle={item => openPanel(item.tmdbId, item.mediaType, 'your_people')}
      isSaved={item => watchlist.isInList(item.tmdbId)}
      onSave={item => watchlist.toggle({ id: item.tmdbId, media_type: item.mediaType, title: item.title, name: item.title, poster_path: item.posterPath })}
    />
  );
}
