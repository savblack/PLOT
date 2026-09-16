import resolvedTitles from './profileTitles.fixture.json';
import { MemoryRouter } from 'react-router-dom';
import { AppContext } from '../hooks/useApp.js';
import { ProfileContent, ProfileIntro, profileStyles } from '../pages/PublicProfilePage.jsx';

// TMDB artwork and IDs resolved by title search on 17 September 2026.
// Fictional identity and activity; no account data.
const titles = ['A quiet Sunday', 'The long way home', 'After the rain', 'A new beginning', 'One more day'].map((title, i) => ({ title, rank: i + 1, watched_at: '2026-09-16' }));
const watchlist = { isInList: () => false, toggle: () => {}, loading: false };
const app = { favorites: { isFavorite: () => false, toggleFavorite: () => {} }, profile: { region: 'AU' } };
export default {
  title: 'Views/PublicProfilePage', component: ProfileContent, parameters: { layout: 'fullscreen' },
  args: { profileId: 'story-profile', isOwn: true, openPanel: () => {}, watchlist, favouriteLabel: 'Favourites' },
  decorators: [(Story) => <MemoryRouter><AppContext.Provider value={app}>
    <style>{profileStyles}</style><main className="pp-view"><div className="pp-pad"><ProfileIntro name="Alex Morgan" username="alex" bio="Films, TV, and a good ending."
      stats={<div className="pp-stats"><span className="pp-stat"><span className="pp-stat-num">248</span><span className="pp-stat-label">watched</span></span><span className="pp-stat"><span className="pp-stat-num">86</span><span className="pp-stat-label">followers</span></span></div>}
      actions={<div className="pp-btn-row"><button className="btn btn-primary">Follow Alex</button><button className="btn btn-secondary">Share profile</button></div>} /></div><Story /></main>
  </AppContext.Provider></MemoryRouter>],
};
export const Populated = { args: { topMovies: resolvedTitles.slice(0, 5).map((item, i) => ({ ...item, rank: i + 1 })), recent: resolvedTitles.slice(4).map(item => ({ ...item, watched_at: '2026-09-14' })), customLists: [
  { id: 'sunday', name: 'Sunday films', items: resolvedTitles.slice(0, 3) }, { id: 'weekend', name: 'Weekend watches', items: resolvedTitles.slice(0, 2) },
] } };
export const BothTypes = { args: { ...Populated.args, topTv: resolvedTitles.slice(4) } };
export const OnePick = { args: { topMovies: titles.slice(0, 1) } };
export const EmptyOwner = { args: {} };
export const EmptyVisitor = { args: { isOwn: false } };
export const HiddenSections = { args: { ...Populated.args, customLists: [], sections: [] } };
export const Private = { args: { ...Populated.args, locked: true } };
export const LongListName = { args: { customLists: [{ id: 'long', name: 'Films I have been meaning to watch with everyone for the longest time', items: titles.slice(0, 1) }] } };
