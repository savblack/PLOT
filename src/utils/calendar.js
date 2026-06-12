export function msUntilNextLocalMidnight(now = new Date()) {
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(0, nextMidnight.getTime() - now.getTime());
}

export function buildWatchlistMovieCalendarEvents(item, todayStr) {
  if (item.media_type === 'tv') return [];

  const hasUpcomingRelease = item.release_date && item.release_date >= todayStr;
  const hasUpcomingStreaming = item.streaming_date && item.streaming_date >= todayStr;
  const isSameDayStreamingRelease =
    hasUpcomingRelease &&
    hasUpcomingStreaming &&
    item.release_date === item.streaming_date;

  const events = [];

  if (hasUpcomingRelease) {
    const isCinemaWindow = hasUpcomingStreaming && !isSameDayStreamingRelease;
    events.push({
      date: item.release_date,
      type: isSameDayStreamingRelease ? 'streaming' : isCinemaWindow ? 'cinema' : 'streaming',
      label: isSameDayStreamingRelease ? 'Streaming' : isCinemaWindow ? 'Cinema' : 'Streaming',
      item,
    });
  }

  if (hasUpcomingStreaming && !isSameDayStreamingRelease) {
    events.push({
      date: item.streaming_date,
      type: 'streaming',
      label: 'Streaming',
      item,
    });
  }

  return events;
}

function buildSortedSignature(items) {
  return items.slice().sort().join('||');
}

export function buildWatchlistCalendarSignature(items = []) {
  return buildSortedSignature(items.map(item => [
    item.tmdb_id ?? '',
    item.media_type ?? '',
    item.title ?? item.name ?? '',
    item.poster_path ?? '',
    item.release_date ?? '',
    item.streaming_date ?? '',
  ].join('|')));
}

export function buildWatchingCalendarSignature(items = []) {
  return buildSortedSignature(items.map(item => [
    item.tmdb_id ?? '',
    item.current_season ?? '',
    item.current_episode ?? '',
    item.title ?? '',
    item.poster_path ?? '',
  ].join('|')));
}

export function buildReminderCalendarSignature(items = []) {
  return buildSortedSignature(items.map(item => [
    item.tvmaze_ep_id ?? '',
    item.show_name ?? '',
    item.network_name ?? '',
    item.air_date ?? '',
    item.air_time ?? '',
  ].join('|')));
}

export function getCalendarRelativeLabel(selectedDate, todayStr) {
  if (selectedDate === todayStr) return 'Today';

  const selected = new Date(`${selectedDate}T00:00:00`);
  const today = new Date(`${todayStr}T00:00:00`);
  const diff = Math.round((selected - today) / 86400000);

  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';

  return selected.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' });
}
