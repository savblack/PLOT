import { MemoryRouter } from 'react-router-dom';
import { AppContext } from '../hooks/useApp.js';
import { ProfileContent, profileStyles } from '../pages/PublicProfilePage.jsx';

// No fabricated TMDB identifiers. Title placeholders exercise missing artwork.
const titles = ['A quiet Sunday', 'The long way home', 'After the rain', 'A new beginning', 'One more day'].map((title, i) => ({ title, rank: i + 1, watched_at: '2026-09-16' }));
const watchlist = { isInList: () => false, toggle: () => {}, loading: false };
const app = { favorites: { isFavorite: () => false, toggleFavorite: () => {} }, profile: { region: 'AU' } };
export default {
  title: 'Views/PublicProfilePage', component: ProfileContent, parameters: { layout: 'fullscreen' },
  args: { profileId: 'story-profile', isOwn: true, openPanel: () => {}, watchlist, favouriteLabel: 'Favourites' },
  decorators: [(Story) => <MemoryRouter><AppContext.Provider value={app}>
    <style>{profileStyles}</style><main className="pp-view pp-journal"><div className="pp-pad"><header className="pp-header"><div className="pp-header-top"><div className="pp-avatar">A</div><div><h1 className="pp-name">Alex Morgan</h1><p className="pp-handle">@alex</p></div></div></header></div><Story /></main>
  </AppContext.Provider></MemoryRouter>],
};
export const Populated = { args: { topMovies: titles, topTv: titles.slice(0, 3), recent: titles, customLists: [
  { id: 'sunday', name: 'Sunday films', items: titles }, { id: 'weekend', name: 'Weekend watches', items: titles.slice(0, 2) },
] } };
export const OnePick = { args: { topMovies: titles.slice(0, 1) } };
export const EmptyOwner = { args: {} };
export const EmptyVisitor = { args: { isOwn: false } };
export const HiddenSections = { args: { ...Populated.args, customLists: [], sections: [] } };
export const Private = { args: { ...Populated.args, locked: true } };
export const LongListName = { args: { customLists: [{ id: 'long', name: 'Films I have been meaning to watch with everyone for the longest time', items: titles.slice(0, 1) }] } };
