import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { useHistory } from '../hooks/useHistory.js';
import { useHistoryDetails } from '../hooks/useHistoryDetails.js';
import { useGenres } from '@plot/core/useGenres.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { displayPosterPath } from '@plot/core/artwork.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { EVENTS } from '@plot/core/analyticsEvents.js';
import { ratingToStars } from '@plot/core/ratings.js';
import {
  streaks, favouriteWeekday, movieMinutes, formatDuration, averageStars,
  crowdComparison, crowdSentence, recurringPeople, entriesInYear,
} from '@plot/core/historyStats.js';
import {
  INSIGHT_PERIODS, FREE_PERIODS, periodEntries, samePeriodLastYear, yearOverYear,
  latelyFacts, latelySentence, latelyShifts, highestRated, onThisDay, weekdayCounts,
  hotTakes, premiumTeasers, insightsOpenedProps,
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
import EmptyState from './EmptyState.jsx';
import Segmented from './Segmented.jsx';
import Avatar from './Avatar.jsx';
import PremiumMark from './PremiumMark.jsx';
import UpgradeSheet from './UpgradeSheet.jsx';
import ShareCardSheet from './ShareCardSheet.jsx';
import { IconShare } from './navIcons.jsx';
import './InsightsView.css';

/* Insights: what your watching says about you, on one page. Free sees This
   month and This year; Premium adds All time and the deeper cards. Every
   number comes from @plot/core/insights.js and historyStats.js, so the phone
   shows the same answers. Nothing is compared with other Plot users: "the
   crowd" is TMDB's audience, as on History. */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ShareIcon({ what, onClick }) {
  if (!onClick) return null;
  return (
    <button type="button" className="hist-share" onClick={onClick} aria-label={SHARE_CARDS.shareCardAria(what)} title={SHARE_CARDS.shareAsCard}>
      <IconShare />
    </button>
  );
}

function Card({ label, note, share, children, className = '' }) {
  return (
    <section className={`ins-card ${className}`}>
      <div className="ins-card-head">
        <h2 className="ins-card-label">{label}</h2>
        {share}
      </div>
      {note && <p className="ins-card-note">{note}</p>}
      {children}
    </section>
  );
}

function Poster({ entry, size = 'w92' }) {
  const art = useUserArtwork();
  const img = posterUrl(displayPosterPath(art.apply(entry)), size);
  return <span className="ins-poster">{img && <img src={img} alt="" />}</span>;
}

function LatelyCard({ entries, today, genreName, premium }) {
  const facts = latelyFacts(entries, { now: today, genreName });
  const sentence = latelySentence(facts);
  const shifts = premium && facts ? latelyShifts(entries, { now: today, genreName }) : null;
  return (
    <Card label={T.latelyHeading} note={T.latelyNote} className="ins-lately">
      <p className="ins-lately-sentence">{sentence ?? T.latelyNotEnough}</p>
      {shifts && (
        <div className="ins-usual">
          <span className="ins-usual-label">{T.usualHeading}</span>
          {shifts.length ? (
            <ul className="ins-usual-list">{shifts.map(s => <li key={s}>{s}</li>)}</ul>
          ) : <span className="ins-usual-same">{T.usualSame}</span>}
        </div>
      )}
    </Card>
  );
}

function Stat({ value, label, delta }) {
  return (
    <div className="ins-stat">
      <span className="ins-stat-value">{value}</span>
      <span className="ins-stat-label">{label}</span>
      {delta && <span className="ins-stat-delta">{delta}</span>}
    </div>
  );
}

function StatsCard({ rows, details, today, premium, compare, onShare, periodLabel }) {
  const mins = movieMinutes(rows, details);
  const wd = favouriteWeekday(rows);
  const s = streaks(rows, today);
  const avg = averageStars(rows);
  return (
    <Card label={periodLabel} share={<ShareIcon what={periodLabel} onClick={onShare} />}>
      <div className="ins-stats">
        <Stat value={rows.length} label={T.statTitles}
          delta={premium && compare ? T.vsLastYearTitles(compare.titles) : null} />
        <Stat value={mins.counted ? formatDuration(mins.minutes) : '–'} label={T.statMovies} />
        <Stat value={wd && wd.total >= 3 ? wd.name : '–'} label={T.statNight} />
        {premium
          ? <Stat value={avg ? `${avg.stars}★` : '–'} label={T.averageStars}
              delta={compare?.stars != null ? T.vsLastYearStars(compare.stars) : null} />
          : <Stat value={s.best > 1 ? T.streakDays(s.best) : '–'} label={T.statStreak} />}
      </div>
    </Card>
  );
}

function moveText(item) {
  if (item.move === 'new') return T.moveNew;
  if (item.move === 'up') return T.moveUp(item.by);
  if (item.move === 'down') return T.moveDown(item.by);
  return null;
}

function HighestCard({ rows, today, periodStart, openPanel }) {
  const { items, moves } = highestRated(rows, { now: today, periodStart });
  return (
    <Card label={T.highestHeading} note={items.length ? T.highestNote : null}>
      {items.length === 0 ? <p className="ins-empty">{T.highestEmpty}</p> : (
        <ol className="ins-rank">
          {items.map(item => (
            <li key={item.entry.id}>
              <button type="button" className="ins-rank-row" onClick={() => openPanel(item.entry.tmdb_id, item.entry.media_type || 'movie')}>
                <span className="ins-rank-num">{item.rank}</span>
                <Poster entry={item.entry} />
                <span className="ins-rank-title">{item.entry.title}</span>
                <span className="ins-rank-stars">{ratingToStars(item.entry.rating)}★</span>
                {/* Every row keeps the column when movement shows, so the stars line up. */}
                {moves && <span className={`ins-move ins-move--${item.move}`}>{moveText(item)}</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
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

function OnThisDayCard({ entries, today, openPanel }) {
  const groups = onThisDay(entries, today);
  if (!groups.length) return null;
  return (
    <Card label={T.onThisDayHeading}>
      {groups.map(g => (
        <div key={g.year} className="ins-otd">
          <span className="ins-otd-when">{T.onThisDayLine(g.yearsAgo, g.year)}</span>
          {g.entries.map(e => (
            <button key={e.id} type="button" className="ins-otd-row" onClick={() => openPanel(e.tmdb_id, e.media_type || 'movie')}>
              <Poster entry={e} />
              <span className="ins-otd-title">{e.title}</span>
              {e.rating > 0 && <span className="ins-rank-stars">{ratingToStars(e.rating)}★</span>}
            </button>
          ))}
        </div>
      ))}
    </Card>
  );
}

function PeopleCard({ rows, details, premium, openPanel, onShare }) {
  const art = useUserArtwork();
  const people = recurringPeople(rows, details, { limit: premium ? 8 : 3 });
  if (!people.length) return null;
  return (
    <Card label={H.peopleHeading} share={<ShareIcon what={H.peopleHeading} onClick={onShare} />}>
      <div className="ins-people">
        {people.map(p => (
          <button key={p.id} type="button" className="hist-person" onClick={() => openPanel(p.id, 'person', 'insights')}>
            <Avatar src={profileUrl(art.path('person', p.id, 'profile') || p.profile_path, 'w185')} name={p.name} size={36} headshot />
            <span className="hist-person-text">
              <span className="hist-person-name">{p.name}</span>
              <span className="hist-card-note">{p.line}</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function HotTakesCard({ rows, details, openPanel }) {
  const takes = hotTakes(rows, details);
  return (
    <Card label={T.hotTakesHeading} note={T.hotTakesNote}>
      {takes.length === 0 ? <p className="ins-empty">{T.hotTakesEmpty}</p> : takes.map(t => (
        <button key={t.entry.id} type="button" className="ins-take" onClick={() => openPanel(t.entry.tmdb_id, t.entry.media_type || 'movie')}>
          <Poster entry={t.entry} />
          <span className="ins-take-title">{t.entry.title}</span>
          <span className="ins-take-you">{T.hotTakeYou(ratingToStars(t.entry.rating))}</span>
          <span className="ins-take-crowd">{T.hotTakeCrowd(t.crowdStars)}</span>
        </button>
      ))}
    </Card>
  );
}

function WeekdaysCard({ rows }) {
  const counts = weekdayCounts(rows);
  const max = Math.max(...counts);
  if (!max) return null;
  return (
    <Card label={T.weekdaysHeading} note={T.weekdaysNote}>
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

function PremiumCard({ teasers, onUpgrade }) {
  if (!teasers.length) return null;
  return (
    <Card label={<>{T.premiumHeading}<PremiumMark className="ins-premium-mark" /></>} note={T.premiumIntro} className="ins-premium">
      <div className="ins-teasers">
        {teasers.map(t => (
          <button key={t.id} type="button" className="ins-teaser" onClick={onUpgrade}>
            <svg className="ins-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            <span className="ins-teaser-text">
              <span className="ins-teaser-title">{t.title}</span>
              <span className="ins-teaser-body">{t.teaser}</span>
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-primary btn-sm ins-premium-btn" onClick={onUpgrade}>{COMMON.seePremium}</button>
    </Card>
  );
}

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
 * @param {any} [props.profile]
 * @param {any} [props.topLists]
 * @param {Date} [props.today]
 */
export function InsightsPage({ entries, details, detailsLoading, genreList, openPanel, premium, period, onPeriod, profile, topLists, today = new Date() }) {
  const [gate, setGate] = useState(false);
  const [shareCard, setShareCard] = useState(null);
  const genreName = (id) => genreList.find(g => g.id === id)?.name ?? null;
  const rows = useMemo(() => periodEntries(entries, period, today), [entries, period, today]);
  const compare = useMemo(() => yearOverYear(rows, samePeriodLastYear(entries, period, today)), [rows, entries, period, today]);
  const periodStart = period === INSIGHT_PERIODS.MONTH
    ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    : period === INSIGHT_PERIODS.YEAR ? `${today.getFullYear()}-01-01` : null;
  // Share cards are about the calendar year, as on History.
  const yearRows = useMemo(() => entriesInYear(entries, today.getFullYear()), [entries, today]);
  const shareCards = useMemo(
    () => (profile ? buildShareCards({ entries: yearRows, allEntries: entries, details, genreName, year: today.getFullYear(), now: today, topLists, profile }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- genreName reads genreList
    [entries, yearRows, details, genreList, today, topLists, profile],
  );
  const share = (id) => (shareCards.length && period !== INSIGHT_PERIODS.ALL ? () => setShareCard(id) : null);
  const teasers = useMemo(
    () => (premium ? [] : premiumTeasers({ entries, periodRows: rows, details, now: today, genreName, period })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- genreName reads genreList
    [premium, entries, rows, details, today, genreList, period],
  );

  if (!entries.length) return <div className="ins-page"><EmptyState title={T.emptyTitle} body={T.emptyBody} /></div>;

  const options = Object.values(INSIGHT_PERIODS).map(p => ({ value: p, label: T.periods[p] }));
  const choose = (p) => {
    if (!premium && !FREE_PERIODS.includes(p)) { setGate(true); return; }
    onPeriod(p);
  };

  return (
    <div className="ins-page">
      {gate && <UpgradeSheet reason="stats" onClose={() => setGate(false)} />}
      <header className="ins-head">
        <p className="ins-intro">{T.intro}</p>
        <div className="ins-periods">
          <Segmented options={options} value={period} onChange={choose} ariaLabel={T.periodLabel} />
          {!premium && <span className="ins-locked-note">{T.lockedPeriod(T.periods.all)}<PremiumMark className="ins-premium-mark" /></span>}
          {detailsLoading && <span className="ins-loading" aria-live="polite">{T.loading}</span>}
        </div>
      </header>

      <div className="ins-grid">
        <div className="ins-col">
          <LatelyCard entries={entries} today={today} genreName={genreName} premium={premium} />
          <StatsCard rows={rows} details={details} today={today} premium={premium} compare={compare}
            periodLabel={T.periods[period]} onShare={share(CARD_IDS.HIGHLIGHTS)} />
          {rows.length === 0
            ? <p className="ins-empty">{T.emptyPeriod}</p>
            : <HighestCard rows={rows} today={today} periodStart={periodStart} openPanel={openPanel} />}
          {premium && rows.length > 0 && <HotTakesCard rows={rows} details={details} openPanel={openPanel} />}
        </div>
        <div className="ins-col">
          <OnThisDayCard entries={entries} today={today} openPanel={openPanel} />
          <CrowdCard rows={rows} details={details} onShare={share(CARD_IDS.CROWD)} />
          <PeopleCard rows={rows} details={details} premium={premium} openPanel={openPanel} onShare={share(CARD_IDS.PERSON)} />
          {premium && <WeekdaysCard rows={rows} />}
          {!premium && <PremiumCard teasers={teasers} onUpgrade={() => setGate(true)} />}
        </div>
      </div>

      {shareCard && (
        <ShareCardSheet cards={shareCards} preset={shareCard} profile={profile} source="insights" onClose={() => setShareCard(null)} />
      )}
    </div>
  );
}

/* Container: the signed-in user's history and the TMDB details for the
   chosen period. */
export default function InsightsView() {
  const { user, profile, openPanel } = useApp();
  const { entries, loading } = useHistory(user?.id);
  const { lists: topLists } = useTopLists(user?.id);
  const { genres: genreList } = useGenres();
  const premium = isPremiumProfile(profile);
  const today = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState(INSIGHT_PERIODS.YEAR);
  // A Free viewer never sits on All time, even if they lose Premium mid-visit.
  const shown = premium || FREE_PERIODS.includes(period) ? period : INSIGHT_PERIODS.YEAR;
  const rows = useMemo(() => periodEntries(entries, shown, today), [entries, shown, today]);
  const { details, loading: detailsLoading } = useHistoryDetails(rows);

  // One event per visit, once there is something to show.
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || loading || !entries.length) return;
    sent.current = true;
    track(EVENTS.INSIGHTS_OPENED, insightsOpenedProps({ premium, source: 'web' }));
  }, [loading, entries.length, premium]);

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
      profile={profile}
      topLists={topLists}
      today={today}
    />
  );
}
