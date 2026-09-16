import { useMemo, useState, useEffect } from 'react';
import { useApp } from '../hooks/useApp.js';
import { useHistory } from '../hooks/useHistory.js';
import { useHistoryDetails } from '../hooks/useHistoryDetails.js';
import { useGenres } from '@plot/core/useGenres.js';
import { groupEntriesByMonth, monthLabel } from '../utils/history.js';
import {
  calendarParts, entriesInYear, yearsWithEntries, filterEntries, genreCounts,
  titlePerDay, streaks, favouriteWeekday, movieMinutes, formatDuration,
  averageStars, crowdComparison, crowdSentence, recurringPeople, monthInsight,
  yearSentence, topGenreId,
} from '@plot/core/historyStats.js';
import { ratingToStars } from '@plot/core/ratings.js';
import { posterUrl, profileUrl } from '../utils/images.js';
import { getButtonLikeProps } from '../utils/interactive.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import { IconChevronLeft, IconChevronRight, IconSearch } from './navIcons.jsx';
import SideFilters, { FilterRow } from './SideFilters.jsx';
import { TYPE_ROWS } from './sideFilterRows.js';
import { HISTORY_VIEW as T } from '../copy/historyView.js';

/* History is its own page: the poster shelf, one month at a time, with a
   sticky column of small cards beside it that say something about the year
   (how much, how kind, how it compares with TMDB's audience, who keeps
   turning up). The frame matches the Calendar's: 264px side column, 72px
   gap, 24px serif month names on the stream.

   Every number here comes from history rows plus the TMDB details PLOT
   already fetches for the media panel. Nothing is compared with other PLOT
   users. */

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// The Calendar's Show rows minus Cinema: a history row records that you
// watched something, not where, so a Cinema row could never match anything.
const HISTORY_TYPE_ROWS = TYPE_ROWS.filter(r => r.id !== 'cinema');
const ALL_HISTORY_TYPES = HISTORY_TYPE_ROWS.map(r => r.id);

function dayLabel(dateStr) {
  const p = calendarParts(dateStr);
  return p ? `${WEEKDAY_SHORT[p.weekday]} ${p.day}` : '';
}

/* White on the chip's dark scrim: the star rating token is tuned for the page
   surface, not for an overlay on artwork. */
function StarIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z" />
    </svg>
  );
}

/* ── Side cards ── */

function Stat({ value, label }) {
  return (
    <div className="hist-stat">
      <span className="hist-stat-value">{value}</span>
      <span className="hist-stat-label">{label}</span>
    </div>
  );
}

function YearCard({ year, isCurrentYear, entries, details, detailsLoading, genreName }) {
  const avg = averageStars(entries);
  const wd = favouriteWeekday(entries);
  const mins = movieMinutes(entries, details);
  const sentence = yearSentence({
    count: entries.length,
    topGenre: genreName(topGenreId(entries)),
    weekday: wd,
    dnf: entries.filter(e => e.dnf).length,
  });
  return (
    <div className="hist-card">
      <div className="hist-card-head">
        <span className="hist-card-title">{isCurrentYear ? T.yearSoFar(year) : T.yearCardTitle(year)}</span>
        {detailsLoading && <span className="hist-card-note" aria-live="polite">{T.loadingInsights}</span>}
      </div>
      <div className="hist-stats">
        <Stat value={entries.length} label={T.titles} />
        <Stat value={mins.counted ? formatDuration(mins.minutes) : '–'} label={T.watchingMovies} />
        <Stat value={avg ? avg.stars : '–'} label={T.yourAverage} />
        <Stat value={wd && wd.total >= 3 ? wd.name : '–'} label={T.yourNight} />
      </div>
      {sentence && <p className="hist-sentence">{sentence}</p>}
    </div>
  );
}

/* One title per day: the month as a strip of what you saw. `month` is the
   index into the year's month groups (newest first). */
function MiniMonthCard({ year, monthIndex, monthGroups, onMonthIndex, entries, today, openPanel }) {
  const group = monthGroups[monthIndex];
  const perDay = useMemo(() => (group ? titlePerDay(entries, year, group.month) : new Map()), [entries, year, group]);
  if (!group) return null;
  const first = new Date(year, group.month, 1);
  const daysInMonth = new Date(year, group.month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first grid
  const isThisMonth = today.getFullYear() === year && today.getMonth() === group.month;
  const s = streaks(entries, today);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(<span key={`lead-${i}`} className="hist-mini-blank" aria-hidden="true" />);
  for (let d = 1; d <= daysInMonth; d++) {
    const e = perDay.get(d);
    const future = isThisMonth && d > today.getDate();
    const isToday = isThisMonth && d === today.getDate();
    if (e) {
      const img = posterUrl(e.poster_path, 'w92');
      cells.push(
        <button
          key={d}
          type="button"
          className="hist-mini-tile"
          onClick={() => openPanel(e.tmdb_id, e.media_type || 'movie')}
          aria-label={`${d} ${monthLabel(year, group.month)}: ${e.title}`}
          title={e.title}
        >
          {img && <img src={img} alt="" />}
          <span className="hist-mini-tile-day" aria-hidden="true">{d}</span>
        </button>,
      );
    } else {
      cells.push(
        <span
          key={d}
          className={`hist-mini-day${isToday ? ' hist-mini-day--today' : ''}${future ? ' hist-mini-day--future' : ''}`}
        >
          {d}
        </span>,
      );
    }
  }
  return (
    <div className="hist-card">
      <div className="hist-card-head">
        <span className="hist-card-title">{monthLabel(year, group.month).replace(/ \d{4}$/, '')}</span>
        <div className="hist-mini-nav">
          <button type="button" className="hist-mini-btn" onClick={() => onMonthIndex(monthIndex + 1)} disabled={monthIndex >= monthGroups.length - 1} aria-label={T.previousMonth}><IconChevronLeft /></button>
          <button type="button" className="hist-mini-btn" onClick={() => onMonthIndex(monthIndex - 1)} disabled={monthIndex <= 0} aria-label={T.nextMonth}><IconChevronRight /></button>
        </div>
      </div>
      <div className="hist-mini-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => <span key={`wd-${i}`} className="hist-mini-wd" aria-hidden="true">{w}</span>)}
        {cells}
      </div>
      <div className="hist-card-foot">
        <span>{T.daysWithAWatch(perDay.size)}</span>
        {s.best > 1 && <span>{T.bestStreak} <b>{s.best}</b>{s.bestMonth ? ` in ${s.bestMonth.slice(0, 3)}` : ''}</span>}
      </div>
    </div>
  );
}

function CrowdCard({ entries, details, detailsLoading, openPanel }) {
  const cmp = crowdComparison(entries, details);
  const sentence = crowdSentence(cmp);
  return (
    <div className="hist-card">
      <span className="hist-card-label">{T.crowdHeading}</span>
      {cmp && cmp.compared >= 3 ? (
        <div className="hist-card-body">
          <span className="hist-card-lead">{sentence}</span>
          <div className="hist-crowd-row">
            {cmp.disagreements.map(({ entry }) => {
              const img = posterUrl(entry.poster_path, 'w92');
              return (
                <button key={entry.id} type="button" className="hist-crowd-poster" onClick={() => openPanel(entry.tmdb_id, entry.media_type || 'movie')} aria-label={T.openTitle(entry.title)} title={entry.title}>
                  {img && <img src={img} alt="" />}
                </button>
              );
            })}
            <span className="hist-card-note">{T.crowdDisagreements}</span>
          </div>
        </div>
      ) : (
        <span className="hist-card-note">{detailsLoading ? T.loadingCard : T.crowdNeedsRatings}</span>
      )}
    </div>
  );
}

function PeopleCard({ entries, details, detailsLoading, navigateTo }) {
  const people = recurringPeople(entries, details);
  return (
    <div className="hist-card">
      <span className="hist-card-label">{T.peopleHeading}</span>
      {people.length ? (
        <div className="hist-card-body">
          {people.map(p => {
            const img = profileUrl(p.profile_path, 'w185');
            return (
              <button key={p.id} type="button" className="hist-person" onClick={() => navigateTo(`person/${p.id}`)}>
                <span className="hist-person-avatar">{img && <img src={img} alt="" />}</span>
                <span className="hist-person-text">
                  <span className="hist-person-name">{p.name}</span>
                  <span className="hist-card-note">{p.line}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <span className="hist-card-note">{detailsLoading ? T.loadingCard : T.peopleNeedsMore}</span>
      )}
    </div>
  );
}

/* The Calendar's Show and Genre rows, then History's own Status rows in the
   same style. Reviewed and Didn't finish are OR-ed: either state qualifies. */
function Filters({ types, setTypes, genres, setGenres, genreOptions, reviewed, setReviewed, dnf, setDnf }) {
  return (
    <SideFilters
      typeRows={HISTORY_TYPE_ROWS}
      typeFilters={types}
      setTypeFilters={setTypes}
      genreFilters={genres}
      setGenreFilters={setGenres}
      genres={genreOptions}
    >
      <div className="cal-filter">
        <div className="cal-filter-label">{T.filterStatus}</div>
        <div>
          <FilterRow label={T.filterReviewed} on={reviewed} onToggle={() => setReviewed(v => !v)} />
          <FilterRow label={T.filterDidntFinish} on={dnf} onToggle={() => setDnf(v => !v)} />
        </div>
      </div>
    </SideFilters>
  );
}

/* ── Stream ── */

function PosterCard({ entry, openPanel }) {
  const img = posterUrl(entry.poster_path, 'w185');
  const stars = entry.rating > 0 ? ratingToStars(entry.rating) : null;
  const open = () => openPanel(entry.tmdb_id, entry.media_type || 'movie');
  return (
    <div className="hist-poster" onClick={open} {...getButtonLikeProps({ onPress: open, label: T.openTitle(entry.title) })}>
      <div className="hist-poster-art">
        {img && <img src={img} alt="" loading="lazy" />}
        {stars != null && <span className="hist-chip"><StarIcon /> {stars}</span>}
        {entry.dnf && <span className="hist-chip hist-chip--dnf">{T.didNotFinish}</span>}
        {entry.note && <span className="hist-poster-note" title={T.reviewed}><NoteIcon /></span>}
      </div>
      <span className="hist-poster-title">{entry.title}</span>
      <span className="hist-poster-day">{dayLabel(entry.watched_at)}</span>
    </div>
  );
}

function MonthGroup({ group, allGroups, today, openPanel }) {
  const insight = monthInsight(group, allGroups, today);
  return (
    <section className="hist-month" id={`history-${group.year}-${group.month}`}>
      <div className="hist-month-head">
        <div className="hist-month-name-row">
          <span className="hist-month-name">{monthLabel(group.year, group.month).replace(/ \d{4}$/, '')}</span>
          <span className="hist-month-count">{T.monthTitles(group.entries.length)}</span>
        </div>
        {insight && <span className="hist-month-insight">{insight}</span>}
      </div>
      <div className="hist-wall">
        {group.entries.map(e => <PosterCard key={e.id} entry={e} openPanel={openPanel} />)}
      </div>
    </section>
  );
}

/* ── Page ── */

/**
 * Presentational: everything arrives as props so Storybook can render the
 * page from fixtures without a session. HistoryView below owns the data.
 *
 * @param {object} props
 * @param {any[]}  props.entries        Every history row for the user.
 * @param {Map<string, any>} props.details  TMDB details keyed by detailsKey.
 * @param {boolean} props.detailsLoading
 * @param {Array<{id:number,name:string}>} props.genreList
 * @param {Function} props.openPanel
 * @param {Function} props.navigateTo
 * @param {number}  props.activeYear
 * @param {Function} props.onYear
 * @param {Date}    [props.today]
 */
export function HistoryPage({ entries, details, detailsLoading, genreList, openPanel, navigateTo, activeYear, onYear, today = new Date() }) {
  const years = useMemo(() => yearsWithEntries(entries), [entries]);
  const yearEntries = useMemo(() => entriesInYear(entries, activeYear), [entries, activeYear]);

  const [types, setTypes] = useState(ALL_HISTORY_TYPES);
  const [genres, setGenres] = useState([]);
  const [reviewed, setReviewed] = useState(false);
  const [dnf, setDnf] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => filterEntries(yearEntries, { types, genres, reviewed, dnf, query }),
    [yearEntries, types, genres, reviewed, dnf, query],
  );
  const monthGroups = useMemo(() => groupEntriesByMonth(filtered), [filtered]);
  const allYearGroups = useMemo(() => groupEntriesByMonth(yearEntries), [yearEntries]);

  const [monthIndex, setMonthIndex] = useState(0);
  // Snap the mini month back to the newest month whenever the year or the
  // filters change what's there.
  useEffect(() => { setMonthIndex(0); }, [activeYear, monthGroups.length]); // eslint-disable-line react-hooks/set-state-in-effect

  const genreName = (id) => genreList.find(g => g.id === id)?.name ?? null;
  // Only genres that occur in this year's history, so the menu offers nothing
  // that would empty the page; alphabetical, as the Calendar lists them.
  const genreOptions = useMemo(
    () => genreCounts(yearEntries).map(g => ({ id: g.id, name: genreName(g.id) })).filter(g => g.name)
      .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- genreName reads genreList
    [yearEntries, genreList],
  );

  if (!entries.length) {
    return (
      <div className="empty-state" style={{ marginTop: '1rem' }}>
        <div className="empty-title">{T.emptyTitle}</div>
        <div className="empty-body">{T.emptyBody}</div>
      </div>
    );
  }

  return (
    <div className="hist-page">
      <div className="hist-toolbar">
        <span className="hist-toolbar-sub">{T.subtitle}</span>
        <div className="hist-toolbar-controls">
          {years.length > 1 && (
            years.length <= 4 ? (
              <div className="hist-years" role="tablist">
                {[...years].reverse().map(y => (
                  <button key={y} type="button" role="tab" className={`hist-year-btn${y === activeYear ? ' active' : ''}`} aria-selected={y === activeYear} onClick={() => onYear(y)}>{y}</button>
                ))}
              </div>
            ) : (
              <select className="hist-year-select" value={activeYear} onChange={e => onYear(Number(e.target.value))} aria-label="Year">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )
          )}
          <label className="hist-search">
            <IconSearch />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={T.searchPlaceholder} aria-label={T.searchPlaceholder} />
          </label>
        </div>
      </div>

      <div className="hist-body">
        <aside className="hist-side">
          <YearCard
            year={activeYear}
            isCurrentYear={activeYear === today.getFullYear()}
            entries={yearEntries}
            details={details}
            detailsLoading={detailsLoading}
            genreName={genreName}
          />
          {monthGroups.length > 0 && (
            <MiniMonthCard
              year={activeYear}
              monthIndex={Math.min(monthIndex, monthGroups.length - 1)}
              monthGroups={monthGroups}
              onMonthIndex={setMonthIndex}
              entries={filtered}
              today={today}
              openPanel={openPanel}
            />
          )}
          <CrowdCard entries={yearEntries} details={details} detailsLoading={detailsLoading} openPanel={openPanel} />
          <PeopleCard entries={yearEntries} details={details} detailsLoading={detailsLoading} navigateTo={navigateTo} />
          <Filters
            types={types} setTypes={setTypes}
            genres={genres} setGenres={setGenres} genreOptions={genreOptions}
            reviewed={reviewed} setReviewed={setReviewed}
            dnf={dnf} setDnf={setDnf}
          />
        </aside>

        <div className="hist-stream">
          {monthGroups.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">{T.noMatchesTitle}</div>
              <div className="empty-body">{T.noMatchesBody}</div>
            </div>
          ) : monthGroups.map(g => (
            <MonthGroup key={g.key} group={g} allGroups={allYearGroups} today={today} openPanel={openPanel} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* Container: the signed-in user's history, TMDB details for the selected
   year, and the genre list. */
export default function HistoryView() {
  const { user, openPanel, navigateTo } = useApp();
  const { entries, loading } = useHistory(user?.id);
  const { genres: genreList } = useGenres();
  const today = useMemo(() => new Date(), []);
  const years = useMemo(() => yearsWithEntries(entries), [entries]);
  const [year, setYear] = useState(null);
  const activeYear = year ?? years[0] ?? today.getFullYear();
  const yearEntries = useMemo(() => entriesInYear(entries, activeYear), [entries, activeYear]);
  const { details, loading: detailsLoading } = useHistoryDetails(yearEntries);

  if (!user) return null;
  if (loading) return <LoadingSpinner />;
  return (
    <HistoryPage
      entries={entries}
      details={details}
      detailsLoading={detailsLoading}
      genreList={genreList}
      openPanel={openPanel}
      navigateTo={navigateTo}
      activeYear={activeYear}
      onYear={setYear}
      today={today}
    />
  );
}
