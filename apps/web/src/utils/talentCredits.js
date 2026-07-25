export function creditTitle(credit) {
  return credit.title || credit.name || 'Untitled';
}

export function mediaType(credit) {
  return credit.media_type === 'tv' ? 'tv' : 'movie';
}

export function creditMeta(credit, type) {
  const year = (credit.release_date || credit.first_air_date || '').slice(0, 4);
  return [year, type === 'tv' ? 'TV' : 'Movie'].filter(Boolean).join(' · ');
}

export function creditDate(credit) {
  return credit.release_date || credit.first_air_date || '';
}

export function shortBiography(biography) {
  if (!biography) return '';
  const cleanedBiography = biography.replace(
    /^([^\n(]{1,160})\s+\((?=[^)]*\b(?:born|née)\b)[^)]*\)\s*/i,
    '$1 ',
  ).trim();
  const sentences = cleanedBiography.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [];
  const preview = sentences.slice(0, 3).join('').trim();
  return preview || cleanedBiography;
}

export function dedupedActingCredits(cast) {
  const seen = new Set();
  return (cast || [])
    .filter(credit => credit.id && (credit.media_type === 'movie' || credit.media_type === 'tv'))
    .sort((a, b) => creditDate(b).localeCompare(creditDate(a)) || (b.popularity || 0) - (a.popularity || 0))
    .filter(credit => {
      const key = `${credit.media_type}-${credit.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
