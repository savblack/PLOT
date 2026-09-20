// Convert a supported YouTube watch/share/embed URL into the video key used by
// privacy-enhanced embeds. Reject other hosts and malformed keys rather than
// interpolating an arbitrary URL into article HTML.
export const youtubeKey = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let key = '';
    if (host === 'youtu.be') key = url.pathname.split('/').filter(Boolean)[0] || '';
    else if (host === 'youtube.com' || host === 'm.youtube.com') {
      key = url.searchParams.get('v') || '';
      if (!key) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts[0] === 'embed' || parts[0] === 'shorts') key = parts[1] || '';
      }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(key) ? key : null;
  } catch {
    return null;
  }
};

type YoutubeVideo = {
  key?: string | null;
  site?: string | null;
  type?: string | null;
  official?: boolean | null;
};

// Legacy First Look rows predate payload.trailer_url. TMDB video results are
// newest-first, so prefer the first official YouTube trailer, then the first
// YouTube trailer if the distributor did not mark one official.
export const youtubeTrailerKey = (videos: YoutubeVideo[] | null | undefined) => {
  const trailers = (videos || []).filter((video) =>
    video?.site === 'YouTube' && video?.type === 'Trailer' && /^[A-Za-z0-9_-]{11}$/.test(video?.key || ''));
  return trailers.find((video) => video.official)?.key || trailers[0]?.key || null;
};
