// "My Channels" (profile.guide_channels) stores TMDB watch-provider names
// (e.g. "ABC iview", "SBS On Demand", "7plus"). The Guide's on-air schedule
// comes from TVMaze, which names the same broadcasters differently
// (e.g. "ABC", "SBS", "Seven"). Matching the raw strings never succeeds, so
// this table maps known TMDB provider names to their TVMaze network /
// webChannel equivalents, with a normalized-substring fallback for anything
// not explicitly listed.

const KNOWN_ALIASES = {
  // Australia
  'abc iview':        ['abc'],
  'sbs on demand':    ['sbs'],
  '7plus':            ['seven'],
  '9now':             ['nine'],
  '10 play':          ['network 10', '10'],
  // United States
  'pluto tv':         ['pluto tv'],
  'tubi':             ['tubi'],
  'the roku channel': ['the roku channel'],
  'peacock free':     ['nbc'],
  // United Kingdom
  'bbc iplayer':      ['bbc one', 'bbc two'],
  'itvx':             ['itv'],
  'all 4':            ['channel 4'],
  'my5':              ['channel 5'],
};

// Suffixes TMDB/TVMaze append that carry no identifying information.
const NOISE_WORDS = ['iview', 'on demand', 'iplayer', 'play', 'now', 'plus', 'channel', 'network', 'tv'];

function normalize(name) {
  let n = (name || '').toLowerCase().trim();
  for (const word of NOISE_WORDS) {
    n = n.replace(new RegExp(`\\b${word}\\b`, 'g'), '');
  }
  return n.replace(/\s+/g, ' ').trim();
}

// True if a TMDB "My Channels" provider name refers to the same broadcaster
// as a TVMaze network/webChannel name.
export function channelNamesMatch(tmdbName, tvMazeName) {
  const tmdbLower  = (tmdbName || '').toLowerCase().trim();
  const tvMazeLower = (tvMazeName || '').toLowerCase().trim();
  if (!tmdbLower || !tvMazeLower) return false;
  if (tmdbLower === tvMazeLower) return true;

  const aliases = KNOWN_ALIASES[tmdbLower];
  if (aliases?.includes(tvMazeLower)) return true;

  const tmdbNorm   = normalize(tmdbLower);
  const tvMazeNorm = normalize(tvMazeLower);
  if (!tmdbNorm || !tvMazeNorm) return false;
  return tmdbNorm === tvMazeNorm || tmdbNorm.includes(tvMazeNorm) || tvMazeNorm.includes(tmdbNorm);
}
