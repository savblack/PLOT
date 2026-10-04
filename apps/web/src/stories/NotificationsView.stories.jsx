import { MemoryRouter } from 'react-router-dom';
import { NotificationsPage } from '../components/NotificationsView.jsx';

// Fictional people; no account data.
const now = Date.parse('2026-09-17T10:00:00');
const at = (h) => new Date(now - h * 3600 * 1000).toISOString();
const person = (name, username) => ({ actor_display_name: name, actor_username: username, actor_avatar_url: null });
// Fictional titles and people. tmdb_id 0 is deliberately not a real TMDB id
// (AGENTS.md: never guess one), and there are no poster paths, so the
// placeholder slot renders.
const alert = (type, media_title, extra) => ({ actor_id: null, tmdb_id: 0, media_poster_path: null, media_title, type, ...extra });
const episode = (season_number, episode_number, episode_count, media_title) => ({
  type: 'new_episode', actor_id: null, tmdb_id: 0, media_type: 'tv', season_number, episode_number, episode_count, media_title, media_poster_path: null,
});
const movie = (media_title, release_kind) => ({
  type: 'movie_release', actor_id: null, tmdb_id: 0, media_type: 'movie', release_kind, media_title, media_poster_path: null,
});
const arrival = (media_title, release_kind, provider_name) => ({
  type: 'streaming_arrival', actor_id: null, tmdb_id: 0, media_type: 'movie', release_kind, provider_name, media_title, media_poster_path: null,
});
const list = [
  { id: 'a1', created_at: at(1), read_at: null, ...alert('person_release', 'Harbour Lights', { media_type: 'movie', person_name: 'Ada Quill', person_role: 'cast', release_kind: 'theatrical' }) },
  { id: 'a3', created_at: at(1), read_at: null, ...alert('person_release', 'East Pier', { media_type: 'tv', person_name: 'Ada Quill', person_role: 'cast', release_kind: 'premiere', provider_name: 'Service One' }) },
  { id: 'a4', created_at: at(1), read_at: null, ...alert('person_release', 'Digger Bay', { media_type: 'movie', person_name: 'Ben Arlo', person_role: 'director', release_kind: 'theatrical' }) },
  { id: 'a5', created_at: at(30), read_at: at(20), ...alert('person_release', 'Slow Lane', { media_type: 'tv', person_name: 'Cy Moss', person_role: 'cast', release_kind: 'season', season_number: 6, episode_count: 1, provider_name: 'Service Two' }) },
  { id: 'e1', created_at: at(2), read_at: null, ...episode(5, 1, 1, 'Quiet Hours') },
  { id: 'a2', created_at: at(3), read_at: null, ...alert('season_ready', 'The Night Desk', { media_type: 'tv', season_number: 2, provider_name: 'Service One' }) },
  { id: 'e2', created_at: at(4), read_at: null, ...episode(2, 1, 8, 'Low Tide') },
  { id: 'm1', created_at: at(3), read_at: null, ...movie('Salt Lake Drive', 'theatrical') },
  { id: 'm2', created_at: at(5), read_at: null, ...movie('The Long Way Round', 'digital') },
  { id: 's1', created_at: at(3), read_at: null, ...arrival('Harbour Lights', 'streaming', 'Service One') },
  { id: 's2', created_at: at(6), read_at: null, ...arrival('Salt Lake Drive', 'free', 'Service Two') },
  { id: 'e3', created_at: at(26), read_at: at(20), ...episode(3, 4, 1, 'Small Mercies') },
  { id: '1', type: 'follow_request', created_at: at(2), read_at: null, ...person('Priya Nair', 'priya') },
  { id: '2', type: 'new_follower', created_at: at(4), read_at: null, ...person('Tom Reilly', 'tomr') },
  { id: '3', type: 'follow_accepted', created_at: at(6), read_at: null, ...person('Mei Chen', 'meichen') },
  { id: '4', type: 'new_follower', created_at: at(28), read_at: at(20), ...person('Jordan Blake', 'jblake') },
  { id: '5', type: 'post_like', created_at: at(30), read_at: at(20), post_title: 'Past Lives', ...person('Ravi Desai', 'ravid') },
  { id: '6', type: 'new_follower', created_at: at(24 * 3), read_at: at(20), ...person('Lena Kowalski', 'lenak') },
  { id: '7', type: 'follow_accepted', created_at: at(24 * 9), read_at: at(20), ...person('Alex Morgan', 'alex') },
];
const requests = [
  { follower_id: 'r1', display_name: 'Priya Nair', username: 'priya', avatar_url: null },
  { follower_id: 'r2', display_name: 'Sam Okafor', username: 'samo', avatar_url: null },
];
export default {
  title: 'Pages/Notifications', component: NotificationsPage, parameters: { layout: 'fullscreen' },
  args: { list, requests, loading: false, now, onApprove: () => {}, onDecline: () => {}, onOpen: () => {}, onOpenTitle: () => {}, onOpenPeople: () => {}, onMarkAllRead: () => {}, wasUnread: n => !n.read_at },
  decorators: [(Story) => <MemoryRouter><Story /></MemoryRouter>],
};
export const Full = {};
export const NoRequests = { args: { requests: [] } };
export const CaughtUp = { args: { requests: [], wasUnread: () => false } };
export const Empty = { args: { list: [], requests: [] } };
/** First week of the month: last month wrapped, with the share card offered. */
export const MonthWrap = { args: { requests: [], moment: { year: 2026, month: 7, monthName: 'August', key: '2026-08', count: 14, sentence: '14 titles and a 4-day streak. Your busiest month.' }, onShareMoment: () => {}, onDismissMoment: () => {} } };
