import { useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { TodayLabel } from './TodayLabel.jsx';
import { posterUrl, backdropUrl } from '../utils/images.js';
import { favoriteWords } from '../utils/spelling.js';
import { useDragScroll } from '../hooks/useDragScroll.js';
import { useGenres } from '../hooks/useGenres.js';
import { useDiscover } from '../hooks/useDiscover.js';
import { useForYou } from '../hooks/useForYou.js';
import { useNewReleases } from '../hooks/useNewReleases.js';
import { usePlatformCharts } from '../hooks/usePlatformCharts.js';
import { UpcomingContent } from './GuideView.jsx';
import { filterByType, filterByGenre } from '../utils/mediaFilters.js';
import EpgView from './EpgView.jsx';
import { MEDIA } from '../copy/media.js';
import FeedView from './FeedView.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import { track, EVENTS } from '../lib/analytics.js';
import GroupedFilterMenu from './GroupedFilterMenu.jsx';
import SectionToggleIcon from './SectionToggleIcon.jsx';
import { getButtonLikeProps } from '../utils/interactive.js';
import { SHOW_SOCIAL_FEED, SHOW_FOR_YOU_RAIL } from '../launchFeatures.js';

const ALL_TYPES = ['tv', 'cinema', 'movie'];

/* ── Rail ── */
function Rail({ children }) {
  const { ref, handlers } = useDragScroll();
  return (
    <div className="rail-scroll" ref={ref} {...handlers}
      style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '2rem', paddingBottom: '2rem' }}>
      {children}
    </div>
  );
}

function BingeRail({ children }) {
  const { ref, handlers } = useDragScroll();
  return (
    <div className="discover-binge-rail" ref={ref} {...handlers}>
      {children}
    </div>
  );
}

function DiscoverSectionHeader({ kicker, title, open, onToggle, className = '' }) {
  return (
    <button
      className={`collapse-head discover-section-header${className ? ` ${className}` : ''}`}
      onClick={onToggle}
      aria-expanded={open}
      type="button"
    >
      <svg className={`collapse-chevron${open ? ' open' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.15rem' }}>{kicker}</div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1.2, textTransform: 'uppercase', color: 'var(--text-primary)' }}>{title}</div>
      </div>
    </button>
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

/* ── Poster card with optional rank badge ── */
function RankedCard({ item, rank, showRank = true, openPanel, watchlist }) {
  const title = item.title || item.name;
  const img   = posterUrl(item.poster_path, 'w185');
  const type  = item.media_type || 'movie';
  const openDetails = () => openPanel(item.id, type);
  return (
    <div
      className="media-card interactive-surface"
      onClick={openDetails}
      {...getButtonLikeProps({ onPress: openDetails, label: `View details for ${title}` })}
    >
      <div className="media-card-img">
        {img
          ? <img src={img} alt={title} loading="lazy" />
          : <div className="media-card-img-placeholder" />
        }
        <FavBtn item={item} />
        <SaveBtn item={item} watchlist={watchlist} />
        {showRank && <span className={`discover-rank-badge${rankBadgeClass(rank)}`}>{rank}</span>}
      </div>
      <div className="media-card-title">{title}</div>
      <div className="media-card-meta">{cardMeta(item)}</div>
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
      className="discover-binge-card interactive-surface"
      onClick={openDetails}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ backgroundImage: `url(${backdrop || poster || ''})` }}
      {...getButtonLikeProps({ onPress: openDetails, label: `View details for ${title}` })}
    >
      <span className="discover-binge-card-shade" />
      <span className="discover-binge-card-copy">
        <span className="discover-binge-card-title">{title}</span>
        <span className="discover-binge-card-meta">
          {year ? `${year} • ` : ''}{type === 'tv' ? MEDIA.tvSeries : MEDIA.movie}
        </span>
      </span>

      {/* Corner action buttons — visible on hover or when active */}
      <div
        className={`discover-hero-corner-btns${hovered || saved || fav ? ' visible' : ''}`}
        onClick={e => e.stopPropagation()}
      >
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
      className="discover-hero interactive-surface"
      onClick={openDetails}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...getButtonLikeProps({ onPress: openDetails, label: `View details for ${title}` })}
    >
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

      {/* Corner action buttons — visible on hover or when active */}
      <div
        className={`discover-hero-corner-btns${hovered || saved || fav ? ' visible' : ''}`}
        onClick={e => e.stopPropagation()}
      >
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

/* ── Chart row action icons — same set/behavior as SearchView's result row ── */
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
/* ── Chart row ── */
function ChartRow({ item, rank, openPanel, watchlist, favorites, region }) {
  const fw    = favoriteWords(region);
  const title = item.title || item.name;
  const img   = posterUrl(item.poster_path, 'w92');
  const type  = item.media_type || 'movie';
  const id    = item.id;
  const year  = (item.release_date || item.first_air_date || '').slice(0, 4);
  const inList  = watchlist.isInList(id);
  const isFav   = favorites.isFavorite(id);
  const openDetails = () => openPanel(id, type);

  return (
    <div
      className="discover-chart-row interactive-surface"
      onClick={openDetails}
      {...getButtonLikeProps({ onPress: openDetails, label: `View details for ${title}` })}
    >
      <span className={`discover-chart-rank${rank <= 10 ? ' glow' : ' dim'}${rank <= 3 ? ' top3' : ''}`}>{rank}</span>
      <div className="discover-chart-poster">
        {img
          ? <img src={img} alt={title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', background: 'var(--surface-sunken)' }} />
        }
      </div>
      <div className="discover-chart-info">
        <div className="discover-chart-title">{title}</div>
        <div className="discover-chart-meta">{year}{year ? ' · ' : ''}{type === 'tv' ? 'TV' : 'Movie'}</div>
      </div>
      <div className="discover-chart-right search-row-actions">
        <button
          type="button"
          className={`search-action-btn${inList ? ' active' : ''}`}
          onClick={e => { e.stopPropagation(); watchlist.toggle({ ...item, id, media_type: type }); }}
          data-tip={inList ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist}
          aria-label={inList ? `Remove ${title} from list` : `Add ${title} to list`}
        >
          <BookmarkIcon filled={inList} />
        </button>
        <button
          type="button"
          className={`search-action-btn search-action-btn--heart${isFav ? ' active' : ''}`}
          onClick={async e => { e.stopPropagation(); await favorites.toggleFavorite({ ...item, id, tmdb_id: id, media_type: type }); }}
          data-tip={isFav ? `Remove ${fw.nounLower}` : fw.noun}
          aria-label={isFav ? `Remove ${title} from ${fw.pluralLower}` : `Add ${title} to ${fw.pluralLower}`}
        >
          <HeartIcon filled={isFav} />
        </button>
      </div>
    </div>
  );
}

/* ── Platform section (collapsible) ── */
function PlatformSection({ platform, openPanel, watchlist, typeFilters, genreFilters }) {
  const showMovies = typeFilters.includes('movie') || typeFilters.includes('cinema');
  const showTv     = typeFilters.includes('tv');
  platform = {
    ...platform,
    movies: showMovies ? filterByGenre(platform.movies, genreFilters) : [],
    tv:     showTv     ? filterByGenre(platform.tv, genreFilters)     : [],
  };
  const [open, setOpen] = useState(false);
  const totalItems = platform.movies.length + platform.tv.length;
  if (!totalItems) return null;

  return (
    <div className="discover-plat-section">
      <button className="discover-plat-header" onClick={() => setOpen(o => !o)}>
        <svg
          className={`discover-plat-chevron${open ? ' open' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <div className="discover-plat-header-left">
          {platform.logo_path
            ? <img className="discover-plat-logo" src={`https://image.tmdb.org/t/p/w45${platform.logo_path}`} alt={platform.name} />
            : <div className="discover-plat-logo discover-plat-logo-fallback">{platform.name.slice(0, 2)}</div>
          }
          <span className="discover-plat-name">{platform.name}</span>
        </div>
      </button>

      {open && (
        <div className="discover-plat-body">
          {platform.movies.length > 0 && (
            <>
              <div className="discover-plat-type-label">Movies</div>
              <div className="discover-plat-grid">
                {platform.movies.slice(0, 10).map((item, i) => (
                  <div
                    key={`${item.id}-${i}`}
                    className="media-card interactive-surface"
                    onClick={() => openPanel(item.id, 'movie')}
                    {...getButtonLikeProps({ onPress: () => openPanel(item.id, 'movie'), label: `View details for ${item.title || item.name}` })}
                  >
                    <div className="media-card-img">
                      {posterUrl(item.poster_path, 'w185')
                        ? <img src={posterUrl(item.poster_path, 'w185')} alt={item.title || item.name} loading="lazy" />
                        : <div className="media-card-img-placeholder" />
                      }
                      <FavBtn item={item} />
                      <SaveBtn item={item} watchlist={watchlist} />
                      <span className={`discover-rank-badge${rankBadgeClass(item._rank ?? i + 1)}`}>{item._rank ?? i + 1}</span>
                    </div>
                    <div className="media-card-title">{item.title || item.name}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          {platform.tv.length > 0 && (
            <>
              <div className="discover-plat-type-label">TV Shows</div>
              <div className="discover-plat-grid">
                {platform.tv.slice(0, 10).map((item, i) => (
                  <div
                    key={`${item.id}-${i}`}
                    className="media-card interactive-surface"
                    onClick={() => openPanel(item.id, 'tv')}
                    {...getButtonLikeProps({ onPress: () => openPanel(item.id, 'tv'), label: `View details for ${item.title || item.name}` })}
                  >
                    <div className="media-card-img">
                      {posterUrl(item.poster_path, 'w185')
                        ? <img src={posterUrl(item.poster_path, 'w185')} alt={item.title || item.name} loading="lazy" />
                        : <div className="media-card-img-placeholder" />
                      }
                      <FavBtn item={item} />
                      <SaveBtn item={item} watchlist={watchlist} />
                      <span className={`discover-rank-badge${rankBadgeClass(item._rank ?? i + 1)}`}>{item._rank ?? i + 1}</span>
                    </div>
                    <div className="media-card-title">{item.title || item.name}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="discover-plat-attribution">
            Official Top 10 · Netflix and the{' '}
            <a href="https://www.movieofthenight.com/about/api" target="_blank" rel="noopener noreferrer">
              Streaming Availability API
            </a>.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Discover tab content ── */
function DiscoverContent({ openPanel, watchlist, openSections, setOpenSections, typeFilters, genreFilters }) {
  const { favorites, profile } = useApp();
  const { data, loading } = useDiscover();
  // Hard-coded official-chart platforms — the same set for everyone, unrelated
  // to the user's own streaming selections. Only platforms with real synced
  // Top 10 data are returned.
  const platformList = usePlatformCharts();
  const { items: forYouItems } = useForYou(28, SHOW_FOR_YOU_RAIL);
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
  const forYou            = applyFilters(forYouItems);
  const hasContent = hero || hotRail.length > 0 || weekly.length > 0 || bingedShows.length > 0 || cinemaMovies.length > 0 || anticipatedMovies.length > 0 || platformList.length > 0 || forYou.length > 0;

  if (!hasContent) {
    return (
      <div className="empty-state" style={{ marginTop: '1rem' }}>
        <div className="empty-title">Discovery unavailable</div>
        <div className="empty-body">Trending and platform picks could not load right now. Try again shortly.</div>
      </div>
    );
  }

  const toggleSection = (section) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
  return (
    <div>
      {hero && genreFilters.length === 0 && (
        <section className="discover-section discover-featured-section">
          <DiscoverSectionHeader
            kicker="Featured"
            title="PLOT's Picks"
            open={openSections.featured}
            onToggle={() => toggleSection('featured')}
          />
          {openSections.featured && (
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
          )}
        </section>
      )}

      {forYou.length > 0 && (
        <section className="discover-section">
          <DiscoverSectionHeader
            kicker="Based on your taste"
            title="Your Next Watch"
            open={openSections.forYou}
            onToggle={() => toggleSection('forYou')}
          />
          {openSections.forYou && (
            <Rail>
              {forYou.map(item => (
                <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} openPanel={openPanel} watchlist={watchlist} />
              ))}
            </Rail>
          )}
        </section>
      )}

      {hotRail.length > 0 && (
        <section className="discover-section discover-binge-section">
          <DiscoverSectionHeader
            kicker="Trending today"
            title="Hot Right Now"
            open={openSections.hot}
            onToggle={() => toggleSection('hot')}
            className="discover-binge-header"
          />
          {openSections.hot && (
            <BingeRail>
              {hotRail.map(item => (
                <BingeCard key={item.id} item={item} openPanel={openPanel} watchlist={watchlist} />
              ))}
            </BingeRail>
          )}
        </section>
      )}

      {bingedShows.length > 0 && (
        <section className="discover-section">
          <DiscoverSectionHeader
            kicker="Popular TV"
            title="Most Binged Shows"
            open={openSections.binge}
            onToggle={() => toggleSection('binge')}
          />
          {openSections.binge && (
            <Rail>
              {bingedShows.map(item => (
                <RankedCard key={item.id} item={item} showRank={false} openPanel={openPanel} watchlist={watchlist} />
              ))}
            </Rail>
          )}
        </section>
      )}

      {weekly.length > 0 && (
        <section className="discover-section discover-section--list">
          <DiscoverSectionHeader
            kicker="Global ranking"
            title="Top 20 This Week"
            open={openSections.weekly}
            onToggle={() => toggleSection('weekly')}
          />
          {openSections.weekly && weekly.map((item, i) => (
            <ChartRow key={item.id} item={item} rank={i + 1} openPanel={openPanel} watchlist={watchlist} favorites={favorites} region={profile?.region} />
          ))}
        </section>
      )}

      {cinemaMovies.length > 0 && (
        <section className="discover-section discover-binge-section">
          <DiscoverSectionHeader
            kicker={MEDIA.inCinemas}
            title="Now Showing"
            open={openSections.cinemas}
            onToggle={() => toggleSection('cinemas')}
            className="discover-binge-header"
          />
          {openSections.cinemas && (
            <BingeRail>
              {cinemaMovies.map(item => (
                <BingeCard key={item.id} item={item} openPanel={openPanel} watchlist={watchlist} />
              ))}
            </BingeRail>
          )}
        </section>
      )}

      {anticipatedMovies.length > 0 && (
        <section className="discover-section discover-binge-section">
          <DiscoverSectionHeader
            kicker={MEDIA.comingSoon}
            title="Most Anticipated"
            open={openSections.anticipated}
            onToggle={() => toggleSection('anticipated')}
            className="discover-binge-header"
          />
          {openSections.anticipated && (
            <BingeRail>
              {anticipatedMovies.map(item => (
                <BingeCard key={item.id} item={item} openPanel={openPanel} watchlist={watchlist} />
              ))}
            </BingeRail>
          )}
        </section>
      )}

      {platformList.length > 0 && (
        <section className="discover-section discover-section--list">
          <DiscoverSectionHeader
            kicker="Official charts"
            title="Top 10 by Platform"
            open={openSections.platforms}
            onToggle={() => toggleSection('platforms')}
          />
          {openSections.platforms && platformList.map(platform => (
            <PlatformSection key={platform.id} platform={platform} openPanel={openPanel} watchlist={watchlist} typeFilters={typeFilters} genreFilters={genreFilters} />
          ))}
        </section>
      )}

    </div>
  );
}

/* ── New Releases tab content ── */
function NewReleasesContent({ openPanel, watchlist, typeFilters, genreFilters, openSections, setOpenSections }) {
  const { data, loading } = useNewReleases();
  if (loading) {
    return <LoadingSpinner />;
  }

  const applyFilters = (items) => filterByGenre(filterByType(items, typeFilters), genreFilters);
  const recent = applyFilters(data.recent);
  const genreRails = data.genreRails.map(rail => ({ ...rail, items: applyFilters(rail.items) }));
  const hasContent = recent.length > 0 || genreRails.some(rail => rail.items.length > 0);

  if (!hasContent) {
    return (
      <div className="empty-state" style={{ marginTop: '1rem' }}>
        <div className="empty-title">Nothing new</div>
        <div className="empty-body">Nothing matches right now. Try widening your filters.</div>
      </div>
    );
  }

  const toggleSection = (section) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div>
      {recent.length > 0 && (
        <section className="discover-section">
          <DiscoverSectionHeader
            kicker="Last 30 days"
            title="Recently Released"
            open={openSections.recent}
            onToggle={() => toggleSection('recent')}
          />
          {openSections.recent && (
            <Rail>
              {recent.map(item => (
                <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} openPanel={openPanel} watchlist={watchlist} />
              ))}
            </Rail>
          )}
        </section>
      )}

      {genreRails.filter(rail => rail.items.length > 0).map(rail => (
        <section className="discover-section" key={rail.key}>
          <DiscoverSectionHeader
            kicker="New releases"
            title={rail.label}
            open={openSections[rail.key]}
            onToggle={() => toggleSection(rail.key)}
          />
          {openSections[rail.key] && (
            <Rail>
              {rail.items.map(item => (
                <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} openPanel={openPanel} watchlist={watchlist} />
              ))}
            </Rail>
          )}
        </section>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════
   DiscoverView — unified home with 3 tabs
═══════════════════════════════════════ */
export default function DiscoverView() {
  const app = useApp();
  const { genres }    = useGenres();
  const [tab,          setTab]          = useState(SHOW_SOCIAL_FEED ? 'feed' : 'discover');
  const [typeFilters,  setTypeFilters]  = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);
  const [discoverSections, setDiscoverSections] = useState({
    featured: true,
    hot: true,
    forYou: true,
    binge: true,
    cinemas: true,
    anticipated: true,
    weekly: true,
    platforms: true,
  });
  const allDiscoverSectionsOpen = Object.values(discoverSections).every(Boolean);
  const toggleAllDiscoverSections = () => {
    setDiscoverSections(prev => Object.fromEntries(
      Object.keys(prev).map(section => [section, !allDiscoverSectionsOpen]),
    ));
  };

  const [releasesAllOpen, setReleasesAllOpen] = useState(true);
  const [releasesToggleToken, setReleasesToggleToken] = useState(0);
  const toggleAllReleasesSections = () => {
    setReleasesAllOpen(o => !o);
    setReleasesToggleToken(t => t + 1);
  };
  const releasesExpandSignal = { token: releasesToggleToken, open: releasesAllOpen };

  const [newReleasesSections, setNewReleasesSections] = useState({
    recent: true, horror: true, comedy: true, action: true, scifi: true, thriller: true,
    romance: true, drama: true, documentary: true, truecrime: true, reality: true,
  });
  const allNewReleasesSectionsOpen = Object.values(newReleasesSections).every(Boolean);
  const toggleAllNewReleasesSections = () => {
    setNewReleasesSections(prev => Object.fromEntries(
      Object.keys(prev).map(section => [section, !allNewReleasesSectionsOpen]),
    ));
  };

  const changeTab = (next) => {
    if (next === tab) return;
    setTab(next);
    track(EVENTS.DISCOVER_TAB_CHANGED, { tab: next });
  };

  if (!app) return null;

  const { openPanel, watchlist, profile } = app;
  const guideChannels      = profile?.guide_channels      || [];

  return (
    <div className={tab === 'guide' ? 'guide-schedule-mode' : ''}>

      {/* ── Sub-tab toolbar ── */}
      <div className="sub-tabs">
        <span className="sub-tabs-date"><TodayLabel /></span>

        <div className="sub-tabs-scroll">
          {SHOW_SOCIAL_FEED && (
            <button
              className={`sub-tab-btn${tab === 'feed' ? ' active' : ''}`}
              onClick={() => changeTab('feed')}
            >
              Feed
            </button>
          )}
          <button
            className={`sub-tab-btn${tab === 'discover' ? ' active' : ''}`}
            onClick={() => changeTab('discover')}
          >
            Discover
          </button>
          <button
            className={`sub-tab-btn${tab === 'new' ? ' active' : ''}`}
            onClick={() => changeTab('new')}
          >
            New Releases
          </button>
          <button
            className={`sub-tab-btn${tab === 'releases' ? ' active' : ''}`}
            onClick={() => changeTab('releases')}
          >
            Upcoming
          </button>
          <button
            className={`sub-tab-btn${tab === 'guide' ? ' active' : ''}`}
            onClick={() => changeTab('guide')}
          >
            Guide
          </button>
        </div>

        {(tab === 'releases' || tab === 'discover' || tab === 'new') && (
          <div className="sub-tabs-filters">
            <GroupedFilterMenu
              ariaLabel={tab === 'releases' ? 'Filter upcoming' : tab === 'new' ? 'Filter new releases' : 'Filter discover'}
              groups={[
                {
                  heading: MEDIA.typeHeading,
                  options: [
                    { id: 'tv',     label: MEDIA.tv     },
                    { id: 'cinema', label: MEDIA.cinema },
                    { id: 'movie',  label: MEDIA.movies },
                  ],
                  value: typeFilters,
                  onChange: setTypeFilters,
                  defaultValue: ALL_TYPES,
                },
                {
                  heading: MEDIA.genreHeading,
                  options: genres.map(g => ({ id: g.id, label: g.name })),
                  value: genreFilters,
                  onChange: setGenreFilters,
                },
              ]}
            />

            {tab === 'discover' && (
              <button
                className="section-expand-all-btn"
                onClick={toggleAllDiscoverSections}
                aria-label={allDiscoverSectionsOpen ? 'Collapse all Discover sections' : 'Expand all Discover sections'}
                aria-pressed={!allDiscoverSectionsOpen}
                title={allDiscoverSectionsOpen ? MEDIA.collapseAllSections : MEDIA.expandAllSections}
                type="button"
              >
                <SectionToggleIcon collapse={allDiscoverSectionsOpen} />
              </button>
            )}

            {tab === 'releases' && (
              <button
                className="section-expand-all-btn"
                onClick={toggleAllReleasesSections}
                aria-label={releasesAllOpen ? 'Collapse all Upcoming sections' : 'Expand all Upcoming sections'}
                aria-pressed={!releasesAllOpen}
                title={releasesAllOpen ? MEDIA.collapseAllSections : MEDIA.expandAllSections}
                type="button"
              >
                <SectionToggleIcon collapse={releasesAllOpen} />
              </button>
            )}

            {tab === 'new' && (
              <button
                className="section-expand-all-btn"
                onClick={toggleAllNewReleasesSections}
                aria-label={allNewReleasesSectionsOpen ? 'Collapse all New Releases sections' : 'Expand all New Releases sections'}
                aria-pressed={!allNewReleasesSectionsOpen}
                title={allNewReleasesSectionsOpen ? MEDIA.collapseAllSections : MEDIA.expandAllSections}
                type="button"
              >
                <SectionToggleIcon collapse={allNewReleasesSectionsOpen} />
              </button>
            )}
          </div>
        )}

        {tab === 'guide' && (
          <div id="guide-top-filters" className="sub-tabs-filters" />
        )}
      </div>

      {/* ── Tab content ── */}
      {SHOW_SOCIAL_FEED && tab === 'feed' && <FeedView />}

      {tab === 'discover' && (
        <DiscoverContent
          openPanel={openPanel}
          watchlist={watchlist}
          openSections={discoverSections}
          setOpenSections={setDiscoverSections}
          typeFilters={typeFilters}
          genreFilters={genreFilters}
        />
      )}

      {tab === 'new' && (
        <NewReleasesContent
          openPanel={openPanel}
          watchlist={watchlist}
          typeFilters={typeFilters}
          genreFilters={genreFilters}
          openSections={newReleasesSections}
          setOpenSections={setNewReleasesSections}
        />
      )}

      {tab === 'releases' && (
        <UpcomingContent
          typeFilters={typeFilters}
          genreFilters={genreFilters}
          providers={guideChannels}
          openPanel={openPanel}
          watchlist={watchlist}
          expandSignal={releasesExpandSignal}
        />
      )}

      {tab === 'guide' && <EpgView />}

    </div>
  );
}
