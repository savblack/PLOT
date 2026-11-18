import { ALL_TYPES } from '@plot/core/mediaFilters.js';
import { parseGenreBrowse } from '@plot/core/browse.js';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { posterUrl, backdropUrl } from '../utils/images.js';
import { displayBackdropPath, displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { favoriteWords } from '../utils/spelling.js';
import { FAVOURITES_ENABLED } from '@plot/core/features.js';
import ScrollRail from './ScrollRail.jsx';
import PlotLogo from './PlotLogo.jsx';
import RailArrows from './RailArrows.jsx';
import { useRailScroll } from '../hooks/useRailScroll.js';
import { useGenres } from '../hooks/useGenres.js';
import { useDiscover } from '../hooks/useDiscover.js';
import { usePlatformCharts } from '../hooks/usePlatformCharts.js';
import { OFFICIAL_PLATFORMS } from '@plot/core/usePlatformCharts.js';
import { tmdb, getTmdbRegion } from '@plot/core/tmdb.js';
import { filterByType, filterByGenre } from '../utils/mediaFilters.js';
import { MEDIA } from '../copy/media.js';
import { cardMetaLine } from '@plot/core/media.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import { SaveButton, FavoriteButton } from './TitleActions.jsx';
import Icon from './Icon.jsx';
import EmptyState from './EmptyState.jsx';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';
import { clampToSentences } from '@plot/core/sentences.js';
import { homePersonalState, selectHomeHero, selectHomeUpNext } from '@plot/core/home.js';
import { dedupeHomeShelves, visibleHomeSections } from '@plot/core/homeLayout.js';
import { useHomeLayout } from '@plot/core/useHomeLayout.js';
import { usePinnedShelves } from '@plot/core/usePinnedShelves.js';
import { pinLabel, pinOptions } from '@plot/core/homePins.js';
import HomeLayoutSheet from './HomeLayoutSheet.jsx';
import UpgradeSheet from './UpgradeSheet.jsx';
import './HomeLook.css';
import { getCalendarRelativeLabel } from '@plot/core/calendar.js';
import { featuredCuratedList } from '@plot/core/curatedLists.js';
import { CuratedListCard, CuratedListDialog } from './CuratedLists.jsx';
import PicksCarousel from './PicksCarousel.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import GroupedFilterMenu from './GroupedFilterMenu.jsx';
import SideFilters from './SideFilters.jsx';
import { TYPE_ROWS } from './sideFilterRows.js';
import { IconCalendar, IconChevronRight } from './navIcons.jsx';
import { useCalendar } from '../hooks/useCalendar.js';
import { localDateStr } from '../utils/date.js';
import { useHistory } from '../hooks/useHistory.js';
import { usePremium } from '../hooks/usePremium.js';
import { useContinueWatching, usePeopleSuggestions, useRecommendationShelves } from '@plot/core/useHomeShelves.js';
import { usePeopleFeed, usePeopleFollows } from '@plot/core/usePeopleFollows.js';
import { feedItems } from '@plot/core/peopleFeed.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { PEOPLE } from '@plot/core/copy/people.js';
import HomeTopCards from './HomeTopCards.jsx';
import { useFirstRun } from '../hooks/useFirstRun.js';
import { oncePerSession } from '@plot/core/oncePerSession.js';
import { readStorage, writeStorage } from '../utils/storage.js';
import { track, EVENTS } from '../lib/analytics.js';
import { ContinueCard, PeopleInvite, PeopleShelfCard } from './HomeShelves.jsx';
import { useFollowPerson } from '../hooks/useFollowPerson.jsx';

// Web-only: navigator connectivity events have no React Native equivalent.
// State precedence and copy remain shared in core; mobile should render the
// same states from its platform connectivity source.
function useOnlineStatus() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/* Home is one scroll. It used to be four sub-tabs (Discover, New Releases,
   Upcoming, Guide) under a sticky toolbar, with every section collapsible and
   an expand/collapse-all control. Guide is a schedule, not a feed, so it is a
   sidebar destination now; Upcoming is a list of dates, so it lives in
   Calendar; New Releases is a rail here with its own page behind "See all".
   Nothing collapses — a section worth skipping is worth moving down. */

/* ── Rail ── */
/* Both rails are ScrollRail: it carries the drag behaviour these used to wire
   up themselves, plus the chevron controls a pointer needs. */
function Rail({ rail, children }) {
  return (
    <ScrollRail
      rail={rail}
      style={{ paddingLeft: 'var(--discover-rail-gut, var(--gut))', paddingRight: 'var(--discover-rail-gut, var(--gut))', paddingTop: '0.25rem', paddingBottom: '1rem' }}
    >
      {children}
    </ScrollRail>
  );
}

/* The section banner: a Gabarito title, an optional subtitle, and a slot on the
   right for the rail's scroll arrows or a "See all" link.

   `subtitle` is deliberately optional rather than an always-present kicker: a
   line under every shelf is noise by the third one. Pass it only where the
   title does not already say it — "Top 10 by Platform" needs to say whose
   ranking it is; "Hot Right Now" says where "hot" comes from (TMDB's
   trending-today list), because the title alone does not. */
export function DiscoverSectionHeader({ subtitle, title, headerRight }) {
  return (
    <div className="discover-section-header">
      <div className="discover-section-heading">
        <h2 className="discover-section-title">{title}</h2>
        {subtitle && <span className="discover-section-sub">{subtitle}</span>}
      </div>
      {headerRight && <div className="discover-section-actions">{headerRight}</div>}
    </div>
  );
}

/* A section whose body is a rail. Owns the scroll state so the header can
   carry the arrows while the rail itself holds the cards. */
export function RailSection({ id, title, subtitle, sectionClassName = 'discover-section', headerRight, children }) {
  const rail = useRailScroll();

  return (
    <section id={id} className={sectionClassName}>
      <DiscoverSectionHeader
        title={title}
        subtitle={subtitle}
        headerRight={<>{headerRight}<RailArrows rail={rail} /></>}
      />
      <Rail rail={rail}>{children}</Rail>
    </section>
  );
}

const HOME_SECTION = {
  // First-run only: the titles they just saved in onboarding, ahead of everything else.
  saved: { id: 'home-saved', label: DISCOVER_VIEW.savedToWatch, navLabel: DISCOVER_VIEW.savedToWatch },
  picks: { id: 'home-picks', label: "plot's Picks", navLabel: "Plot's Picks" },
  continue: { id: 'home-continue', label: PEOPLE.continueWatching.title, navLabel: PEOPLE.continueWatching.title },
  because: { id: 'home-because', label: DISCOVER_VIEW.recommendations.becauseName, navLabel: DISCOVER_VIEW.recommendations.becauseName },
  forYou: { id: 'home-for-you', label: DISCOVER_VIEW.recommendations.forYouTitle, navLabel: DISCOVER_VIEW.recommendations.forYouTitle },
  people: { id: 'home-people', label: PEOPLE.shelf.title, navLabel: PEOPLE.shelf.title },
  hot: { id: 'home-hot', label: 'Hot Right Now', navLabel: 'Hot Right Now' },
  weekly: { id: 'home-weekly', label: 'Top 20 This Week', navLabel: 'Top 20 This Week' },
  streaming: { id: 'home-streaming', label: DISCOVER_VIEW.nowOnStreamingTitle, navLabel: DISCOVER_VIEW.nowOnStreamingTitle },
  anticipated: { id: 'home-anticipated', label: DISCOVER_VIEW.mostAnticipatedTitle, navLabel: DISCOVER_VIEW.mostAnticipatedTitle },
  platforms: { id: 'home-platforms', label: 'Top 10 by Platform', navLabel: 'Top 10 By Platform' },
};

export function HomePageNav({ sections }) {
  const [activeId, setActiveId] = useState(sections[0]?.id);
  const currentId = sections.some(section => section.id === activeId) ? activeId : sections[0]?.id;

  useEffect(() => {
    const nodes = sections.map(section => document.getElementById(section.id)).filter(Boolean);
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveId(visible[0].target.id);
    }, { rootMargin: '-15% 0px -65% 0px' });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [sections]);

  if (!sections.length) return null;
  const goTo = (id) => {
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="hist-card home-page-nav" aria-label="Jump to">
      <div className="home-page-nav-head">
        <h2 className="home-page-nav-title">Jump to</h2>
      </div>
      <div className="home-page-nav-list">
        {sections.map(section => (
          <button key={section.id} type="button" className={`home-page-nav-row${currentId === section.id ? ' active' : ''}`} onClick={() => goTo(section.id)}>
            <span>{section.navLabel}</span>
            <span className="home-page-nav-chev" aria-hidden="true"><IconChevronRight /></span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/* The Home and New Releases header row. Search lives in the
   sidebar (and the phone header's icon), which opens the same palette, so the
   row carries no second search box. The grouped filter is retained only as
   the mobile bottom sheet; the desktop trigger is hidden. */
export function DiscoverToolbar({ typeFilters, setTypeFilters, genreFilters, setGenreFilters, genres = [] }) {
  return (
    <div className="page-toolbar">
      <div className="home-toolbar-actions">
        <GroupedFilterMenu
          mobileControls
          ariaLabel="Filter discover"
          groups={[
            {
              heading: MEDIA.typeHeading,
              allLabel: MEDIA.allTypes,
              options: TYPE_ROWS,
              value: typeFilters,
              onChange: setTypeFilters,
              defaultValue: ALL_TYPES,
            },
            {
              heading: MEDIA.genreHeading,
              allLabel: MEDIA.allGenres,
              columns: 2,
              options: genres.map(genre => ({ id: genre.id, label: genre.name })),
              value: genreFilters,
              onChange: setGenreFilters,
            },
          ]}
        />
      </div>
    </div>
  );
}

function HomeUpcomingRow({ event, todayStr, openPanel }) {
  const art = useUserArtwork();
  const image = posterUrl(displayPosterPath(art.apply(event.item)), 'w92');
  const date = getCalendarRelativeLabel(event.date, todayStr);
  const meta = [event.label, date, event.item?.network_name].filter(Boolean).join(' · ');
  return (
    <button type="button" className="home-up-next-row" onClick={() => openPanel(event.item?.tmdb_id, 'tv')}>
      <span className="home-up-next-poster">{image && <img src={image} alt="" />}</span>
      <span className="home-up-next-copy"><strong>{event.item?.title}</strong><span>{meta}</span></span>
      <span className="home-up-next-chev" aria-hidden="true"><IconChevronRight /></span>
    </button>
  );
}

function HomeOfflineIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M18.5 18H8a5 5 0 0 1-1.7-9.7M8.6 4.2A7 7 0 0 1 18 10.7 4 4 0 0 1 21 15" /></svg>;
}

function HomeAlertIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" /></svg>;
}

function HomeRefreshIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8M21 3v5h-5" /></svg>;
}

function HomePersonalCard({ state, refreshing, retry, upNext, todayStr, openPanel, openSearch }) {
  if (state === 'loading') {
    return (
      <section className="hist-card home-personal-card home-personal-card--loading" aria-label="Loading upcoming episodes">
        <span className="home-personal-skeleton home-personal-skeleton--icon" aria-hidden="true" />
        <span className="home-personal-skeleton home-personal-skeleton--title" aria-hidden="true" />
        <span className="home-personal-skeleton home-personal-skeleton--body" aria-hidden="true" />
        <span className="home-personal-skeleton home-personal-skeleton--action" aria-hidden="true" />
      </section>
    );
  }
  if (state === 'offline' || state === 'error') {
    const offline = state === 'offline';
    return (
      <section className="hist-card home-personal-card home-personal-card--compact">
        <span className="home-personal-icon" aria-hidden="true">{offline ? <HomeOfflineIcon /> : <HomeAlertIcon />}</span>
        <div className="hist-card-body">
          <h2 className="hist-card-title">{offline ? DISCOVER_VIEW.offline : DISCOVER_VIEW.loadError}</h2>
          <p className="hist-card-note">{offline ? DISCOVER_VIEW.offlineBody : DISCOVER_VIEW.loadErrorBody}</p>
        </div>
        <button type="button" className="home-personal-action" onClick={retry}><span>{DISCOVER_VIEW.retry}</span><HomeRefreshIcon /></button>
      </section>
    );
  }
  if (state === 'up-next') {
    return (
      <section className="hist-card home-personal-card">
        <div className="hist-card-head"><h2 className="hist-card-title">{DISCOVER_VIEW.upNext}</h2>{refreshing && <span className="home-personal-status">{DISCOVER_VIEW.refreshing}</span>}</div>
        <div className="home-up-next-list">{upNext.map(event => <HomeUpcomingRow key={`${event.item?.tmdb_id}:${event.date}:${event.label}`} event={event} todayStr={todayStr} openPanel={openPanel} />)}</div>
      </section>
    );
  }
  const start = state === 'start';
  return (
    <section className="hist-card home-personal-card">
      <span className="home-personal-icon" aria-hidden="true">{start ? '+' : <IconCalendar />}</span>
      <div className="hist-card-body"><h2 className="hist-card-title">{start ? DISCOVER_VIEW.startHere : DISCOVER_VIEW.nothingUpcoming}</h2><p className="hist-card-note">{start ? DISCOVER_VIEW.startHereBody : DISCOVER_VIEW.nothingUpcomingBody}</p></div>
      <button type="button" className="home-personal-action" onClick={openSearch}><span>{DISCOVER_VIEW.findAiringShow}</span><IconChevronRight /></button>
    </section>
  );
}

function OnThisDayCard({ item, openPanel }) {
  const art = useUserArtwork();
  if (!item) return null;
  const image = posterUrl(displayPosterPath(art.apply(item)), 'w185');
  return (
    <section className="hist-card home-on-this-day">
      <span className="hist-card-label">{DISCOVER_VIEW.onThisDay}</span>
      <button type="button" className="home-on-this-day-hit" onClick={() => openPanel(item.id, item.media_type || 'movie')}>
        <span className="home-on-this-day-poster">{image && <img src={image} alt="" />}</span>
        <span className="home-on-this-day-copy"><strong>{item.title || item.name}</strong>{item.archive_year && <span>{DISCOVER_VIEW.releasedThisDay(item.archive_year)}</span>}</span>
        <span className="home-up-next-chev" aria-hidden="true"><IconChevronRight /></span>
      </button>
    </section>
  );
}

// The Top 20 rows tier their ranks: accent for #1, secondary for the rest of
// the podium, muted beyond that.
function rankBadgeClass(rank) {
  if (rank === 1) return '';
  if (rank <= 3)  return ' rank-top3';
  return ' rank-rest';
}

/* ── Poster card with optional rank numeral ──
   Fav/Save stay real, always-visible buttons anchored to .media-card
   (position:relative) rather than nested inside the "view details" button,
   so no control ends up nested inside another one. A ranked card wraps its
   poster in the frame that cuts the numeral (.rank-cut in app.css); the
   numeral comes after the poster so it is drawn on the artwork. */
export function RankedCard({ item, rank, showRank = true, showMeta = true, openPanel, watchlist, source }) {
  const art = useUserArtwork();
  const title = item.title || item.name;
  const img   = posterUrl(displayPosterPath(art.apply(item)), 'w185');
  const type  = item.media_type || 'movie';
  const openDetails = () => openPanel(item.id, type, source);
  const poster = (
    <div className="media-card-img">
      {img
        ? <img src={img} alt={title} loading="lazy" />
        : <div className="media-card-img-placeholder" />
      }
    </div>
  );
  return (
    <div className={`media-card${showRank ? ' media-card--ranked' : ''}`}>
      <button type="button" className="media-card-hit interactive-surface" onClick={openDetails} aria-label={`View details for ${title}`}>
        {showRank
          ? (
            <div className="rank-cut-frame">
              {poster}
              <span className="rank-cut">{rank}</span>
            </div>
          )
          : poster
        }
        <div className="media-card-title">{title}</div>
        {showMeta && <div className="media-card-meta">{cardMetaLine(item)}</div>}
      </button>
      <FavoriteButton item={item} />
      <SaveButton item={item} watchlist={watchlist} />
    </div>
  );
}

/* ── Hero card (featured title) ── */
// Budget for the featured synopsis; clampToSentences drops whole sentences to fit.
const HERO_SYNOPSIS_MAX_CHARS = 200;
function HeroCard({ item, openPanel, watchlist, badge = 'Trending #1' }) {
  const art = useUserArtwork();
  const { favorites, profile } = useApp();
  const fw       = favoriteWords(profile?.region);
  const [hovered, setHovered] = useState(false);
  const title    = item.title || item.name;
  const backdrop = backdropUrl(displayBackdropPath(art.apply(item)), 'w780');
  const type     = item.media_type || 'movie';
  const yearsAgo = item.anniversary_years;
  const archiveYear = item.archive_year;
  const note     = yearsAgo ? `${yearsAgo} years ago today` : archiveYear ? MEDIA.fromTheArchive : null;
  const year     = yearsAgo
    ? String(new Date().getFullYear() - yearsAgo)
    : archiveYear
      ? String(archiveYear)
    : (item.release_date || item.first_air_date || '').slice(0, 4);
  const synopsis = clampToSentences(item.overview, HERO_SYNOPSIS_MAX_CHARS);
  const saved    = watchlist.isInList(item.id);
  const openDetails = () => openPanel(item.id, type);

  return (
    <div
      className="discover-hero"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button type="button" className="discover-hero-hit interactive-surface" onClick={openDetails} aria-label={`View details for ${title}`}>
        {backdrop
          ? <img className="discover-hero-backdrop" src={backdrop} alt="" aria-hidden="true" />
          : <div className="discover-hero-backdrop discover-hero-backdrop-fallback" />
        }
        <div className="discover-hero-overlay">
          <span className="discover-hero-badge">{badge}</span>
          <h2 className="discover-hero-title">{title}</h2>
          {year && (
            <p className="discover-hero-meta">
              {cardMetaLine(item, { year, note })}
            </p>
          )}
          {synopsis && <p className="discover-hero-synopsis">{synopsis}</p>}
        </div>
      </button>

      {/* Real buttons, siblings of the hit area above (never nested in it).
          Desktop single-card layout only; the card itself is the tap target
          everywhere else. */}
      <div className="discover-hero-actions">
        <button type="button" className="discover-hero-action discover-hero-action-secondary" onClick={openDetails}>
          View details
        </button>
        <button
          type="button"
          className="discover-hero-action discover-hero-action-primary"
          onClick={() => watchlist.toggle({ ...item })}
          disabled={watchlist.loading}
          aria-pressed={saved}
        >
          <Icon name="bookmark" filled={saved} size={14} />
          {saved ? MEDIA_PANEL.inWatchlist : MEDIA.saveToWatchlist}
        </button>
      </div>

      {/* Corner action buttons. Each shows itself when its own state is
          active; the inactive one waits for hover, so an active favourite
          doesn't display an empty bookmark next to it. */}
      <div className={`discover-hero-corner-btns${hovered ? ' visible' : ''}`}>
        <FavoriteButton variant="hero" item={{ ...item, media_type: type }} favorites={favorites} favWords={fw} style={{ position: 'absolute', top: 10, left: 10 }} />
        <SaveButton variant="hero" item={item} watchlist={watchlist} style={{ position: 'absolute', top: 10, right: 10 }} />
      </div>
    </div>
  );
}

/* ── Chart card ──
   One cell of the Top 20 rail: rank, poster, title, meta. The rail lays these
   out two rows deep and scrolls sideways, so each card is a fixed width and
   the title gets the room the old full-width list row never gave it. */
function ChartCard({ item, rank, openPanel, watchlist, favorites, region }) {
  const art = useUserArtwork();
  const fw    = favoriteWords(region);
  const title = item.title || item.name;
  const img   = posterUrl(displayPosterPath(art.apply(item)), 'w154');
  const type  = item.media_type || 'movie';
  const id    = item.id;
  const openDetails = () => openPanel(id, type);

  return (
    <div className="discover-chart-card">
      <button type="button" className="list-row-hit interactive-surface" onClick={openDetails} aria-label={`View details for ${title}`}>
        <span className={`discover-chart-rank${rankBadgeClass(rank)}`}>{rank}</span>
        <div className="discover-chart-poster">
          {img
            ? <img src={img} alt="" loading="lazy" />
            : <div className="discover-chart-poster-placeholder" />
          }
        </div>
        <div className="discover-chart-info">
          <div className="discover-chart-title">{title}</div>
          <div className="discover-chart-meta">{cardMetaLine(item)}</div>
        </div>
      </button>
      <div className="discover-chart-actions search-row-actions">
        <FavoriteButton variant="row" item={{ ...item, id, media_type: type }} favorites={favorites} favWords={fw} />
        <SaveButton variant="row" item={{ ...item, id, media_type: type }} watchlist={watchlist} />
      </div>
    </div>
  );
}

/* ── Top 20 ── a two-row rail. */
function WeeklyChart({ id, items, openPanel, watchlist }) {
  const { favorites, profile } = useApp();
  const rail = useRailScroll();
  return (
    <section id={id} className="discover-section">
      <DiscoverSectionHeader
        title="Top 20 This Week"
        subtitle="Global ranking"
        headerRight={<RailArrows rail={rail} />}
      />
      <ScrollRail rail={rail} className="discover-chart-rail">
        {items.map((item, i) => (
          <ChartCard key={`${item.media_type}-${item.id}`} item={item} rank={i + 1} openPanel={openPanel} watchlist={watchlist} favorites={favorites} region={profile?.region} />
        ))}
      </ScrollRail>
    </section>
  );
}

/* ── One platform's official chart ──
   The logo is the row label; a Movies / TV switch sits under it when both
   lists apply. A platform with no synced rows still gets a row — a compact
   one that says the chart is unavailable rather than disappearing, so the
   section's shape does not change from week to week with the sync's fortunes. */
/* The hook only resolves a logo for platforms that have rows; every row here
   shows its logo, so look them all up once from TMDB's provider list. */
function usePlatformLogos() {
  const [logos, setLogos] = useState({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await tmdb.getWatchProvidersForRegion('tv', getTmdbRegion());
        const providers = res?.results || [];
        const found = {};
        for (const def of OFFICIAL_PLATFORMS) {
          const p = providers.find(p => def.match.test(p.provider_name || ''));
          if (p?.logo_path) found[def.key] = p.logo_path;
        }
        if (!cancelled) setLogos(found);
      } catch { /* logos are optional; the initial stands in */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return logos;
}

function PlatformRow({ def, chart, logoPath, openPanel, watchlist, typeFilters, genreFilters }) {
  const showMovies = typeFilters.includes('movie') || typeFilters.includes('cinema');
  const showTv     = typeFilters.includes('tv');
  const movies = chart && showMovies ? filterByGenre(chart.movies, genreFilters) : [];
  const tv     = chart && showTv     ? filterByGenre(chart.tv, genreFilters)     : [];
  const [type, setType] = useState('movie');
  const rail = useRailScroll();

  const lists = [
    movies.length ? { id: 'movie', label: MEDIA.movies, items: movies } : null,
    tv.length     ? { id: 'tv',    label: MEDIA.tv,     items: tv }     : null,
  ].filter(Boolean);
  const active = lists.find(l => l.id === type) ?? lists[0];

  return (
    <div className={`discover-plat-row${active ? '' : ' discover-plat-row--empty'}`}>
      <div className="discover-plat-label">
        <div className="discover-plat-ident">
          {(logoPath || chart?.logo_path)
            ? <img className="discover-plat-logo" src={`https://image.tmdb.org/t/p/w45${logoPath || chart.logo_path}`} alt="" />
            : <span className="discover-plat-logo discover-plat-logo-fallback" aria-hidden="true">{def.name.slice(0, 1)}</span>
          }
          <span className="discover-plat-name">{def.name}</span>
        </div>
        {!active && <span className="discover-plat-note">{MEDIA.chartUnavailable}</span>}
        {lists.length > 1 && (
          <div className="discover-plat-switch" role="tablist" aria-label={`${def.name} chart`}>
            {lists.map(l => (
              <button
                key={l.id}
                type="button"
                role="tab"
                aria-selected={l.id === active.id}
                className={`discover-plat-switch-btn${l.id === active.id ? ' active' : ''}`}
                onClick={() => setType(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
        {active && <div className="discover-plat-arrows"><RailArrows rail={rail} /></div>}
      </div>

      {active && (
        <ScrollRail rail={rail} className="discover-plat-rail">
          {active.items.slice(0, 10).map((item, i) => (
            <RankedCard key={`${item.id}-${i}`} item={item} rank={item._rank ?? i + 1} showMeta={false} openPanel={openPanel} watchlist={watchlist} />
          ))}
        </ScrollRail>
      )}
    </div>
  );
}

function PlatformCharts({ id, platformList, openPanel, watchlist, typeFilters, genreFilters }) {
  const byKey = Object.fromEntries(platformList.map(p => [p.key, p]));
  const logos = usePlatformLogos();
  return (
    <section id={id} className="discover-section">
      <DiscoverSectionHeader title="Top 10 by Platform" subtitle="Official charts" />
      <div className="discover-plat-list">
        {OFFICIAL_PLATFORMS.map(def => (
          <PlatformRow key={def.key} def={def} chart={byKey[def.key]} logoPath={logos[def.key]} openPanel={openPanel} watchlist={watchlist} typeFilters={typeFilters} genreFilters={genreFilters} />
        ))}
      </div>
    </section>
  );
}

/* ── Your people ── board R2-4b, or the 4c invite for someone who follows
   nobody yet. Following is Premium, but what someone already follows (a
   lapsed member's follows stay stored) shows for everyone, as long as there
   is something new from them (Savannah, 16 Nov 2026). The invite, which asks
   them to follow people, stays Premium. Placed after Top 20 This Week. */
const byWatchedDesc = (a, b) => String(b.watched_at ?? '').localeCompare(String(a.watched_at ?? ''));

function useYourPeopleShelf() {
  const { user, profile } = useApp();
  const premium = usePremium(profile);
  const people = usePeopleFollows(user?.id);
  const history = useHistory(premium.isPremium && !people.loading && people.follows.length === 0 ? user?.id : null);
  const today = localDateStr();
  const ids = useMemo(() => people.follows.map(f => f.tmdb_person_id), [people.follows]);
  const { rows } = usePeopleFeed(ids, { today, version: people.feedVersion });
  const items = useMemo(() => feedItems(rows, { region: profile?.region || DEFAULT_REGION, today }).slice(0, 20), [rows, profile?.region, today]);
  const logged = useMemo(() => [...history.entries].sort(byWatchedDesc), [history.entries]);
  const followed = useMemo(() => new Set(ids), [ids]);
  const { suggestions } = usePeopleSuggestions(logged, (type, id) => (type === 'tv' ? tmdb.getTVDetails(id) : tmdb.getMovieDetails(id)), {
    enabled: premium.isPremium && !people.loading && people.follows.length === 0,
    exclude: followed,
  });
  if (people.loading) return { visible: false };
  if (people.follows.length === 0) {
    if (!premium.isPremium) return { visible: false };
    return { visible: suggestions.length > 0, invite: true, suggestions, today };
  }
  // A Free viewer sees the shelf only when it has titles; Premium keeps the
  // "nothing new" line so the shelf they set up does not vanish.
  return { visible: premium.isPremium || items.length > 0, invite: false, items, count: people.follows.length, today };
}

function YourPeopleSection({ shelf, openPanel }) {
  const navigate = useNavigate();
  const follow = useFollowPerson();
  if (shelf.invite) {
    return (
      <section id={HOME_SECTION.people.id} className="discover-section">
        <DiscoverSectionHeader title={HOME_SECTION.people.label} subtitle={PEOPLE.shelf.inviteSubtitle} />
        <PeopleInvite suggestions={shelf.suggestions} isFollowing={follow.isFollowing} busyId={follow.busyId} onToggle={follow.toggle} onOpenPerson={id => openPanel(id, 'person', 'home_people')} />
        {follow.sheet}
      </section>
    );
  }
  return (
    <RailSection
      id={HOME_SECTION.people.id}
      title={HOME_SECTION.people.label}
      subtitle={PEOPLE.shelf.subtitle(shelf.count)}
      headerRight={<button type="button" className="discover-see-all" onClick={() => navigate('/your-people')}>{PEOPLE.shelf.seeAll}</button>}
    >
      {shelf.items.length === 0
        ? <p className="discover-section-sub people-shelf-empty">{PEOPLE.shelf.empty}</p>
        : shelf.items.map(item => (
          <PeopleShelfCard key={item.key} item={item} today={shelf.today} onOpen={() => openPanel(item.tmdbId, item.mediaType, 'your_people')} />
        ))}
    </RailSection>
  );
}

/* ── Home ── */
function DiscoverContent({ openPanel, openSearch, watchlist, typeFilters, setTypeFilters, genreFilters, setGenreFilters, genres, personalState, personalRefreshing, retryPersonal, upNext, todayStr, continueItems = [], firstRun = false, homeLayout }) {
  const peopleShelf = useYourPeopleShelf();
  const [openCurated, setOpenCurated] = useState(null);
  const [customizing, setCustomizing] = useState(false);
  const [pinUpgrade, setPinUpgrade] = useState(false);
  const { user, profile, watching, customLists, uiPrefs } = useApp();
  const premium = usePremium(profile);
  // Pinned shelves (Premium): resolved against what the viewer has right now.
  const pinned = usePinnedShelves({
    userId: user?.id,
    layout: homeLayout.layout,
    premium: premium.isPremium,
    watchlistItems: watchlist?.items ?? [],
    watchingItems: watching?.items ?? [],
    lists: customLists?.lists ?? [],
    region: profile?.region || DEFAULT_REGION,
    today: todayStr,
  });
  const { data, loading } = useDiscover();
  // Hard-coded official-chart platforms: the same set for everyone, unrelated
  // to the user's own streaming selections. The hook returns only platforms
  // with synced rows; PlatformCharts fills in the rest as unavailable.
  const platformList = usePlatformCharts();
  // Because you watched / Recommended for you: TMDB's per-title
  // recommendations ranked against this viewer's history (recommendations.js).
  const history = useHistory(user?.id);
  const recs = useRecommendationShelves({
    history: history.entries,
    watchlist: watchlist?.items,
    watching: watching?.items,
    fetchDetails: getTitleDetails,
    today: todayStr,
    enabled: !history.loading,
    userId: user?.id,
    storage: RECS_STORAGE,
  });
  const becauseCount = recs.because?.items.length ?? 0;
  const forYouCount = recs.forYou.length;
  useEffect(() => {
    if (becauseCount === 0) return;
    oncePerSession('recommendations_viewed_because', () => {
      track(EVENTS.RECOMMENDATIONS_VIEWED, { shelf: 'because', item_count: becauseCount });
    });
  }, [becauseCount]);
  useEffect(() => {
    if (forYouCount === 0) return;
    oncePerSession('recommendations_viewed_for_you', () => {
      track(EVENTS.RECOMMENDATIONS_VIEWED, { shelf: 'for_you', item_count: forYouCount });
    });
  }, [forYouCount]);
  const savedShown = !loading && firstRun && !watchlist?.loading
    ? Math.min(watchlist?.items?.length ?? 0, 20)
    : 0;
  useEffect(() => {
    if (savedShown === 0) return;
    oncePerSession('saved_to_watch_viewed', () => {
      track(EVENTS.SAVED_TO_WATCH_VIEWED, { item_count: savedShown, first_run: true });
    });
  }, [savedShown]);
  if (loading) {
    return <LoadingSpinner />;
  }

  const applyFilters = (items) => filterByGenre(filterByType(items, typeFilters), genreFilters);
  const hero              = selectHomeHero(data.heroByType, typeFilters);
  const onThisDay        = data.onThisDay;
  // The list card follows the type filter like the hero does: a TV-only list has nothing to show under Movies.
  const featuredList = featuredCuratedList();
  const curated = featuredList && filterByType(featuredList.entries, typeFilters).length > 0 ? featuredList : null;
  const showPicks = (hero || curated) && genreFilters.length === 0;
  // Picks takes turns: the trending hero, the plot list, then the other
  // trending leaders the hero is not already. Only the hero shows its own badge copy.
  const picksBadges = { tv: DISCOVER_VIEW.picks.trendingTv, movie: DISCOVER_VIEW.picks.trendingMovie, cinema: MEDIA.inCinemas };
  const seenPicks = new Set(hero ? [`${hero.media_type}-${hero.id}`] : []);
  const otherHeroes = ['tv', 'movie', 'cinema'].map(type => ({ type, item: filterByType([data.heroByType?.[type]].filter(Boolean), typeFilters)[0] }))
    .filter(({ item }) => item && !seenPicks.has(`${item.media_type}-${item.id}`) && seenPicks.add(`${item.media_type}-${item.id}`));
  const pickSlides = [
    hero && <HeroCard key="hero" item={hero} openPanel={openPanel} watchlist={watchlist} />,
    curated && <CuratedListCard key={curated.id} curated={curated} onOpen={() => setOpenCurated(curated)} />,
    ...otherHeroes.map(({ type, item }) => <HeroCard key={`${type}-${item.id}`} item={item} openPanel={openPanel} watchlist={watchlist} badge={picksBadges[type]} />),
  ].filter(Boolean);
  // Each title shows once on Home: a shelf drops what a shelf above it in the
  // viewer's order already showed. Picks and the Top 20 chart keep every
  // card (a chart's numbers would lie otherwise) but still count.
  const shown = dedupeHomeShelves(visibleHomeSections(homeLayout.layout, homeLayout.layout.order), {
    picks: showPicks ? [hero, ...otherHeroes.map(({ item }) => item)].filter(Boolean) : [],
    because: applyFilters(recs.because?.items ?? []),
    forYou: applyFilters(recs.forYou),
    hot: applyFilters(data.hotRail),
    weekly: applyFilters(data.weekly),
    streaming: applyFilters(data.streamingMovies),
    anticipated: applyFilters(data.anticipatedMovies),
  }, { whole: ['picks', 'weekly'] });
  const becauseItems = shown.because ?? [];
  const forYouItems = shown.forYou ?? [];
  const hotRail = shown.hot ?? [];
  const weekly = shown.weekly ?? [];
  const streamingMovies = shown.streaming ?? [];
  const anticipatedMovies = shown.anticipated ?? [];
  const hasContent = hero || hotRail.length > 0 || weekly.length > 0 || streamingMovies.length > 0 || anticipatedMovies.length > 0;
  const savedItems = firstRun ? (watchlist?.items ?? []).slice(0, 20).map(row => ({ id: row.tmdb_id, media_type: row.media_type, title: row.title, poster_path: row.poster_path })) : [];
  // Which shelves have content right now; the viewer's layout then decides
  // the order and drops the ones they hid. The first-run Saved shelf stays
  // ahead of everything and is not part of the layout.
  const available = {
    picks: showPicks,
    continue: continueItems.length > 0,
    because: becauseItems.length > 0,
    forYou: forYouItems.length > 0,
    hot: hotRail.length > 0,
    weekly: weekly.length > 0,
    people: peopleShelf.visible,
    streaming: streamingMovies.length > 0,
    anticipated: anticipatedMovies.length > 0,
    platforms: platformList.length > 0,
  };
  const orderedIds = visibleHomeSections(homeLayout.layout, Object.keys(available).filter(id => available[id]));
  const pinId = (shelf) => `home-pin-${shelf.key.replace(':', '-')}`;
  const pageSections = [
    savedItems.length > 0 ? HOME_SECTION.saved : null,
    ...pinned.shelves.map(shelf => ({ id: pinId(shelf), label: shelf.label, navLabel: shelf.label })),
    ...orderedIds.map(id => HOME_SECTION[id]),
  ].filter(Boolean);
  const customizable = homeLayout.layout.order.map(id => ({ id, label: HOME_SECTION[id].navLabel }));

  if (!hasContent) {
    return (
      <EmptyState className="empty-state--below" title="Discovery unavailable" body="Trending and platform picks could not load right now. Try again shortly." />
    );
  }

  const renderSection = {
    picks: () => (
      <section key="picks" id={HOME_SECTION.picks.id} className="discover-section discover-featured-section">
        <DiscoverSectionHeader title={<><PlotLogo inherit />&rsquo;s Picks</>} />
        {pickSlides.length > 1
          ? <PicksCarousel>{pickSlides}</PicksCarousel>
          : <div className="discover-hero-row">{pickSlides}</div>}
      </section>
    ),
    continue: () => (
      <RailSection key="continue" id={HOME_SECTION.continue.id} title={HOME_SECTION.continue.label} subtitle={PEOPLE.continueWatching.subtitle}>
        {continueItems.map(item => (
          <ContinueCard key={item.tmdbId} item={item} onOpen={() => openPanel(item.tmdbId, 'tv', 'continue_watching')} />
        ))}
      </RailSection>
    ),
    because: () => (
      <RailSection key="because" id={HOME_SECTION.because.id} title={DISCOVER_VIEW.recommendations.becauseTitle(recs.because.seed.title)}>
        {becauseItems.map(item => (
          <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} openPanel={openPanel} watchlist={watchlist} source="because_you_watched" />
        ))}
      </RailSection>
    ),
    forYou: () => (
      <RailSection key="forYou" id={HOME_SECTION.forYou.id} title={HOME_SECTION.forYou.label} subtitle={DISCOVER_VIEW.recommendations.forYouSubtitle}>
        {forYouItems.map(item => (
          <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} openPanel={openPanel} watchlist={watchlist} source="recommended_for_you" />
        ))}
      </RailSection>
    ),
    hot: () => (
      <RailSection key="hot" id={HOME_SECTION.hot.id} title={HOME_SECTION.hot.label} subtitle="Trending today">
        {hotRail.map(item => (
          <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} openPanel={openPanel} watchlist={watchlist} />
        ))}
      </RailSection>
    ),
    weekly: () => <WeeklyChart key="weekly" id={HOME_SECTION.weekly.id} items={weekly} openPanel={openPanel} watchlist={watchlist} />,
    people: () => <YourPeopleSection key="people" shelf={peopleShelf} openPanel={openPanel} />,
    streaming: () => (
      <RailSection key="streaming" id={HOME_SECTION.streaming.id} title={HOME_SECTION.streaming.label} subtitle={DISCOVER_VIEW.nowOnStreamingSubtitle}>
        {streamingMovies.map(item => (
          <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} openPanel={openPanel} watchlist={watchlist} />
        ))}
      </RailSection>
    ),
    anticipated: () => (
      <RailSection key="anticipated" id={HOME_SECTION.anticipated.id} title={HOME_SECTION.anticipated.label} subtitle={DISCOVER_VIEW.mostAnticipatedSubtitle}>
        {anticipatedMovies.map(item => (
          <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} openPanel={openPanel} watchlist={watchlist} />
        ))}
      </RailSection>
    ),
    platforms: () => <PlatformCharts key="platforms" id={HOME_SECTION.platforms.id} platformList={platformList} openPanel={openPanel} watchlist={watchlist} typeFilters={typeFilters} genreFilters={genreFilters} />,
  };

  return (
    <div className="home-layout cal-body">
      <aside className="cal-side home-side">
        <HomePersonalCard state={personalState} refreshing={personalRefreshing} retry={retryPersonal} upNext={upNext} todayStr={todayStr} openPanel={openPanel} openSearch={openSearch} />
        <OnThisDayCard item={onThisDay} openPanel={openPanel} />
        <HomePageNav sections={pageSections} />
        <SideFilters className="home-filter-card" typeFilters={typeFilters} setTypeFilters={setTypeFilters} genreFilters={genreFilters} setGenreFilters={setGenreFilters} genres={genres} />
      </aside>
      <div className="discover-sections home-stream">
      {savedItems.length > 0 && (
        <RailSection id={HOME_SECTION.saved.id} title={HOME_SECTION.saved.label}>
          {savedItems.map(item => (
            <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} showMeta={false} openPanel={openPanel} watchlist={watchlist} />
          ))}
        </RailSection>
      )}
      {pinned.shelves.map(shelf => (
        <RailSection key={shelf.key} id={pinId(shelf)} title={shelf.label}>
          {shelf.kind === 'person'
            ? (shelf.people.length > 0
              ? shelf.people.map(item => <PeopleShelfCard key={item.key} item={item} today={todayStr} onOpen={() => openPanel(item.tmdbId, item.mediaType)} />)
              : <p className="discover-section-sub people-shelf-empty">{DISCOVER_VIEW.customize.pinnedPersonEmpty}</p>)
            : (shelf.titles.length > 0
              ? shelf.titles.map(item => <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} showMeta={false} openPanel={openPanel} watchlist={watchlist} />)
              : <p className="discover-section-sub people-shelf-empty">{DISCOVER_VIEW.customize.pinnedListEmpty}</p>)}
        </RailSection>
      ))}
      {orderedIds.map(id => renderSection[id]())}
      {/* Customize sits at the foot of the page at every width, as on every
          page that has one (Savannah, 12 Nov 2026). */}
      <div className="page-customize-foot"><button type="button" className="home-page-nav-customize" onClick={() => setCustomizing(true)}>{DISCOVER_VIEW.customize.action}</button></div>
      </div>
      {customizing && (
        <HomeLayoutSheet
          sections={customizable}
          layout={homeLayout.layout}
          isDefault={homeLayout.isDefault}
          error={homeLayout.error}
          onMove={homeLayout.move}
          onNudge={homeLayout.nudge}
          onToggle={(id) => homeLayout.setVisible(id)}
          onReset={homeLayout.reset}
          onClose={() => setCustomizing(false)}
          prefs={uiPrefs.prefs}
          onDensity={uiPrefs.chooseDensity}
          onCardStyle={uiPrefs.chooseCardStyle}
          premium={premium.isPremium}
          pins={homeLayout.layout.pins.map(pin => ({
            key: `${pin.kind}:${pin.id}`,
            pin,
            label: pinLabel(pin, { lists: customLists?.lists ?? [], follows: pinned.follows }) ?? DISCOVER_VIEW.customize.pinGone,
          }))}
          pinGroups={pinOptions({ layout: homeLayout.layout, lists: customLists?.lists ?? [], follows: pinned.follows })}
          onPin={homeLayout.pin}
          onUnpin={homeLayout.unpin}
          onNudgePin={homeLayout.nudgePin}
          onUpgrade={() => setPinUpgrade(true)}
        />
      )}
      {pinUpgrade && <UpgradeSheet reason="pins" onClose={() => setPinUpgrade(false)} />}
      {openCurated && <CuratedListDialog curated={openCurated} onClose={() => setOpenCurated(null)} onOpenTitle={openPanel} />}
    </div>
  );
}

const getTVDetails = (id) => tmdb.getTVDetails(id);
// The day's recommendation shelves are kept here, so Home asks TMDB once a day.
const RECS_STORAGE = { getItem: (k) => readStorage(k), setItem: writeStorage };
const getTitleDetails = (type, id) => (type === 'tv' ? tmdb.getTVDetails(id) : tmdb.getMovieDetails(id));

/* ═══════════════════════════════════════
   DiscoverView — Home
═══════════════════════════════════════ */
export default function DiscoverView() {
  const app = useApp();
  const { genres } = useGenres();
  // A genre chip on a title opens Home as /home?type=tv&genre=18.
  const [searchParams] = useSearchParams();
  const [start] = useState(() => parseGenreBrowse(searchParams));
  const [typeFilters,  setTypeFilters]  = useState(start.typeFilters ?? ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState(start.genreFilters ?? []);

  const { openPanel, openSearch, watchlist, watching, reminders, profile, user, refreshProfile, uiPrefs } = app;
  const homeLayout = useHomeLayout({ userId: user?.id, saved: profile?.home_layout, onPersisted: refreshProfile });
  const firstRun = useFirstRun();
  const online = useOnlineStatus();
  const todayStr = localDateStr();
  const listsReady = !watchlist.loading && !watching.loading && !reminders.loading;
  const { events, loading: calendarLoading, refreshing: calendarRefreshing, error: calendarError, retry: retryCalendar } = useCalendar(watchlist.items, watching.items, watching.fetchSeason, reminders.reminders, { ready: listsReady });
  useEffect(() => {
    if (online && listsReady) retryCalendar();
  }, [listsReady, online, retryCalendar]);
  // Continue watching is free for everyone; a show on it is left out of Up next.
  const { items: continueItems } = useContinueWatching(watching.items, getTVDetails);
  const continueIds = useMemo(() => new Set(continueItems.map(item => item.tmdbId)), [continueItems]);
  const upNext = useMemo(() => selectHomeUpNext(events, todayStr, 3, continueIds), [events, todayStr, continueIds]);
  const personalState = homePersonalState({ offline: !online, loading: calendarLoading || !listsReady, error: calendarError, upNext, savedCount: watchlist.items.length, watchingCount: watching.items.length });

  return (
    <div className="home-page" data-density={uiPrefs?.prefs.density ?? 'comfy'} data-card-style={uiPrefs?.prefs.cardStyle ?? 'poster'}>
      <DiscoverToolbar
        typeFilters={typeFilters}
        setTypeFilters={setTypeFilters}
        genreFilters={genreFilters}
        setGenreFilters={setGenreFilters}
        genres={genres}
      />
      <HomeTopCards />
      <DiscoverContent
        openPanel={openPanel}
        openSearch={openSearch}
        watchlist={watchlist}
        typeFilters={typeFilters}
        setTypeFilters={setTypeFilters}
        genreFilters={genreFilters}
        setGenreFilters={setGenreFilters}
        genres={genres}
        personalState={personalState}
        personalRefreshing={calendarRefreshing}
        retryPersonal={retryCalendar}
        upNext={upNext}
        todayStr={todayStr}
        continueItems={continueItems}
        firstRun={firstRun}
        homeLayout={homeLayout}
      />
    </div>
  );
}
