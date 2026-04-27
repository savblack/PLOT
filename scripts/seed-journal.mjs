// Seed journal entries for fake profiles so the Following feed has content.
// Usage: SUPABASE_SERVICE_KEY=your_key TMDB_API_KEY=your_key node scripts/seed-journal.mjs

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TMDB_KEY = process.env.TMDB_API_KEY;

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_KEY. Run: SUPABASE_SERVICE_KEY=your_key node scripts/seed-journal.mjs');
  process.exit(1);
}

if (!TMDB_KEY) {
  console.error('Missing TMDB_API_KEY. Run: TMDB_API_KEY=your_key node scripts/seed-journal.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Popular titles to search for
const titles = [
  { query: 'Dune 2024', type: 'movie' },
  { query: 'Oppenheimer', type: 'movie' },
  { query: 'Past Lives', type: 'movie' },
  { query: 'The Bear', type: 'tv' },
  { query: 'Succession', type: 'tv' },
  { query: 'Poor Things', type: 'movie' },
  { query: 'Saltburn', type: 'movie' },
  { query: 'Severance', type: 'tv' },
  { query: 'Alien Romulus', type: 'movie' },
  { query: 'White Lotus', type: 'tv' },
  { query: 'Nosferatu 2024', type: 'movie' },
  { query: 'Conclave', type: 'movie' },
];

async function searchTMDB({ query, type }) {
  const url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=1`;
  const res = await fetch(url);
  const data = await res.json();
  const result = data.results?.[0];
  if (!result) { console.warn(`No result for: ${query}`); return null; }
  return {
    tmdb_id: result.id,
    title: result.title || result.name,
    poster_path: result.poster_path,
    media_type: type,
  };
}

async function main() {
  // Fetch seed profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('username', ['maya', 'jake', 'priya', 'leo']);

  if (!profiles?.length) {
    console.error('No seed profiles found. Run the profile seed script first.');
    process.exit(1);
  }
  console.log(`Found ${profiles.length} seed profiles:`, profiles.map(p => p.username));

  // Fetch TMDB data for all titles
  console.log('Fetching TMDB data...');
  const movies = (await Promise.all(titles.map(searchTMDB))).filter(Boolean);
  console.log(`Got ${movies.length} titles from TMDB`);

  // Build journal entries — distribute movies across profiles
  const entries = [];
  const moods = ['😌 Cosy', '😮 Mind-blown', '😂 Fun', '😢 Emotional', '😱 Tense', null];
  const ratings = [3, 4, 5, 4, 5, 3, null];

  profiles.forEach((profile, pi) => {
    // Each profile gets a different subset of movies
    const slice = movies.slice(pi * 2, pi * 2 + 5).concat(movies.slice(0, 2));
    slice.forEach((movie, mi) => {
      const daysAgo = (pi + 1) * 3 + mi * 2;
      const watched_at = new Date(Date.now() - daysAgo * 86400000).toISOString();
      entries.push({
        user_id: profile.id,
        tmdb_id: movie.tmdb_id,
        title: movie.title,
        poster_path: movie.poster_path,
        media_type: movie.media_type,
        rating: ratings[(mi + pi) % ratings.length],
        mood: moods[(mi + pi) % moods.length],
        watched_at,
      });
    });
  });

  console.log(`Inserting ${entries.length} journal entries...`);
  const { error } = await supabase.from('journal').upsert(entries, { onConflict: 'user_id,tmdb_id' });
  if (error) {
    console.error('Insert error:', error.message);
    process.exit(1);
  }
  console.log('Done! Following feed should now show content.');
}

main();
