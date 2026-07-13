export function classifySearchResults(rawResults = []) {
  const results = Array.isArray(rawResults) ? rawResults : [];
  const filtered = results
    .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
    .filter(r => r.poster_path || r.name || r.title);

  if (filtered.length > 0) {
    return { filtered, emptyMode: 'none' };
  }

  if (results.some(r => r.media_type === 'person')) {
    return { filtered, emptyMode: 'title-guidance' };
  }

  return { filtered, emptyMode: 'generic' };
}
