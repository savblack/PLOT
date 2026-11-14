import { posterUrl, backdropUrl, logoUrl } from '../utils/images.js';
import { displayBackdropPath, displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { cardMetaLine } from '@plot/core/media.js';
import { SaveButton, FavoriteButton } from './TitleActions.jsx';

/* The poster card used by the release rails (Calendar's "All releases"; it
   was Upcoming's card). Moved out of GuideView when Upcoming left that file. */

export default function MediaCard({ item, openPanel, providerLogo, watchlist }) {
  const art = useUserArtwork();
  const shown = art.apply(item);
  const img = posterUrl(displayPosterPath(shown), 'w185') || backdropUrl(displayBackdropPath(shown), 'w300');
  const type  = item.media_type || 'movie';
  const title = item.title || item.name;
  const meta  = cardMetaLine(item);

  return (
    <div className="media-card" onClick={() => openPanel(item.id, type)}>
      <div className="media-card-img">
        {img
          ? <img src={img} alt={title} loading="lazy" />
          : <div className="media-card-img-placeholder" />
        }
        <FavoriteButton item={item} />
        <SaveButton item={item} watchlist={watchlist} />
        {providerLogo && (
          <div className="platform-badge">
            <img src={logoUrl(providerLogo, 'w45')} alt="" />
          </div>
        )}
      </div>
      <div className="media-card-title">{title}</div>
      <div className="media-card-meta">{meta}</div>
    </div>
  );
}
