import { MemoryRouter } from 'react-router-dom';
import { NotificationsPage } from '../components/NotificationsView.jsx';

// Fictional people; no account data.
const now = Date.parse('2026-09-17T10:00:00');
const at = (h) => new Date(now - h * 3600 * 1000).toISOString();
const person = (name, username) => ({ actor_display_name: name, actor_username: username, actor_avatar_url: null });
const list = [
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
  args: { list, requests, loading: false, now, onApprove: () => {}, onDecline: () => {}, onOpen: () => {}, wasUnread: n => !n.read_at },
  decorators: [(Story) => <MemoryRouter><Story /></MemoryRouter>],
};
export const Full = {};
export const NoRequests = { args: { requests: [] } };
export const Empty = { args: { list: [], requests: [] } };
