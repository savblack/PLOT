import { useApp } from '../hooks/useApp.js';
import { favoriteWords } from '../utils/spelling.js';
import { FAVOURITES_ENABLED } from '@plot/core/features.js';
import { MEDIA } from '../copy/media.js';
import Icon from './Icon.jsx';

/* The watchlist bookmark and the favourite heart, once.

   These two buttons were copied into MediaCard, DiscoverView (three times),
   PublicProfilePage and TonightView, each with its own drawing and its own
   accessible name ("Add to list", "Save to watchlist", "Add to watchlist").
   Every surface that puts them over or beside a title now renders these.

   `variant` only picks the existing class for where the button sits:
     card  a poster card's corner (hover-revealed glyph over artwork)
     hero  a wide hero/binge card's corner
     row   beside a list-row style card (chart rows, Just Decide cards)
   The state rule is the same everywhere: outline when off, solid when on. The
   bookmark never changes colour or turns into a tick; the heart keeps the
   accent, which is one of the accent's approved roles. */

const SAVE_CLASS = { card: 'card-save-btn', hero: 'discover-hero-corner-btn', row: 'search-action-btn' };
const FAV_CLASS = { card: 'card-fav-btn', hero: 'discover-hero-corner-btn', row: 'search-action-btn search-action-btn--heart' };
const ON_CLASS = { save: { card: 'saved', hero: 'active', row: 'active' }, fav: { card: 'faved', hero: 'active', row: 'active' } };
const HERO_ICON = 16;

function titleOf(item) { return item.title || item.name || ''; }

export function SaveButton({ item, watchlist, variant = 'card', source, style }) {
  const id = item.id || item.tmdb_id;
  const saved = watchlist.isInList(id);
  const title = titleOf(item);
  const tip = saved ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist;
  const label = variant === 'row' && title
    ? (saved ? MEDIA.removeTitleFromWatchlist(title) : MEDIA.addTitleToWatchlist(title))
    : tip;
  const toggle = e => {
    e.stopPropagation();
    // The item goes through as the surface gave it. A caller that knows the
    // media type passes it on the item; this button does not guess one.
    const next = { ...item, id };
    if (source) watchlist.toggle(next, { source }); else watchlist.toggle(next);
  };
  return (
    <button
      type="button"
      className={`${SAVE_CLASS[variant]}${saved ? ` ${ON_CLASS.save[variant]}` : ''}`}
      style={style}
      onClick={toggle}
      disabled={watchlist.loading}
      aria-label={label}
      aria-pressed={saved}
      data-tip={variant === 'row' ? tip : undefined}
    >
      <Icon name="bookmark" filled={saved} size={variant === 'hero' ? HERO_ICON : undefined} />
    </button>
  );
}

/* `favorites` and `favWords` can be passed in (Just Decide does, so its
   stories render without the app context); otherwise they come from the
   viewer's own profile, never the profile being looked at. */
export function FavoriteButton({ item, variant = 'card', favorites: favoritesProp, favWords, style }) {
  const app = useApp();
  const favorites = favoritesProp || app?.favorites;
  const fw = favWords || favoriteWords(app?.profile?.region);
  if (!FAVOURITES_ENABLED || !favorites) return null;
  const id = item.id || item.tmdb_id;
  const type = item.media_type || 'movie';
  const fav = favorites.isFavorite(id);
  const title = titleOf(item);
  const label = variant === 'row' && title
    ? (fav ? `Remove ${title} from ${fw.pluralLower}` : `Add ${title} to ${fw.pluralLower}`)
    : (fav ? fw.un : fw.noun);
  return (
    <button
      type="button"
      className={`${FAV_CLASS[variant]}${fav ? ` ${ON_CLASS.fav[variant]}` : ''}`}
      style={style}
      onClick={e => { e.stopPropagation(); favorites.toggleFavorite({ ...item, id, tmdb_id: id, media_type: type }); }}
      aria-label={label}
      aria-pressed={fav}
      data-tip={variant === 'row' ? (fav ? `Remove ${fw.nounLower}` : fw.noun) : undefined}
    >
      <Icon name="heart" filled={fav} size={variant === 'hero' ? HERO_ICON : undefined} />
    </button>
  );
}
