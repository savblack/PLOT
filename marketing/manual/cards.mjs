// Card-data builders for the manual-only post types (feature + question
// templates in marketing/templates/). Images are inlined as data URIs so the
// render never hotlinks TMDB, matching the rest of the pipeline.
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

// A text-only question card (text question / question of the week).
export const questionData = (kicker, question) => ({ kicker, question });
