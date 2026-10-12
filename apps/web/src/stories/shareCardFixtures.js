import profileTitles from './profileTitles.fixture.json';
import smartListTitles from './smartListTitles.fixture.json';
import collabListTitles from './collabListTitles.fixture.json';

/* TMDB IDs and posters in these committed fixtures came from TMDB responses.
   Visual stories use them without network requests during snapshots. */

// The owner's Top 5s, for the share cards.
const TOP5 = {
  movies: ['Past Lives', 'Aftersun', 'Anatomy of a Fall', 'Perfect Days', 'The Brutalist'],
  tv: ['The Bear', 'Severance', 'Slow Horses', 'Adolescence', 'The White Lotus'],
};
const titles = [...profileTitles, ...smartListTitles, ...collabListTitles];
const title = (name, type) => {
  const found = titles.find(item => item.title === name && item.media_type === type);
  if (!found) throw new Error(`Missing Storybook title fixture: ${name} (${type})`);
  return found;
};

export const FIXTURE_PROFILE = { id: 'story', username: 'savannah', display_name: 'Savannah', region: 'AU' };

const TOP_LISTS = Object.fromEntries(Object.entries(TOP5).map(([kind, names]) => [kind, names.map((name, i) => {
    const media_type = kind === 'tv' ? 'tv' : 'movie';
    return { ...title(name, media_type), rank: i + 1, list_type: kind };
  })]));

export function useFixtureTopLists() {
  return TOP_LISTS;
}
