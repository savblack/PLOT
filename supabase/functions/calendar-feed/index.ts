import { createClient } from 'jsr:@supabase/supabase-js@2';

const TMDB_BASE = 'https://api.themoviedb.org/3';

// ── ICS helpers ──────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function esc(str: string): string {
  return (str || '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    parts.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join('\r\n');
}

interface CalEvent {
  date: string;
  type: 'episode' | 'release' | 'reminder';
  summary: string;
  description?: string;
  uid: string;
}

function generateICS(events: CalEvent[]): string {
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Plot//Plot Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Plot Calendar',
    'X-WR-CALDESC:Your movies and TV calendar from Plot',
  ];

  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(fold(`UID:${ev.uid}`));
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(ev.date)}`);
    lines.push(`DTEND;VALUE=DATE:${nextDay(ev.date)}`);
    lines.push(fold(`SUMMARY:${esc(ev.summary)}`));
    if (ev.description) lines.push(fold(`DESCRIPTION:${esc(ev.description)}`));
    lines.push('X-APPLE-DEFAULT-ALARM:FALSE');
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:NONE');
    lines.push('TRIGGER;VALUE=DURATION:-PT0S');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return new Response('Missing token', { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const tmdbKey = Deno.env.get('TMDB_API_KEY');

  const db = createClient(supabaseUrl, serviceRoleKey);

  // Resolve token → user
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('calendar_token', token)
    .single();

  if (!profile) {
    return new Response('Invalid token', { status: 401 });
  }

  const userId = profile.id;
  const today = new Date().toISOString().slice(0, 10);

  // Fetch all sources in parallel
  const [watchlistRes, watchingRes, remindersRes] = await Promise.all([
    db
      .from('list_items')
      .select('tmdb_id, media_type, title, release_date')
      .eq('user_id', userId)
      .not('release_date', 'is', null)
      .gte('release_date', today),
    db
      .from('watching_progress')
      .select('tmdb_id, title, current_season, current_episode')
      .eq('user_id', userId),
    db
      .from('reminders')
      .select('tvmaze_ep_id, show_name, network_name, air_date, air_time')
      .eq('user_id', userId)
      .gte('air_date', today)
      .order('air_date'),
  ]);

  const events: CalEvent[] = [];

  // Watchlist releases
  for (const item of watchlistRes.data ?? []) {
    events.push({
      date: item.release_date,
      type: 'release',
      summary: item.title,
      description: item.media_type === 'movie' ? 'Movie release' : 'TV release',
      uid: `plot-release-${item.tmdb_id}-${item.release_date}@plot.tv`,
    });
  }

  // EPG reminders
  for (const rem of remindersRes.data ?? []) {
    const parts: string[] = [];
    if (rem.network_name) parts.push(rem.network_name);
    if (rem.air_time) parts.push(rem.air_time);
    events.push({
      date: rem.air_date,
      type: 'reminder',
      summary: rem.show_name,
      description: parts.length ? parts.join(' · ') : undefined,
      uid: `plot-reminder-${rem.tvmaze_ep_id}-${rem.air_date}@plot.tv`,
    });
  }

  // Watching progress — fetch upcoming episode air dates from TMDB in parallel
  if (tmdbKey) {
    await Promise.all(
      (watchingRes.data ?? []).map(async (show) => {
        try {
          const res = await fetch(
            `${TMDB_BASE}/tv/${show.tmdb_id}/season/${show.current_season}?api_key=${tmdbKey}&language=en-US`,
          );
          if (!res.ok) return;
          const season = await res.json();
          for (const ep of season?.episodes ?? []) {
            if (ep.episode_number < show.current_episode) continue;
            if (!ep.air_date || ep.air_date < today) continue;
            const label = `S${String(show.current_season).padStart(2, '0')}E${String(ep.episode_number).padStart(2, '0')}`;
            events.push({
              date: ep.air_date,
              type: 'episode',
              summary: `${show.title} ${label}`,
              description: ep.name || undefined,
              uid: `plot-episode-${show.tmdb_id}-${label}@plot.tv`,
            });
          }
        } catch {
          // Skip this show if TMDB is unreachable
        }
      }),
    );
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  return new Response(generateICS(events), {
    headers: {
      'Content-Type': 'text/calendar;charset=utf-8',
      'Content-Disposition': 'inline; filename="plot-calendar.ics"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
});
