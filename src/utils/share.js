export async function share({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return null;
      await navigator.clipboard.writeText(url);
      return 'copied';
    }
  } else {
    await navigator.clipboard.writeText(url);
    return 'copied';
  }
}

export function shareItem(item) {
  const type = item.media_type === 'tv' ? 'tv' : 'movie';
  const id = item.id || item.tmdb_id;
  const title = item.title || item.name || '';
  return share({
    title,
    text: `${title} — tracked on Plot`,
    url: `https://www.themoviedb.org/${type}/${id}`,
  });
}
