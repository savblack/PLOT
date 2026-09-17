import { ALL_TYPES } from '@plot/core/mediaFilters.js';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { posterUrl, backdropUrl } from '../utils/images.js';
import { todayLongLabel } from '../utils/date.js';
import { favoriteWords } from '../utils/spelling.js';
import ScrollRail from './ScrollRail.jsx';
import RailArrows from './RailArrows.jsx';
import { useRailScroll } from '../hooks/useRailScroll.js';
import { useGenres } from '../hooks/useGenres.js';
import { useDiscover } from '../hooks/useDiscover.js';
import { useNewReleases } from '../hooks/useNewReleases.js';
import { usePlatformCharts } from '../hooks/usePlatformCharts.js';
import { OFFICIAL_PLATFORMS } from '@plot/core/usePlatformCharts.js';
import { tmdb, getTmdbRegion } from '@plot/core/tmdb.js';
import { filterByType, filterByGenre } from '../utils/mediaFilters.js';
import { MEDIA } from '../copy/media.js';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import GroupedFilterMenu from './GroupedFilterMenu.jsx';

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
      style={{ paddingLeft: 'var(--gut)', paddingRight: 'var(--gut)', paddingTop: '0.25rem', paddingBottom: '1rem' }}
    >
      {children}
    </ScrollRail>
  );
}

function BingeRail({ rail, children }) {
  return <ScrollRail rail={rail} className="discover-binge-rail">{children}</ScrollRail>;
}

/* The section banner: a serif title, an optional subtitle, and a slot on the
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
export function RailSection({ title, subtitle, sectionClassName = 'discover-section', binge = false, headerRight, children }) {
  const rail = useRailScroll();
  const RailBody = binge ? BingeRail : Rail;

  return (
    <section className={sectionClassName}>
      <DiscoverSectionHeader
        title={title}
        subtitle={subtitle}
        headerRight={<>{headerRight}<RailArrows rail={rail} /></>}
      />
      <RailBody rail={rail}>{children}</RailBody>
    </section>
  );
}

const TYPE_OPTIONS = [
  { id: 'tv',     label: MEDIA.tv     },
  { id: 'cinema', label: MEDIA.cinema },
  { id: 'movie',  label: MEDIA.movies },
];

/* What the filter pill says: "All types · All genres" until something is
   narrowed, then the chosen names (or a count once that gets long). */
function filterSummary(typeFilters, genreFilters, genres) {
  const allTypes = ALL_TYPES.every(t => typeFilters.includes(t));
  const types = allTypes
    ? MEDIA.allTypes
    : TYPE_OPTIONS.filter(o => typeFilters.includes(o.id)).map(o => o.label).join(', ');
  const picked = genres.filter(g => genreFilters.includes(g.id)).map(g => g.name);
  const genreText = picked.length === 0 ? MEDIA.allGenres : picked.length <= 2 ? picked.join(', ') : `${picked.length} genres`;
  return `${types} · ${genreText}`;
}

/* The date and the type + genre filter, in one row. At sidebar widths the row
   is pulled up onto the page heading: the date sits under "Home" and the
   filter pill on the right, so Home does not spend a row on one control.
   Below them it is a plain row under the header. */
export function DiscoverToolbar({ ariaLabel, typeFilters, setTypeFilters, genreFilters, setGenreFilters }) {
  const { genres } = useGenres();
  return (
    <div className="page-toolbar">
      <span className="page-toolbar-date">{todayLongLabel()}</span>
      <GroupedFilterMenu
        mobileControls
        ariaLabel={ariaLabel}
        label={filterSummary(typeFilters, genreFilters, genres)}
        groups={[
          {
            heading: MEDIA.typeHeading, allLabel: MEDIA.allTypes,
            options: TYPE_OPTIONS,
            value: typeFilters,
            onChange: setTypeFilters,
            defaultValue: ALL_TYPES,
          },
          {
            heading: MEDIA.genreHeading, allLabel: MEDIA.allGenres,
            options: genres.map(g => ({ id: g.id, label: g.name })),
            value: genreFilters,
            onChange: setGenreFilters,
          },
        ]}
      />
    </div>
  );
}

/* ── Save button ── */
function SaveBtn({ item, watchlist }) {
  const id    = item.id || item.tmdb_id;
  const saved = watchlist.isInList(id);
  return (
    <button
      className={`card-save-btn${saved ? ' saved' : ''}`}
      onClick={e => { e.stopPropagation(); watchlist.toggle({ ...item, id }); }}
      aria-label={saved ? MEDIA.removeFromList : MEDIA.addToList}
      disabled={watchlist.loading}
    >
      <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
    </button>
  );
}

/* ── Favourite (heart) button — occupies the former type-chip slot ── */
function FavBtn({ item }) {
  const { favorites, profile } = useApp();
  const fw   = favoriteWords(profile?.region);
  const type = item.media_type || 'movie';
  const fav  = favorites.isFavorite(item.id);
  return (
    <button
      className={`card-fav-btn${fav ? ' faved' : ''}`}
      onClick={e => { e.stopPropagation(); favorites.toggleFavorite({ ...item, media_type: type }); }}
      aria-label={fav ? fw.un : fw.noun}
    >
      <svg viewBox="0 0 24 24">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    </button>
  );
}

/* ── Compact "year · type" meta line for poster cards ── */
function cardMeta(item) {
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const type = item.media_type === 'tv' ? MEDIA.tv : item._cinema ? MEDIA.cinema : MEDIA.movie;
  return [year, type].filter(Boolean).join(' · ');
}

// Matches the rank coloring used for the profile's Top 10 lists: gold for #1,
// secondary for the rest of the podium, muted beyond that.
function rankBadgeClass(rank) {
  if (rank === 1) return '';
  if (rank <= 3)  return ' rank-top3';
  return ' rank-rest';
}

/* ── Poster card with optional rank badge ──
   Fav/Save stay real, always-visible buttons anchored to .media-card
   (position:relative) rather than nested inside the "view details" button,
   so no control ends up nested inside another one. */
export function RankedCard({ item, rank, showRank = true, showMeta = true, openPanel, watchlist }) {
  const title = item.title || item.name;
  const img   = posterUrl(item.poster_path, 'w185');
  const type  = item.media_type || 'movie';
  const openDetails = () => openPanel(item.id, type);
  return (
    <div className="media-card">
      <button type="button" className="media-card-hit interactive-surface" onClick={openDetails} aria-label={`View details for ${title}`}>
        <div className="media-card-img">
          {img
            ? <img src={img} alt={title} loading="lazy" />
            : <div className="media-card-img-placeholder" />
          }
          {showRank && <span className={`discover-rank-badge${rankBadgeClass(rank)}`}>{rank}</span>}
        </div>
        <div className="media-card-title">{title}</div>
        {showMeta && <div className="media-card-meta">{cardMeta(item)}</div>}
      </button>
      <FavBtn item={item} />
      <SaveBtn item={item} watchlist={watchlist} />
    </div>
  );
}

function BingeCard({ item, openPanel, watchlist }) {
  const { favorites, profile } = useApp();
  const fw       = favoriteWords(profile?.region);
  const [hovered, setHovered] = useState(false);
  const title    = item.name || item.title;
  const backdrop = backdropUrl(item.backdrop_path, 'w780');
  const poster   = posterUrl(item.poster_path, 'w342');
  const type     = item.media_type || 'tv';
  const year     = (item.first_air_date || item.release_date || '').slice(0, 4);
  const saved    = watchlist.isInList(item.id);
  const fav      = favorites.isFavorite(item.id);
  const openDetails = () => openPanel(item.id, type);

  return (
    <div
      className="discover-binge-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ backgroundImage: `url(${backdrop || poster || ''})` }}
    >
      <button type="button" className="discover-binge-card-hit interactive-surface" onClick={openDetails} aria-label={`View details for ${title}`}>
        <span className="discover-binge-card-shade" />
        <span className="discover-binge-card-copy">
          <span className="discover-binge-card-title">{title}</span>
          <span className="discover-binge-card-meta">
            {year ? `${year} • ` : ''}{type === 'tv' ? MEDIA.tvSeries : MEDIA.movie}
          </span>
        </span>
      </button>

      {/* Corner action buttons. Each shows itself when its own state is
          active; the inactive one waits for hover, so an active favourite
          doesn't display an empty bookmark next to it. */}
      <div className={`discover-hero-corner-btns${hovered ? ' visible' : ''}`}>
        <button
          className={`discover-hero-corner-btn${fav ? ' active' : ''}`}
          style={{ position: 'absolute', top: 10, left: 10 }}
          onClick={() => favorites.toggleFavorite({ ...item, media_type: type })}
          aria-label={fav ? fw.un : fw.noun}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={fav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
        <button
          className={`discover-hero-corner-btn${saved ? ' active' : ''}`}
          style={{ position: 'absolute', top: 10, right: 10 }}
          onClick={() => watchlist.toggle({ ...item })}
          disabled={watchlist.loading}
          aria-label={saved ? MEDIA.removeFromWatchlist : 'Save to watchlist'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── Hero card (featured title) ── */
function HeroCard({ item, openPanel, watchlist, badge = 'Trending #1' }) {
  const { favorites, profile } = useApp();
  const fw       = favoriteWords(profile?.region);
  const [hovered, setHovered] = useState(false);
  const title    = item.title || item.name;
  const backdrop = backdropUrl(item.backdrop_path, 'w780');
  const type     = item.media_type || 'movie';
  const yearsAgo = item.anniversary_years;
  const archiveYear = item.archive_year;
  const note     = yearsAgo ? `${yearsAgo} years ago today` : archiveYear ? MEDIA.fromTheArchive : null;
  const year     = yearsAgo
    ? String(new Date().getFullYear() - yearsAgo)
    : archiveYear
      ? String(archiveYear)
    : (item.release_date || item.first_air_date || '').slice(0, 4);
  const saved    = watchlist.isInList(item.id);
  const fav      = favorites.isFavorite(item.id);
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
              {year} · {type === 'tv' ? MEDIA.tvSeries : MEDIA.movie}{note ? ` · ${note}` : ''}
            </p>
          )}
        </div>
      </button>

      {/* Corner action buttons. Each shows itself when its own state is
          active; the inactive one waits for hover, so an active favourite
          doesn't display an empty bookmark next to it. */}
      <div className={`discover-hero-corner-btns${hovered ? ' visible' : ''}`}>
        {/* Top-left: Favourite */}
        <button
          className={`discover-hero-corner-btn${fav ? ' active' : ''}`}
          style={{ position: 'absolute', top: 10, left: 10 }}
          onClick={() => favorites.toggleFavorite({ ...item, media_type: type })}
          aria-label={fav ? fw.un : fw.noun}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={fav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>

        {/* Top-right: Bookmark */}
        <button
          className={`discover-hero-corner-btn${saved ? ' active' : ''}`}
          style={{ position: 'absolute', top: 10, right: 10 }}
          onClick={() => watchlist.toggle({ ...item })}
          disabled={watchlist.loading}
          aria-label={saved ? MEDIA.removeFromWatchlist : 'Save to watchlist'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── Chart card action icons — same set/behavior as SearchView's result row ── */
function BookmarkIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5v16l-6-3.75L6 20.5v-16Z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}
function HeartIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

/* ── Chart card ──
   One cell of the Top 20 rail: rank, poster, title, meta. The rail lays these
   out two rows deep and scrolls sideways, so each card is a fixed width and
   the title gets the room the old full-width list row never gave it. */
function ChartCard({ item, rank, openPanel, watchlist, favorites, region }) {
  const fw    = favoriteWords(region);
  const title = item.title || item.name;
  const img   = posterUrl(item.poster_path, 'w154');
  const type  = item.media_type || 'movie';
  const id    = item.id;
  const year  = (item.release_date || item.first_air_date || '').slice(0, 4);
  const inList  = watchlist.isInList(id);
  const isFav   = favorites.isFavorite(id);
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
          <div className="discover-chart-meta">{year}{year ? ' · ' : ''}{type === 'tv' ? MEDIA.tv : MEDIA.movie}</div>
        </div>
      </button>
      <div className="discover-chart-actions search-row-actions">
        <button
          type="button"
          className={`search-action-btn search-action-btn--heart${isFav ? ' active' : ''}`}
          onClick={async e => { e.stopPropagation(); await favorites.toggleFavorite({ ...item, id, tmdb_id: id, media_type: type }); }}
          data-tip={isFav ? `Remove ${fw.nounLower}` : fw.noun}
          aria-label={isFav ? `Remove ${title} from ${fw.pluralLower}` : `Add ${title} to ${fw.pluralLower}`}
        >
          <HeartIcon filled={isFav} />
        </button>
        <button
          type="button"
          className={`search-action-btn${inList ? ' active' : ''}`}
          onClick={e => { e.stopPropagation(); watchlist.toggle({ ...item, id, media_type: type }); }}
          data-tip={inList ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist}
          aria-label={inList ? `Remove ${title} from list` : `Add ${title} to list`}
        >
          <BookmarkIcon filled={inList} />
        </button>
      </div>
    </div>
  );
}

/* ── Top 20 ── a two-row rail. */
function WeeklyChart({ items, openPanel, watchlist }) {
  const { favorites, profile } = useApp();
  const rail = useRailScroll();
  return (
    <section className="discover-section">
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
      </div>

      {active && (
        <div className="discover-plat-rail-wrap">
          <ScrollRail rail={rail} className="discover-plat-rail">
            {active.items.slice(0, 10).map((item, i) => (
              <RankedCard key={`${item.id}-${i}`} item={item} rank={item._rank ?? i + 1} showMeta={false} openPanel={openPanel} watchlist={watchlist} />
            ))}
          </ScrollRail>
          <div className="discover-plat-arrows"><RailArrows rail={rail} /></div>
        </div>
      )}
    </div>
  );
}

function PlatformCharts({ platformList, openPanel, watchlist, typeFilters, genreFilters }) {
  const byKey = Object.fromEntries(platformList.map(p => [p.key, p]));
  const logos = usePlatformLogos();
  return (
    <section className="discover-section">
      <DiscoverSectionHeader title="Top 10 by Platform" subtitle="Official charts" />
      <div className="discover-plat-list">
        {OFFICIAL_PLATFORMS.map(def => (
          <PlatformRow key={def.key} def={def} chart={byKey[def.key]} logoPath={logos[def.key]} openPanel={openPanel} watchlist={watchlist} typeFilters={typeFilters} genreFilters={genreFilters} />
        ))}
      </div>
    </section>
  );
}

/* ── Home ── */
function DiscoverContent({ openPanel, watchlist, typeFilters, genreFilters }) {
  const navigate = useNavigate();
  const { data, loading } = useDiscover();
  const { data: releases } = useNewReleases();
  // Hard-coded official-chart platforms — the same set for everyone, unrelated
  // to the user's own streaming selections. The hook returns only platforms
  // with synced rows; PlatformCharts fills in the rest as unavailable.
  const platformList = usePlatformCharts();
  if (loading) {
    return <LoadingSpinner />;
  }

  const applyFilters = (items) => filterByGenre(filterByType(items, typeFilters), genreFilters);
  const { hero } = data;
  const onThisDay        = data.onThisDay;
  const hotRail           = applyFilters(data.hotRail);
  const weekly            = applyFilters(data.weekly);
  const bingedShows       = applyFilters(data.bingedShows);
  const cinemaMovies      = applyFilters(data.cinemaMovies);
  const anticipatedMovies = applyFilters(data.anticipatedMovies);
  const recent            = applyFilters(releases.recent);
  const hasContent = hero || hotRail.length > 0 || weekly.length > 0 || bingedShows.length > 0 || cinemaMovies.length > 0 || anticipatedMovies.length > 0 || platformList.length > 0;

  if (!hasContent) {
    return (
      <div className="empty-state" style={{ marginTop: '1rem' }}>
        <div className="empty-title">Discovery unavailable</div>
        <div className="empty-body">Trending and platform picks could not load right now. Try again shortly.</div>
      </div>
    );
  }

  return (
    <div className="discover-sections">
      {hero && genreFilters.length === 0 && (
        <section className="discover-section discover-featured-section">
          <DiscoverSectionHeader title="plot's Picks" />
          <div className={`discover-hero-row${onThisDay ? ' has-two' : ''}`}>
            <HeroCard item={hero} openPanel={openPanel} watchlist={watchlist} />
            {onThisDay && (
              <HeroCard
                item={onThisDay}
                openPanel={openPanel}
                watchlist={watchlist}
                badge={onThisDay.archive_year ? MEDIA.fromTheArchiveBadge : MEDIA.onThisDay}
              />
            )}
          </div>
        </section>
      )}

      {hotRail.length > 0 && (
        <RailSection title="Hot Right Now" subtitle="Trending today" sectionClassName="discover-section discover-binge-section" binge>
          {hotRail.map(item => (
            <BingeCard key={`${item.media_type}-${item.id}`} item={item} openPanel={openPanel} watchlist={watchlist} />
          ))}
        </RailSection>
      )}

      {weekly.length > 0 && <WeeklyChart items={weekly} openPanel={openPanel} watchlist={watchlist} />}

      {recent.length > 0 && (
        <RailSection
          title="New Releases"
          subtitle="Last 30 days"
          headerRight={
            <button type="button" className="discover-see-all" onClick={() => navigate('/new-releases')}>
              {MEDIA.seeAll}
            </button>
          }
        >
          {recent.map(item => (
            <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} openPanel={openPanel} watchlist={watchlist} />
          ))}
        </RailSection>
      )}

      {bingedShows.length > 0 && (
        <RailSection title="Most Binged Shows" subtitle="Popular TV">
          {bingedShows.map(item => (
            <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} openPanel={openPanel} watchlist={watchlist} />
          ))}
        </RailSection>
      )}

      {cinemaMovies.length > 0 && (
        <RailSection title="Now Showing" subtitle={MEDIA.inCinemas} sectionClassName="discover-section discover-binge-section" binge>
          {cinemaMovies.map(item => (
            <BingeCard key={`${item.media_type}-${item.id}`} item={item} openPanel={openPanel} watchlist={watchlist} />
          ))}
        </RailSection>
      )}

      {anticipatedMovies.length > 0 && (
        <RailSection title={DISCOVER_VIEW.mostAnticipatedTitle} subtitle={DISCOVER_VIEW.mostAnticipatedSubtitle} sectionClassName="discover-section discover-binge-section" binge>
          {anticipatedMovies.map(item => (
            <BingeCard key={`${item.media_type}-${item.id}`} item={item} openPanel={openPanel} watchlist={watchlist} />
          ))}
        </RailSection>
      )}

      {platformList.length > 0 && <PlatformCharts platformList={platformList} openPanel={openPanel} watchlist={watchlist} typeFilters={typeFilters} genreFilters={genreFilters} />}
    </div>
  );
}

/* ═══════════════════════════════════════
   DiscoverView — Home
═══════════════════════════════════════ */
export default function DiscoverView() {
  const app = useApp();
  const [typeFilters,  setTypeFilters]  = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);

  if (!app) return null;

  const { openPanel, watchlist } = app;

  return (
    <div>
      <DiscoverToolbar
        ariaLabel="Filter discover"
        typeFilters={typeFilters}
        setTypeFilters={setTypeFilters}
        genreFilters={genreFilters}
        setGenreFilters={setGenreFilters}
      />
      <DiscoverContent
        openPanel={openPanel}
        watchlist={watchlist}
        typeFilters={typeFilters}
        genreFilters={genreFilters}
      />
    </div>
  );
}
