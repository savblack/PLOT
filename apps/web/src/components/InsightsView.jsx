import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useHistory } from '../hooks/useHistory.js';
import { useHistoryDetails } from '../hooks/useHistoryDetails.js';
import { useGenres } from '@plot/core/useGenres.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { displayPosterPath } from '@plot/core/artwork.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { EVENTS } from '@plot/core/analyticsEvents.js';
import { ratingToStars } from '@plot/core/ratings.js';
import { getConfig } from '@plot/core/config.js';
import { activationNudgeSources } from '@plot/core/activationNudge.js';
import {
  streaks, favouriteWeekday, movieMinutes, formatDuration, averageStars,
  crowdComparison, crowdSentence, recurringPeople, entriesInYear,
} from '@plot/core/historyStats.js';
import {
  INSIGHT_PERIODS, FREE_PERIODS, TYPE_MIN_TITLES, SAMPLE_INSIGHTS, periodEntries, samePeriodLastYear,
  yearOverYear, latelyShifts, highestRated, onThisDay, weekdayCounts, hotTakes, insightsOpenedProps,
  watchingType, typeHistory,
} from '@plot/core/insights.js';
import { buildShareCards, CARD_IDS } from '@plot/core/shareCards.js';
import { INSIGHTS_VIEW as T } from '@plot/core/copy/insightsView.js';
import { COMMON } from '@plot/core/copy/common.js';
import { SHARE_CARDS } from '../copy/shareCards.js';
import { HISTORY_VIEW as H } from '../copy/historyView.js';
import { track } from '../lib/analytics.js';
import { posterUrl, profileUrl } from '../utils/images.js';
import { useTopLists } from '../hooks/useTopLists.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import Avatar from './Avatar.jsx';
import UpgradeSheet from './UpgradeSheet.jsx';
import ShareCardSheet from './ShareCardSheet.jsx';
import ImportSourceIcon from './ImportSourceIcon.jsx';
import { IconShare } from './navIcons.jsx';
import './InsightsView.css';

/* Insights: what your watching says about you, on one page.

   Savannah's direction (21 Nov 2026): no body copy at the top, no blank
   space, and nothing empty is ever a message, it's an action. Free sees This
   month and the year; Premium's cards show to Free as tagged samples. An
   account with nothing logged sees the whole page as a sample under the
   actions that fill it in.

   Every number comes from @plot/core/insights.js and historyStats.js, so the
   phone shows the same answers. "The crowd" is TMDB's audience, as on History. */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function IconLock() {
  return (
    <svg className="ins-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ShareIcon({ what, onClick }) {
  if (!onClick) return null;
  return (
    <button type="button" className="hist-share" onClick={onClick} aria-label={SHARE_CARDS.shareCardAria(what)} title={SHARE_CARDS.shareAsCard}>
      <IconShare />
    </button>
  );
}

/* `tag` marks sample content; `onUnlock` adds the Premium button under it and
   blurs the sample. */
function Card({ label, tag, share, onUnlock, children, className = '' }) {
  return (
    <section className={`ins-card${tag ? ' ins-card--sample' : ''} ${className}`}>
      <div className="ins-card-head">
        <h2 className="ins-card-label">{label}</h2>
        {tag && <span className="ins-tag">{onUnlock && <IconLock />}{tag}</span>}
        {share}
      </div>
      {/* Premium samples are blurred and hidden from screen readers: next to
          real numbers they read as the viewer's own (Nov 21 critique). */}
      {onUnlock ? <div className="ins-card-preview" aria-hidden="true" inert>{children}</div> : children}
      {onUnlock && (
        <button type="button" className="btn btn-secondary btn-sm ins-unlock" onClick={onUnlock}>{COMMON.seePremium}</button>
      )}
    </section>
  );
}

function Action({ label, onClick, primary = true }) {
  return <button type="button" className={`btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-sm ins-action`} onClick={onClick}>{label}</button>;
}

function Poster({ entry }) {
  const art = useUserArtwork();
  const img = posterUrl(displayPosterPath(art.apply(entry)), 'w92');
  return <span className="ins-poster">{img && <img src={img} alt="" />}</span>;
}

/* ── Chips ── */

function PeriodChips({ period, year, premium, onChoose }) {
  const chips = [
    { id: INSIGHT_PERIODS.MONTH, label: T.periods.month },
    { id: INSIGHT_PERIODS.YEAR, label: T.yearChip(year) },
    { id: INSIGHT_PERIODS.ALL, label: T.periods.all },
  ];
  return (
    <div className="ins-chips" role="group" aria-label={T.periodLabel}>
      {chips.map(c => {
        const locked = !premium && !FREE_PERIODS.includes(c.id);
        const on = c.id === period;
        return (
          <button key={c.id} type="button" aria-pressed={on} aria-label={locked ? T.lockedPeriod(c.label) : undefined}
            className={`ins-chip${on ? ' ins-chip--on' : ''}${locked ? ' ins-chip--locked' : ''}`} onClick={() => onChoose(c.id)}>
            {locked && <IconLock />}{c.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── The watching type ── */

function TypeCard({ type, history, premium, sample, needed, onFindTitle, year }) {
  if (!type) {
    // Not enough logged yet: how far there is to go, and the one step.
    const have = TYPE_MIN_TITLES - needed;
    return (
      <section className="ins-card ins-type ins-type--empty">
        <div className="ins-type-main">
          <h2 className="ins-type-kicker">{T.typeHeading}</h2>
          <p className="ins-type-name">{T.typeLocked}</p>
        </div>
        <div className="ins-type-side">
          <div className="ins-dots" role="img" aria-label={`${have} of ${TYPE_MIN_TITLES}`}>
            {Array.from({ length: TYPE_MIN_TITLES }, (_, i) => <span key={i} className={`ins-dot${i < have ? ' ins-dot--on' : ''}`} />)}
          </div>
          <Action label={T.findTitle} onClick={onFindTitle} />
        </div>
      </section>
    );
  }
  const last = history?.find((m, i) => i > 0 && m.name);
  return (
    <section className="ins-card ins-type">
      <div className="ins-type-main">
        <div className="ins-type-top">
          <h2 className="ins-type-kicker">{type.basis === 'lately' ? T.typeHeading : T.typeHeadingYear(year)}</h2>
          {sample && <span className="ins-tag ins-tag--dark">{T.sample}</span>}
        </div>
        <p className="ins-type-name">{type.name}</p>
        <p className="ins-type-line">{type.line}</p>
      </div>
      <div className="ins-type-side">
        <ul className="ins-reasons">{type.reasons.map(r => <li key={r}>{r}</li>)}</ul>
        {premium && history?.slice(1).some(m => m.name) ? (
          <div className="ins-months" aria-label={T.typeMonths}>
            {/* Earlier months only: this month is the big name above. */}
            {history.slice(1).map(m => m.name && (
              <span key={`${m.year}-${m.month}`} className="ins-month"><b>{MONTHS[m.month]}</b> {m.name.replace(/^The /, '')}</span>
            ))}
          </div>
        ) : last && <p className="ins-type-last">{T.lastMonth(last.name)}</p>}
      </div>
    </section>
  );
}

/* ── Cards ── */

function Stat({ value, label, delta }) {
  return (
    <div className="ins-stat">
      <span className="ins-stat-value">{value}</span>
      <span className="ins-stat-label">{label}</span>
      {delta && <span className="ins-stat-delta">{delta}</span>}
    </div>
  );
}

function StatsCard({ label, stats, premium, tag, onShare, empty }) {
  return (
    <Card label={label} tag={tag} share={<ShareIcon what={label} onClick={onShare} />}>
      {empty || (
        <div className="ins-stats">
          <Stat value={stats.titles} label={T.statTitles} delta={premium && stats.titlesDelta != null ? T.vsLastYearTitles(stats.titlesDelta) : null} />
          <Stat value={stats.movies} label={T.statMovies} />
          <Stat value={stats.night} label={T.statNight} />
          {premium
            ? <Stat value={stats.stars} label={T.averageStars} delta={stats.starsDelta != null ? T.vsLastYearStars(stats.starsDelta) : null} />
            : <Stat value={stats.streak} label={T.statStreak} />}
        </div>
      )}
    </Card>
  );
}

function moveText(item) {
  if (item.move === 'new') return T.moveNew;
  if (item.move === 'up') return T.moveUp(item.by);
  if (item.move === 'down') return T.moveDown(item.by);
  return null;
}

function RankRow({ rank, entry, title, stars, item, moves, onOpen }) {
  const body = (
    <>
      <span className="ins-rank-num">{rank}</span>
      {entry && <Poster entry={entry} />}
      <span className="ins-row-title">{title}</span>
      <span className="ins-stars">{stars}★</span>
      {moves && <span className={`ins-move ins-move--${item.move}`}>{moveText(item)}</span>}
    </>
  );
  return onOpen
    ? <button type="button" className="ins-row" onClick={onOpen}>{body}</button>
    : <div className="ins-row">{body}</div>;
}

function HighestCard({ rows, today, periodStart, openPanel, onRate }) {
  const { items, moves } = highestRated(rows, { now: today, periodStart });
  return (
    <Card label={T.highestHeading}>
      {items.length === 0 ? <Action label={T.rateSome} onClick={onRate} primary={false} /> : (
        <div className="ins-rows">
          {items.map(item => (
            <RankRow key={item.entry.id} rank={item.rank} entry={item.entry} title={item.entry.title} stars={ratingToStars(item.entry.rating)}
              item={item} moves={moves} onOpen={() => openPanel(item.entry.tmdb_id, item.entry.media_type || 'movie')} />
          ))}
        </div>
      )}
    </Card>
  );
}

function SampleHighestCard() {
  return (
    <Card label={T.highestHeading} tag={T.sample}>
      <div className="ins-rows">
        {SAMPLE_INSIGHTS.highest.map((s, i) => <RankRow key={s.title} rank={i + 1} title={s.title} stars={s.stars} item={s} moves />)}
      </div>
    </Card>
  );
}

function OnThisDayCard({ entries, today, openPanel }) {
  const groups = onThisDay(entries, today);
  if (!groups.length) return null;
  return (
    <Card label={T.onThisDayHeading}>
      {groups.map(g => (
        <div key={g.year} className="ins-rows">
          <span className="ins-sub">{T.onThisDayLine(g.yearsAgo, g.year)}</span>
          {g.entries.map(e => (
            <button key={e.id} type="button" className="ins-row" onClick={() => openPanel(e.tmdb_id, e.media_type || 'movie')}>
              <Poster entry={e} />
              <span className="ins-row-title">{e.title}</span>
              {e.rating > 0 && <span className="ins-stars">{ratingToStars(e.rating)}★</span>}
            </button>
          ))}
        </div>
      ))}
    </Card>
  );
}

function CrowdCard({ rows, details, onShare }) {
  const cmp = crowdComparison(rows, details);
  if (!cmp || cmp.compared < 3) return null;
  return (
    <Card label={H.crowdHeading} share={<ShareIcon what={H.crowdHeading} onClick={onShare} />}>
      <p className="ins-lead">{crowdSentence(cmp)}</p>
    </Card>
  );
}

function PeopleCard({ rows, details, premium, openPanel, onShare }) {
  const art = useUserArtwork();
  const people = recurringPeople(rows, details, { limit: premium ? 8 : 3 });
  if (!people.length) return null;
  return (
    <Card label={H.peopleHeading} share={<ShareIcon what={H.peopleHeading} onClick={onShare} />}>
      <div className="ins-rows">
        {people.map(p => (
          <button key={p.id} type="button" className="ins-row" onClick={() => openPanel(p.id, 'person', 'insights')}>
            <Avatar src={profileUrl(art.path('person', p.id, 'profile') || p.profile_path, 'w185')} name={p.name} size={36} headshot />
            <span className="ins-row-text">
              <span className="ins-row-title">{p.name}</span>
              <span className="ins-sub">{p.line}</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function SamplePeopleCard() {
  return (
    <Card label={H.peopleHeading} tag={T.sample}>
      <div className="ins-rows">
        {SAMPLE_INSIGHTS.people.map(p => (
          <div key={p.name} className="ins-row">
            <Avatar name={p.name} size={36} />
            <span className="ins-row-text">
              <span className="ins-row-title">{p.name}</span>
              <span className="ins-sub">{p.line}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function UsualCard({ lines, tag, onUnlock }) {
  if (!lines) return null;
  return (
    <Card label={T.usualHeading} tag={tag} onUnlock={onUnlock}>
      {lines.length
        ? <ul className="ins-list">{lines.map(l => <li key={l}>{l}</li>)}</ul>
        : <p className="ins-lead">{T.usualSame}</p>}
    </Card>
  );
}

function HotTakesCard({ takes, tag, onUnlock, openPanel }) {
  if (!takes.length) return null;
  return (
    <Card label={T.hotTakesHeading} tag={tag} onUnlock={onUnlock}>
      <div className="ins-rows">
        {takes.map(t => {
          const body = (
            <>
              {t.entry && <Poster entry={t.entry} />}
              <span className="ins-row-title">{t.title}</span>
              <span className="ins-stars">{T.hotTakeYou(t.you)}</span>
              <span className="ins-crowd">{T.hotTakeCrowd(t.crowd)}</span>
            </>
          );
          return t.entry
            ? <button key={t.title} type="button" className="ins-row" onClick={() => openPanel(t.entry.tmdb_id, t.entry.media_type || 'movie')}>{body}</button>
            : <div key={t.title} className="ins-row">{body}</div>;
        })}
      </div>
    </Card>
  );
}

function WeekdaysCard({ counts, tag, onUnlock }) {
  const max = Math.max(...counts);
  if (!max) return null;
  return (
    <Card label={T.weekdaysHeading} tag={tag} onUnlock={onUnlock}>
      <div className="ins-week" role="list">
        {counts.map((n, i) => (
          <div key={WEEKDAYS[i]} className="ins-week-day" role="listitem" aria-label={T.weekdayCount(WEEKDAYS[i], n)}>
            <span className="ins-week-n" aria-hidden="true">{n || ''}</span>
            <span className={`ins-week-bar${n === max ? ' ins-week-bar--top' : ''}`} style={{ height: `${Math.max(4, (n / max) * 100)}%` }} aria-hidden="true" />
            <span className="ins-week-wd" aria-hidden="true">{T.weekdayShort[i]}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* The first step for an empty account: add a title, or bring a history over. */
function StartCard({ sources, onFindTitle, onImport }) {
  return (
    <section className="ins-card ins-start">
      <h2 className="ins-start-title">{T.startTitle}</h2>
      <div className="ins-start-actions">
        <Action label={T.findTitle} onClick={onFindTitle} />
        {sources.map(src => (
          <button key={src.id} type="button" className="ins-source" onClick={() => onImport(src.id)} aria-label={T.importFrom(src.name)}>
            <ImportSourceIcon id={src.id} name={src.name} size={22} />
            <span>{src.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const SAMPLE_TAKES = SAMPLE_INSIGHTS.hotTakes.map(t => ({ ...t, entry: null }));

/**
 * The page itself, data in, so Storybook can render it without the app.
 * @param {object} props
 * @param {any[]} props.entries          Every history row for the user.
 * @param {Map<string, any>} props.details TMDB details for the period's rows.
 * @param {boolean} props.detailsLoading
 * @param {Array<{id:number,name:string}>} props.genreList
 * @param {Function} props.openPanel
 * @param {boolean} props.premium
 * @param {'month'|'year'|'all'} props.period
 * @param {Function} props.onPeriod
 * @param {() => void} props.onFindTitle  Opens search.
 * @param {(sourceId: string) => void} props.onImport
 * @param {() => void} props.onRate        Goes to History, where titles are rated.
 * @param {Array<{id:string,name:string}>} [props.importSources]
 * @param {any} [props.profile]
 * @param {any} [props.topLists]
 * @param {Date} [props.today]
 */
export function InsightsPage({
  entries, details, detailsLoading, genreList, openPanel, premium, period, onPeriod,
  onFindTitle, onImport, onRate, importSources = [], profile, topLists, today = new Date(),
}) {
  const [gate, setGate] = useState(false);
  const [shareCard, setShareCard] = useState(null);
  const genreName = (id) => genreList.find(g => g.id === id)?.name ?? null;
  const year = today.getFullYear();
  const rows = useMemo(() => periodEntries(entries, period, today), [entries, period, today]);
  const compare = useMemo(() => yearOverYear(rows, samePeriodLastYear(entries, period, today)), [rows, entries, period, today]);
  const periodStart = period === INSIGHT_PERIODS.MONTH
    ? `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    : period === INSIGHT_PERIODS.YEAR ? `${year}-01-01` : null;
  // Share cards are about the calendar year, as on History.
  const yearRows = useMemo(() => entriesInYear(entries, year), [entries, year]);
  const shareCards = useMemo(
    () => (profile ? buildShareCards({ entries: yearRows, allEntries: entries, details, genreName, year, now: today, topLists, profile }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- genreName reads genreList
    [entries, yearRows, details, genreList, today, topLists, profile],
  );
  const share = (id) => (shareCards.length && period !== INSIGHT_PERIODS.ALL ? () => setShareCard(id) : null);
  const type = useMemo(
    () => watchingType(entries, { now: today, details, genreName }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- genreName reads genreList
    [entries, today, details, genreList],
  );
  const history = useMemo(
    () => typeHistory(entries, { now: today, details, genreName }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- genreName reads genreList
    [entries, today, details, genreList],
  );
  const unlock = () => setGate(true);
  const choose = (p) => { if (!premium && !FREE_PERIODS.includes(p)) { unlock(); return; } onPeriod(p); };
  const periodLabel = period === INSIGHT_PERIODS.YEAR ? T.yearChip(year) : T.periods[period];
  const sheets = (
    <>
      {gate && <UpgradeSheet reason="stats" onClose={() => setGate(false)} />}
      {shareCard && <ShareCardSheet cards={shareCards} preset={shareCard} profile={profile} source="insights" onClose={() => setShareCard(null)} />}
    </>
  );

  // Nothing logged: the actions first, then the whole page as a sample.
  if (!entries.length) {
    const s = SAMPLE_INSIGHTS.stats;
    return (
      <div className="ins-page">
        {sheets}
        <div className="ins-flow">
          <StartCard sources={importSources} onFindTitle={onFindTitle} onImport={onImport} />
          <TypeCard type={SAMPLE_INSIGHTS.type} sample year={year} />
          <StatsCard label={T.yearChip(year)} tag={T.sample}
            stats={{ titles: s.titles, movies: s.movies, night: s.night, streak: T.streakDays(6) }} />
          <SampleHighestCard />
          <SamplePeopleCard />
          <UsualCard lines={SAMPLE_INSIGHTS.usual} tag={T.samplePremium} onUnlock={unlock} />
          <HotTakesCard takes={SAMPLE_TAKES} tag={T.samplePremium} onUnlock={unlock} />
          <WeekdaysCard counts={SAMPLE_INSIGHTS.weekdays} tag={T.samplePremium} onUnlock={unlock} />
        </div>
      </div>
    );
  }

  const mins = movieMinutes(rows, details);
  const wd = favouriteWeekday(rows);
  const best = streaks(rows, today).best;
  const avg = averageStars(rows);
  const stats = {
    titles: rows.length,
    movies: mins.counted ? formatDuration(mins.minutes) : '–',
    night: wd && wd.total >= 3 ? wd.name : '–',
    streak: best > 1 ? T.streakDays(best) : '–',
    stars: avg ? `${avg.stars}★` : '–',
    titlesDelta: compare?.titles ?? null,
    starsDelta: compare?.stars ?? null,
  };
  const shifts = premium ? latelyShifts(entries, { now: today, genreName }) : null;
  const takes = premium
    ? hotTakes(rows, details).map(t => ({ entry: t.entry, title: t.entry.title, you: ratingToStars(t.entry.rating), crowd: t.crowdStars }))
    : SAMPLE_TAKES;
  const sampleTag = premium ? null : T.samplePremium;
  const toUnlock = premium ? null : unlock;

  return (
    <div className="ins-page">
      {sheets}
      <div className="ins-head">
        <PeriodChips period={period} year={year} premium={premium} onChoose={choose} />
        {detailsLoading && <span className="ins-loading" aria-live="polite">{T.loading}</span>}
      </div>
      <div className="ins-flow">
        <TypeCard type={type} history={history} premium={premium} year={year}
          needed={Math.max(0, TYPE_MIN_TITLES - entries.length)} onFindTitle={onFindTitle} />
        <StatsCard label={periodLabel} stats={stats} premium={premium} onShare={share(CARD_IDS.HIGHLIGHTS)}
          empty={rows.length === 0 ? (
            <div className="ins-empty-action">
              <p className="ins-lead">{T.periodEmpty(periodLabel)}</p>
              <Action label={T.logMore} onClick={onFindTitle} />
            </div>
          ) : null} />
        {rows.length > 0 && <HighestCard rows={rows} today={today} periodStart={periodStart} openPanel={openPanel} onRate={onRate} />}
        <OnThisDayCard entries={entries} today={today} openPanel={openPanel} />
        <CrowdCard rows={rows} details={details} onShare={share(CARD_IDS.CROWD)} />
        <PeopleCard rows={rows} details={details} premium={premium} openPanel={openPanel} onShare={share(CARD_IDS.PERSON)} />
        <UsualCard lines={premium ? shifts : SAMPLE_INSIGHTS.usual} tag={sampleTag} onUnlock={toUnlock} />
        <HotTakesCard takes={takes} tag={sampleTag} onUnlock={toUnlock} openPanel={openPanel} />
        <WeekdaysCard counts={premium ? weekdayCounts(rows) : SAMPLE_INSIGHTS.weekdays} tag={sampleTag} onUnlock={toUnlock} />
      </div>
    </div>
  );
}

/* Container: the signed-in user's history and the TMDB details for the
   chosen period. */
export default function InsightsView() {
  const { user, profile, openPanel, openSearch } = useApp();
  const navigate = useNavigate();
  const { entries, loading } = useHistory(user?.id);
  const { lists: topLists } = useTopLists(user?.id);
  const { genres: genreList } = useGenres();
  const premium = isPremiumProfile(profile);
  const today = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState(INSIGHT_PERIODS.YEAR);
  // A Free viewer never sits on All time, even if they lose Premium mid-visit.
  const shown = premium || FREE_PERIODS.includes(period) ? period : INSIGHT_PERIODS.YEAR;
  // Details for the period, plus the year the watching type can fall back on.
  const rows = useMemo(() => {
    const p = periodEntries(entries, shown, today);
    const year = periodEntries(entries, INSIGHT_PERIODS.YEAR, today);
    return [...new Set([...p, ...year])];
  }, [entries, shown, today]);
  const { details, loading: detailsLoading } = useHistoryDetails(rows);
  const importSources = useMemo(() => activationNudgeSources(getConfig()), []);

  // One event per visit. An empty account counts as the nudge being shown.
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || loading || !user) return;
    sent.current = true;
    if (entries.length) track(EVENTS.INSIGHTS_OPENED, insightsOpenedProps({ premium, source: 'web' }));
    else track(EVENTS.ACTIVATION_NUDGE_SHOWN, { surface: 'insights' });
  }, [loading, user, entries.length, premium]);

  if (!user) return null;
  if (loading) return <LoadingSpinner />;
  return (
    <InsightsPage
      entries={entries}
      details={details}
      detailsLoading={detailsLoading}
      genreList={genreList}
      openPanel={openPanel}
      premium={premium}
      period={shown}
      onPeriod={setPeriod}
      onFindTitle={() => { if (!entries.length) track(EVENTS.ACTIVATION_NUDGE_ADD_CLICKED, { surface: 'insights' }); openSearch?.(); }}
      onImport={(id) => { track(EVENTS.ACTIVATION_NUDGE_IMPORT_CLICKED, { surface: 'insights', source: id }); navigate(`/import?source=${id}`); }}
      onRate={() => navigate('/history')}
      importSources={importSources}
      profile={profile}
      topLists={topLists}
      today={today}
    />
  );
}
