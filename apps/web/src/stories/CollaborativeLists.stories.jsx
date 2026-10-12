import { useEffect } from 'react';
import { expect, fireEvent, waitFor, within } from 'storybook/test';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configure, getConfig } from '@plot/core/config.js';
import { COLLABORATIVE_LISTS as C } from '@plot/core/copy/collaborativeLists.js';
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { AppContext } from '../hooks/useApp.js';
import MyListsView from '../components/MyListsView.jsx';
import ListPage from '../components/ListPage.jsx';
import ListInvitePage from '../components/ListInvitePage.jsx';
import MediaPanel from '../components/MediaPanel.jsx';
import { NewSharedListDialog } from '../components/CollaborativeListParts.jsx';
import { AcceptDialog, SharedListPeopleDialog, WatchTogetherTile } from '../components/WatchTogetherParts.jsx';
import resolvedTitles from './collabListTitles.fixture.json';

/* Collaborative lists, the redesign Savannah picked on 2 Oct 2026 from the
   options canvas: B1 with A1's ⋯ menu, the three ways in (A2, B2, C2), the
   invite landing (A3/A4 with no titles, B3/B4 once there are some), the list
   page (B5 with A5's header merged into its people panel, plus Watch
   together, sort, grid and list views), adding from a title (A6) and the
   phone (A7/B7, A8).

   TMDB ids and poster paths in collabListTitles.fixture.json were resolved
   by title search through the Staging TMDB proxy on 2 Oct 2026. People are
   fictional; nothing here reads or writes account data. A stub Supabase
   client answers the few reads the dialogs make (the invite key, whether the
   host has Premium, who you watch together with). */

configure({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  tmdbProxyUrl: import.meta.env.VITE_TMDB_PROXY_URL,
  isDev: true,
});

const noop = () => {};
const resolved = () => Promise.resolve(true);
const DAY = 24 * 60 * 60 * 1000;
const FIXTURE_NOW = Date.parse('2026-10-02T12:00:00Z');
const ago = (days) => new Date(FIXTURE_NOW - days * DAY).toISOString();

const person = (user_id, display_name, username, extra = {}) => ({ user_id, display_name, username, avatar_url: null, ...extra });
const mia   = person('u-mia', 'Mia', 'mia');
const sam   = person('u-sam', 'Sam', 'samk');
const priya = person('u-priya', 'Priya', 'priya');
const jo    = person('u-jo', 'Jo', 'jo.w');
const rosa  = person('u-rosa', 'Rosa', 'rosa');
const tom   = person('u-tom', 'Tom', 'tom');

const item = (t, added_by, days) => ({ id: `row-${t.tmdb_id}`, tmdb_id: t.tmdb_id, title: t.title, media_type: t.media_type, poster_path: t.poster_path, added_by, added_at: ago(days) });
const adders = ['u-sam', 'u-priya', null, 'u-jo'];
const friday = {
  id: 'friday', user_id: 'u-mia', role: 'owner', name: 'Friday film club', visibility: 'private', is_public: false,
  people: [{ ...mia, is_owner: true }, sam, priya, jo],
  items: resolvedTitles.map((t, i) => item(t, adders[i % 4], [2, 3, 5, 7, 8, 14, 15, 16, 20, 22, 25, 30][i])),
};
const samAndMia = {
  id: 'sam-mia', user_id: 'u-sam', role: 'member', name: 'Sam & Mia', visibility: 'private',
  people: [{ ...sam, is_owner: true }, mia],
  items: resolvedTitles.slice(4, 8).map((t, i) => item(t, i % 2 ? 'u-mia' : 'u-sam', i + 1)),
};
const bookClub = {
  id: 'book-club', user_id: 'u-rosa', role: 'member', name: 'Book club watchlist', visibility: 'private',
  people: [{ ...rosa, is_owner: true }, tom, mia],
  items: resolvedTitles.slice(7, 12).map((t, i) => item(t, i % 2 ? 'u-tom' : 'u-rosa', i + 2)),
};
const cosy = {
  id: 'cosy', user_id: 'u-mia', role: 'owner', name: 'Cosy autumn', visibility: 'private', people: [],
  items: resolvedTitles.slice(5, 9).map(t => item(t, null, 9)),
};

const partners = [sam, priya, jo, rosa].map(p => ({
  other_id: p.user_id, username: p.username, display_name: p.display_name, avatar_url: null,
  direction: 'paired', created_at: ago(40), accepted_at: ago(39), i_share_full: false, overlap_count: 11, can_decide: true,
}));

/* The stub Supabase client: rpc answers by name, and every table read
   resolves empty. Swapped in for each story and back out after it. */
const rpcAnswers = {
  my_list_invite: 'k7Qm2x',
  reset_list_invite: 'n3Wp8z',
  list_host_is_premium: true,
  list_watch_together: partners,
  watch_together_status: [{ state: 'paired', overlap_count: 11 }],
};
function emptyQuery() {
  const result = { data: [], error: null };
  const chain = new Proxy(function query() {}, {
    get(_target, prop) {
      if (prop === 'then') return (ok, fail) => Promise.resolve(result).then(ok, fail);
      return () => chain;
    },
  });
  return chain;
}
const stubClient = {
  rpc: async (name) => ({ data: rpcAnswers[name] ?? null, error: null }),
  from: () => emptyQuery(),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: noop,
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
  },
};
function WithStubClient({ children }) {
  useEffect(() => () => { configure({ supabaseClient: undefined }); }, []);
  return children;
}

const premium = { region: 'GB', is_premium: true, display_name: 'Mia', username: 'mia', is_public: true };
const app = (overrides = {}) => ({
  user: { id: 'u-mia', email: 'story@example.com' },
  profile: premium,
  openPanel: noop,
  navigateTo: noop,
  topLists:    { lists: { movies: [], tv: [] }, loading: false, setSlot: resolved, removeSlot: resolved, moveUp: resolved, moveDown: resolved },
  favorites:   { favorites: [], loading: false, isFavorite: () => false, toggleFavorite: resolved },
  customLists: {
    lists: [cosy, friday, samAndMia, bookClub], smartLists: [], loading: false,
    createList: async (name) => ({ id: 'new-list', name }), createSharedList: async () => 'new-list',
    deleteList: resolved, renameList: resolved, setListVisibility: resolved, addItem: resolved, removeItem: resolved,
    addMember: resolved, leaveList: resolved, refresh: resolved, isInList: () => false,
  },
  watching:    { items: [], loading: false, stopWatching: resolved, fetchSeason: async () => null },
  watchlist:   { items: resolvedTitles.slice(0, 3).map(t => ({ ...t, id: `w-${t.tmdb_id}` })), loading: false, removeFromList: resolved, isInList: () => false, toggle: resolved },
  ...overrides,
});

const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
// Chromatic ignores the viewport global and renders every story at its own
// default width (1200px), so phone stories also name their width for it.
// 'mobile2' is Storybook's 414 x 896 large phone.
const phone = (story) => ({
  ...story,
  globals: PHONE,
  parameters: { ...story.parameters, chromatic: { ...story.parameters?.chromatic, viewports: [414] } },
});
const DARK = { backgrounds: { value: 'dark' } };

export default {
  title: 'Views/CollaborativeLists',
  parameters: { layout: 'fullscreen', app: app() },
  decorators: [
    (Story, context) => {
      // Before the first render, so the dialogs' first reads hit the stub.
      if (getConfig().supabaseClient !== stubClient) configure({ supabaseClient: stubClient });
      return (
        <WithStubClient>
          <MemoryRouter initialEntries={[context.parameters.route ?? '/my-lists']}>
            <AppContext.Provider value={context.parameters.app}>
              <div className="app-main-inner" style={{ padding: '1rem 0 3rem', minHeight: '100vh', background: 'var(--bg)' }}>
                <Story />
              </div>
            </AppContext.Provider>
          </MemoryRouter>
        </WithStubClient>
      );
    },
  ],
};

/* ── My Lists (B1, with A1's ⋯ menu) ── */

export const MyListsShared = { render: () => <MyListsView /> };

/* A1's popover on a cover: rename, invite, share, delete. */
export const MyListsCoverMenu = {
  render: () => <MyListsView />,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    fireEvent.click(canvas.getByRole('button', { name: C.myLists.listOptions('Friday film club') }));
    await expect(await canvas.findByRole('button', { name: C.invite })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: C.myLists.rename })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: C.myLists.delete })).toBeInTheDocument();
  },
};

/* A list you joined offers Leave instead of Delete. */
export const MyListsJoinedListMenu = {
  render: () => <MyListsView />,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(C.myLists.from('Sam'))).toBeInTheDocument();
    fireEvent.click(canvas.getByRole('button', { name: C.myLists.listOptions('Sam & Mia') }));
    await expect(await canvas.findByRole('button', { name: T.sharedList.leave })).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: C.myLists.delete })).toBeNull();
  },
};

/* ── The three ways in ── */

/* A2: Invite people from a cover's ⋯ opens the invite link dialog. */
export const InviteFromListMenu = {
  render: () => <MyListsView />,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    fireEvent.click(canvas.getByRole('button', { name: C.myLists.listOptions('Cosy autumn') }));
    fireEvent.click(await canvas.findByRole('button', { name: C.invite }));
    const dialog = await body.findByRole('dialog', { name: C.invite });
    await waitFor(() => expect(within(dialog).getByText(/join-list\/k7Qm2x/)).toBeVisible());
  },
};

/* B2: New shared list, from My Lists. */
export const NewSharedList = {
  render: () => <NewSharedListDialog partners={partners} onClose={noop} />,
};

/* S1: on Free, New shared list opens the upgrade sheet instead. */
export const NewSharedListFree = {
  parameters: { app: app({ profile: { ...premium, is_premium: false } }) },
  render: () => <MyListsView />,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    fireEvent.click(canvas.getAllByRole('button', { name: C.myLists.newShared })[0]);
    await expect(await body.findByRole('dialog', { name: PLANS_PAGE.upgradeSheet.reasons.collaborativeLists.title })).toBeVisible();
  },
};

/* C2: from a friend's profile, next to Watch together. */
export const StartListFromProfile = {
  render: () => (
    <div style={{ maxWidth: 420, padding: '0 1rem' }}>
      <WatchTogetherTile person={{ id: 'u-sam', username: 'samk', display_name: 'Sam', is_public: true }} viewer={{ id: 'u-mia' }} viewerProfile={premium} />
    </div>
  ),
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    fireEvent.click(await canvas.findByRole('button', { name: C.startWith.action('Sam') }));
    await expect(await body.findByRole('dialog', { name: C.startWith.action('Sam') })).toBeInTheDocument();
  },
};

/* ── The invite landing (A3, A4 with no titles; B3, B4 with titles) ── */

const preview = (overrides = {}) => ({
  list_id: null, list_name: 'Friday film club', item_count: 12, owner_id: 'u-mia',
  username: 'mia', display_name: 'Mia', avatar_url: null, host_premium: true, state: 'none', ...overrides,
});
const peek = {
  member_count: 2,
  members: [{ display_name: 'Sam', avatar_url: null }, { display_name: 'Priya', avatar_url: null }],
  posters: resolvedTitles.slice(0, 5).map(t => t.poster_path),
};
const landing = ({ signedIn, items }) => ({
  parameters: {
    route: '/join-list/k7Qm2x',
    app: app({ user: signedIn ? { id: 'u-jo' } : null, profile: signedIn ? { region: 'GB', display_name: 'Jo' } : null }),
  },
  render: () => (
    <Routes>
      <Route path="/join-list/:key" element={(
        <ListInvitePage
          loadPreview={async () => preview({ item_count: items ? 12 : 0, state: signedIn ? 'none' : null })}
          loadPeek={async () => (items ? peek : { member_count: 2, members: peek.members, posters: [] })}
        />
      )} />
    </Routes>
  ),
});

export const LandingEmptySignedOut = landing({ signedIn: false, items: false });
export const LandingEmptySignedIn = landing({ signedIn: true, items: false });
export const LandingTitlesSignedOut = {
  ...landing({ signedIn: false, items: true }),
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(C.landing.invitedToJoin('Mia'))).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Friday film club' })).toBeVisible();
    await expect(canvas.getByLabelText(C.landing.members(['Mia', 'Sam', 'Priya'], 0, 12))).toBeVisible();
  },
};
export const LandingTitlesSignedIn = {
  ...landing({ signedIn: true, items: true }),
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: C.landing.join })).toBeVisible();
    await expect(canvas.getByText(C.landing.whereNote('Mia'))).toBeVisible();
  },
};
export const PhoneLandingEmpty  = phone(landing({ signedIn: false, items: false }));
export const PhoneLandingTitles = phone(landing({ signedIn: false, items: true }));

/* ── The shared list page (B5 + A5) ── */

const listPage = {
  parameters: { route: '/my-lists/list-friday' },
  render: () => <Routes><Route path="/my-lists/:key" element={<ListPage />} /></Routes>,
};

export const SharedListGrid = {
  ...listPage,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(C.page.summary(['You', 'Sam', 'Priya', 'Jo'], 12))).toBeInTheDocument();
    await expect(canvas.getAllByRole('button', { name: T.navLabel }).length).toBeGreaterThan(0);
    await expect(canvas.getAllByText(T.sharedList.addedBy('Sam')).length).toBeGreaterThan(0);
  },
};

export const SharedListRows = {
  ...listPage,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    fireEvent.click(canvas.getByRole('button', { name: CUSTOM_LISTS.listView }));
  },
};

export const SharedListDark = { ...listPage, globals: DARK };

/* Titles added over a week ago show a date in the viewer's own order:
   day first for a UK viewer (the default app here), month first in the US. */
export const SharedListRowsUS = {
  ...SharedListRows,
  parameters: { route: '/my-lists/list-friday', app: app({ profile: { ...premium, region: 'US' } }) },
};

/* The people rows are the Added by filter. */
export const SharedListFilteredBySam = {
  ...listPage,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('group', { name: C.page.filterBy });
    await expect(canvas.queryAllByText('Perfect Days').length).toBeGreaterThan(0);
    fireEvent.click(within(group).getByRole('button', { name: /^Sam/ }));
    await waitFor(() => expect(canvas.queryAllByText('Perfect Days')).toHaveLength(0));
    await expect(canvas.queryAllByText('Past Lives').length).toBeGreaterThan(0);
    // Sort still applies to the filtered titles.
    fireEvent.click(canvas.getByRole('button', { name: CUSTOM_LISTS.sortList }));
    fireEvent.click(await canvas.findByRole('button', { name: CUSTOM_LISTS.titleAscending }));
  },
};

/* A member's view: Shared by Sam, Add people instead of Invite people. */
export const SharedListAsMember = {
  parameters: { route: '/my-lists/list-sam-mia' },
  render: listPage.render,
};

/* ── The phone list (A8) ── */

export const PhoneSharedList = phone(listPage);

/* Tapping the people opens who added what, with Add a person and Watch together. */
// Tags stay literal on the story object: the Vitest addon reads them
// statically, and inside phone(...) it cannot, so the test would be skipped.
export const PhonePeopleSheet = {
  ...phone(listPage),
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    fireEvent.click(canvas.getByRole('button', { name: C.page.peopleButton(4) }));
    const sheet = await body.findByRole('dialog', { name: C.page.onThisList });
    await expect(within(sheet).getAllByText(C.page.added(3))).toHaveLength(4);
    await expect(within(sheet).getByRole('button', { name: C.page.addPerson })).toBeInTheDocument();
    await expect(within(sheet).getByRole('button', { name: T.navLabel })).toBeInTheDocument();
  },
};

/* The search button in the bar searches this list's titles. */
export const PhoneInListSearch = {
  ...phone(listPage),
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    fireEvent.click(canvas.getByRole('button', { name: C.page.searchOpen }));
    const search = canvas.getByLabelText(CUSTOM_LISTS.searchThisList, { selector: 'input' });
    await fireEvent.input(search, { target: { value: 'after' } });
    await waitFor(() => expect(canvas.queryAllByText('Perfect Days')).toHaveLength(0));
    await expect(canvas.queryAllByText('Aftersun').length).toBeGreaterThan(0);
  },
};

/* ── Existing Watch together dialogs, for checking their padding ── */

export const WatchTogetherAcceptDialog = {
  render: () => <AcceptDialog person={{ display_name: 'Sam', username: 'samk' }} viewer={{ id: 'u-mia', is_public: false }} onAccept={noop} onDecline={noop} onClose={noop} />,
};
export const SharedListAddPeopleDialog = {
  render: () => <SharedListPeopleDialog list={samAndMia} onAdd={resolved} onClose={noop} />,
};

/* ── Adding from a title (A6): shared lists among yours, with their people ── */

export const AddFromTitle = {
  // The underlying MediaPanel loads live TMDB and provider content.
  parameters: { chromatic: { disableSnapshot: true }, app: app({
    user: null,
    // The panel's own needs, as in MediaPanel.stories.jsx.
    watchlist: { items: [], isInList: () => false, toggle: noop, removeFromList: noop },
    watching: { isWatching: () => false, getProgress: () => null, startWatching: noop, stopWatching: noop, setProgress: noop, markEpisodeWatched: noop },
    favorites: { isFavorite: () => false, toggleFavorite: noop },
    topLists: { slots: [], lists: { movies: [], tv: [] }, setSlot: noop, removeSlot: noop },
  }) },
  render: () => <MediaPanel itemId={resolvedTitles[0].tmdb_id} itemType="movie" initialListOpen closing={false} onClose={noop} />,
};
