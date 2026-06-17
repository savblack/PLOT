// Card-data builder for the feature template (marketing/templates/feature.html).
// Images are inlined as data URIs so the render never hotlinks TMDB, matching
// the rest of the pipeline.
import { fetchImageDataUri, POSTER_HERO, BACKDROP } from '../lib/images.mjs';

// A single-title feature card (spotlight / hidden gem / what to watch tonight).
export const featureData = async (kicker, title) => ({
  kicker,
  title: {
    title: title.title || title.name,
    backdrop_data_uri: await fetchImageDataUri(title.backdrop_path, BACKDROP),
    poster_data_uri: await fetchImageDataUri(title.poster_path, POSTER_HERO),
  },
});
