import { useState } from 'react';
import { expect, fireEvent, waitFor, within } from 'storybook/test';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  defaultPickerOptions, pickerSentence, pickerFiltersSummary, pickerAnswers,
} from '@plot/core/tonightPicker.js';
import { smartListRulesFromPicker, normalizeSmartListRules, defaultSmartListRules } from '@plot/core/smartLists.js';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';
import { GENRE_MOODS, TONIGHT_PICKER } from '@plot/core/copy/tonightPicker.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { SMART_LIST_DIGEST } from '@plot/core/copy/notifications.js';
import { AppContext } from '../hooks/useApp.js';
import { TonightPage } from '../components/TonightView.jsx';
import SmartListDialog from '../components/SmartListDialog.jsx';
import MyListsView from '../components/MyListsView.jsx';
import ListPage from '../components/ListPage.jsx';
import UpgradeSheet from '../components/UpgradeSheet.jsx';
import { NotificationsPage } from '../components/NotificationsView.jsx';
import TITLES from './smartListTitles.fixture.json';

/* Smart lists, as chosen from the 28 Sep 2026 canvas: A1 (Create smart list
   on the Pick for Me shortlist), B1 (New list asks which kind), A2 (name it:
   the answers become rule chips with a live count), B3 (the rules stay on the
   list page as chips), A4 (coming back: "2 new", new matches grouped first),
   C4 (one weekly roll-up), A5 and B5 (Free).

   Titles and posters are real: smartListTitles.fixture.json was filled by
   searching TMDB by title through the staging proxy, never by guessing an id.
   Genre ids are TMDB's fixed genre list; 8 is TMDB's provider id for Netflix. */

const fixtureByName = Object.fromEntries(TITLES.map(t => [t.title, t]));
const pick = (...names) => names.map(n => fixtureByName[n]);

const GENRE_CATALOG = {
  movie: [[28, 'Action'], [35, 'Comedy'], [80, 'Crime'], [18, 'Drama'], [27, 'Horror'], [9648, 'Mystery'], [10749, 'Romance'], [878, 'Science Fiction'], [53, 'Thriller']]
    .map(([id, name]) => ({ id, name })),
  tv: [[35, 'Comedy'], [80, 'Crime'], [18, 'Drama'], [9648, 'Mystery'], [10765, 'Sci-Fi & Fantasy']]
    .map(([id, name]) => ({ id, name })),
};
const PICKER_GENRES = GENRE_CATALOG.movie.map(g => ({ ...g, mood: GENRE_MOODS[g.id] ?? null }));

const noop = () => {};
const resolved = () => Promise.resolve(true);
const profile = (premium = true) => ({ region: 'AU', is_premium: premium, streaming_providers: [{ id: 8, name: 'Netflix' }] });

/* ── A TMDB client and a seen-rows client with no network ── */

const discoverPage = (items) => async () => ({
  results: items.map(t => ({
    id: t.tmdb_id, title: t.title, name: t.title, poster_path: t.poster_path,
    release_date: t.release_date, first_air_date: t.release_date, genre_ids: t.genre_ids, vote_average: t.vote_average,
  })),
  total_pages: 1,
  total_results: items.length,
});
const tmdbClient = (movies, shows = []) => ({ discoverMovies: discoverPage(movies), discoverTV: discoverPage(shows) });

const seenClient = (row) => ({
  from: () => ({
    select: () => ({ in: async () => ({ data: row ? [row] : [], error: null }) }),
    upsert: async () => ({ error: null }),
  }),
});
const key = (t) => `${t.media_type}:${t.tmdb_id}`;

/* ── Pick for Me ── */

const THRILLER_ANSWERS = { ...defaultPickerOptions({ hasServices: true }), mediaType: 'movie', maxRuntime: 120, genreIds: [53, 9648] };
const SHORTLIST = pick('Heretic', 'Companion', 'Blink Twice', 'The Menu', 'Longlegs').map(t => ({
  id: t.tmdb_id, media_type: 'movie', title: t.title, poster_path: t.poster_path, backdrop_path: null,
  release_date: t.release_date, genre_ids: t.genre_ids, runtime: 100, vote_average: t.vote_average, providers: [], onWatchlist: false,
}));

function fakePicker({ phase = 'results', premium = true }) {
  const options = THRILLER_ANSWERS;
  return {
    options, setOption: noop, toggleGenre: noop, genres: PICKER_GENRES,
    hasServices: true, hasWatchlist: true,
    phase: premium ? phase : 'locked', mode: 'five', results: premium ? SHORTLIST : [], canSpinAgain: true,
    step: 3, goToStep: noop, nextStep: noop, prevStep: noop,
    sentence: pickerSentence(options, { genres: PICKER_GENRES, hasServices: true }),
    filtersSummary: pickerFiltersSummary(options, { hasServices: true }),
    answers: pickerAnswers(options, { genres: PICKER_GENRES }),
    go: noop, spinAgain: noop, backToOptions: noop, closeLock: noop, openPick: noop,
    savedSearches: [], isSaved: false, toggleSaveSearch: noop, removeSavedSearch: noop, openSavedSearch: noop,
  };
}

const THRILLER_PREVIEW = { count: 24, items: pick('Heretic', 'Companion', 'Blink Twice', 'The Menu').map(t => ({ ...t, id: key(t) })) };

const app = (premium = true, extra = {}) => ({
  user: { email: 'story@example.com' },
  profile: profile(premium),
  openPanel: noop,
  navigateTo: noop,
  topLists: { lists: { movies: [], tv: [] }, loading: false },
  favorites: { favorites: [], loading: false, isFavorite: () => false, toggleFavorite: resolved },
  watching: { items: [], loading: false },
  watchlist: { items: [], loading: false, isInList: () => false, toggle: resolved, removeFromList: resolved },
  privateNotes: null,
  customLists: {
    lists: [], smartLists: [], loading: false, ownedCount: 0,
    createList: resolved, createSmartList: async (name) => ({ id: 'new', name }), updateSmartList: resolved,
    deleteList: resolved, renameList: resolved, setListVisibility: resolved, addItem: resolved, removeItem: resolved,
  },
  ...extra,
});

function Tonight({ premium = true }) {
  return (
    <TonightPage premium={premium} picker={fakePicker({ premium })} onOpen={noop} navigate={noop}
      smartList={{ lists: [], create: async (name) => ({ id: 'new', name }), catalog: GENRE_CATALOG, preview: THRILLER_PREVIEW }} />
  );
}

export default {
  title: 'Pages/Smart lists',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, context) => (
      <MemoryRouter initialEntries={[context.parameters.route ?? '/']}>
        <AppContext.Provider value={context.parameters.app ?? app()}>
          <div className="app-main-inner" style={{ padding: '1rem 0 3rem' }}>
            <Story />
          </div>
        </AppContext.Provider>
      </MemoryRouter>
    ),
  ],
};

/** A1: the shortlist as it is today, with Create smart list beside Save search. */
export const A1ShortlistKeepFinding = {
  render: () => <Tonight />,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: new RegExp(TONIGHT_PICKER.createSmartList) })).toBeVisible();
    await expect(canvas.getByText(TONIGHT_PICKER.topPick)).toBeInTheDocument();
  },
};

/** A2 from Pick for Me (and, at phone width, the swipe-up save sheet). */
export const A2NameItFromPickForMe = {
  render: () => <Tonight />,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    fireEvent.click(canvas.getByRole('button', { name: new RegExp(TONIGHT_PICKER.createSmartList) }));
    const dialog = await body.findByRole('dialog', { name: SMART_LISTS.newSmartList });
    // The answers became the rules, and the name was written from them.
    await expect(within(dialog).getByText('Thriller or Mystery,')).toBeInTheDocument();
    await expect(within(dialog).getByLabelText(SMART_LISTS.nameLabel)).toHaveValue('Thriller and mystery movies, under 2 hours on my services');
    await expect(within(dialog).getByText(SMART_LISTS.liveCount(24))).toBeInTheDocument();
  },
};

const DRAMA_RULES = normalizeSmartListRules({ ...defaultSmartListRules(), mediaType: 'tv', genreIds: [18, 80], minScore: 7, onlyServices: true });
const DRAMA_PREVIEW = { count: 31, items: pick('Slow Horses', 'Severance', 'Mare of Easttown', 'The Bear').map(t => ({ ...t, id: key(t) })) };

/** A2 from My Lists: the same step, starting from rules rather than answers. */
export const A2NameItFromMyLists = {
  render: () => <SmartListDialog lists={[]} initialRules={DRAMA_RULES} onConfirm={resolved} onClose={noop} onPremium={noop}
    catalog={GENRE_CATALOG} preview={DRAMA_PREVIEW} />,
  tags: ['interaction-test'],
  play: async () => {
    const body = within(document.body);
    const dialog = await body.findByRole('dialog', { name: SMART_LISTS.newSmartList });
    // Tapping a chip offers its choices; picking one changes the rule.
    fireEvent.click(within(dialog).getByRole('button', { name: /rated 7\+/ }));
    fireEvent.click(await within(dialog).findByRole('menuitemradio', { name: '8+' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /rated 8\+/ })).toBeInTheDocument());
    await expect(within(dialog).getByLabelText(SMART_LISTS.nameLabel)).toHaveValue('Drama and crime shows, 8+ on my services');
  },
};

/** The chip menu and Add a rule, open. */
export const A2AddARule = {
  render: () => <SmartListDialog lists={[]} initialRules={DRAMA_RULES} onConfirm={resolved} onClose={noop} onPremium={noop}
    catalog={GENRE_CATALOG} preview={DRAMA_PREVIEW} />,
  play: async () => {
    const body = within(document.body);
    const dialog = await body.findByRole('dialog', { name: SMART_LISTS.newSmartList });
    fireEvent.click(within(dialog).getByRole('button', { name: SMART_LISTS.addRule }));
  },
};

/* ── My Lists ── */

const DISCOVER_THRILLERS = {
  id: 'short-thrillers', name: 'Short thrillers on my services',
  rules: smartListRulesFromPicker(THRILLER_ANSWERS, { hasServices: true }),
};
const DISCOVER_DRAMA = { id: 'drama-crime', name: 'Drama and crime shows, 7+', rules: DRAMA_RULES };
const listsApp = (premium = true) => app(premium, {
  watchlist: { items: pick('Heretic', 'Severance', 'The Bear').map(t => ({ ...t, id: key(t) })), loading: false, isInList: () => false, toggle: resolved, removeFromList: resolved },
  customLists: {
    ...app(premium).customLists,
    lists: [{ id: 'oscar', name: 'Oscar catch-up', items: pick('Sinners', 'Weapons').map(t => ({ ...t, id: key(t) })) }],
    smartLists: [DISCOVER_THRILLERS, DISCOVER_DRAMA],
    ownedCount: 3,
  },
});

// A shared list you started, with a fictional friend on it.
const sectionsApp = () => {
  const base = listsApp();
  return {
    ...base,
    user: { id: 'me', email: 'story@example.com' },
    customLists: {
      ...base.customLists,
      lists: [
        ...base.customLists.lists,
        { id: 'friday', name: 'Friday nights', role: 'owner', items: pick('Nightcrawler').map(t => ({ ...t, id: key(t) })),
          people: [{ user_id: 'me', display_name: 'Me' }, { user_id: 'f1', display_name: 'Jess Hart', username: 'jess' }] },
      ],
    },
  };
};

/** My Lists: Lists, then Smart lists, then Shared, in the page and the column. */
export const MyListsSections = {
  parameters: { app: sectionsApp(), route: '/my-lists' },
  render: () => <MyListsView newCounts={{ [DISCOVER_THRILLERS.id]: 2 }} />,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const headings = canvas.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    const at = (name) => headings.indexOf(name);
    await expect(at('Lists')).toBeGreaterThan(-1);
    await expect(at(SMART_LISTS.section)).toBeGreaterThan(at('Lists'));
    if (at('Shared') > -1) await expect(at('Shared')).toBeGreaterThan(at(SMART_LISTS.section));
    // Smart lists no longer mix into Lists.
    const smart = canvas.getByRole('heading', { level: 2, name: SMART_LISTS.section }).closest('section');
    await expect(within(smart).getAllByText(DISCOVER_THRILLERS.name).length).toBeGreaterThan(0);
  },
};

/** B1: New list asks which kind. */
export const B1NewListChoice = {
  parameters: { app: listsApp(), route: '/my-lists' },
  render: () => <MyListsView newCounts={{}} />,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    fireEvent.click(canvas.getByRole('button', { name: 'Create new list' }));
    await expect(await body.findByRole('menuitem', { name: new RegExp(`^${SMART_LISTS.kinds.smart.title}`) })).toBeVisible();
  },
};

/** A4: the index says what the weekly roll-up found. */
export const A4IndexMarker = {
  parameters: { app: listsApp(), route: '/my-lists' },
  render: () => <MyListsView newCounts={{ [DISCOVER_THRILLERS.id]: 2 }} />,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByText(SMART_LISTS.newCount(2)).length).toBeGreaterThan(0);
  },
};

const DRAMA_SHOWS = pick('Slow Horses', 'Severance', 'Mare of Easttown', 'The Bear', 'Only Murders in the Building', 'Adolescence');
const THRILLER_MOVIES = pick('Black Bag', 'Drop', 'Heretic', 'Companion', 'Blink Twice', 'The Menu', 'Longlegs', 'Nightcrawler');

const smartPage = (list, client, row) => ({
  parameters: { app: listsApp(), route: `/my-lists/list-${list.id}` },
  render: () => (
    <Routes>
      <Route path="/my-lists/:key" element={<ListPage smartList={{ clients: { tmdb: client, db: seenClient(row) }, catalog: GENRE_CATALOG }} />} />
    </Routes>
  ),
});

/** B3: the rules stay on the page as chips; tap one to change it. */
export const B3ListPage = {
  ...smartPage(DISCOVER_DRAMA, tmdbClient([], DRAMA_SHOWS), null),
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getAllByText('Slow Horses').length).toBeGreaterThan(0));
    await expect(canvas.getByRole('button', { name: /Drama or Crime/ })).toBeVisible();
    await expect(canvas.getByText(new RegExp(SMART_LISTS.tapHint))).toBeVisible();
  },
};

/** A4: a week later. New matches since the last visit lead, then the rest. */
export const A4ComingBack = {
  ...smartPage(DISCOVER_THRILLERS, tmdbClient(THRILLER_MOVIES), {
    list_id: DISCOVER_THRILLERS.id, user_id: 'u',
    seen_keys: THRILLER_MOVIES.slice(2).map(key), pending_keys: THRILLER_MOVIES.slice(0, 2).map(key),
    last_opened_at: '2026-09-22T09:00:00Z',
  }),
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fresh = await canvas.findByRole('region', { name: SMART_LISTS.newSince });
    await expect(within(fresh).getAllByText('Black Bag').length).toBeGreaterThan(0);
    await expect(within(fresh).queryAllByText('Heretic')).toHaveLength(0);
    await expect(canvas.getByRole('region', { name: SMART_LISTS.everythingElse })).toBeVisible();
  },
};

/* ── Notifications ── */

const now = Date.parse('2026-10-05T10:00:00');
const at = (h) => new Date(now - h * 3600 * 1000).toISOString();
const DIGEST = {
  id: 'd1', type: 'smart_list_digest', actor_id: null, created_at: at(13), read_at: null,
  smart_list_digest: {
    count: 5,
    lists: [{ id: 'films', name: 'New films worth it', count: 3 }, { id: DISCOVER_THRILLERS.id, name: DISCOVER_THRILLERS.name, count: 2 }],
    posters: pick('Sinners', 'Weapons', 'Black Bag').map(t => t.poster_path),
  },
};
// Fictional people; no account data.
const social = [
  { id: 's1', type: 'new_follower', created_at: at(60), read_at: at(20), actor_display_name: 'Jess Hart', actor_username: 'jess', actor_avatar_url: null },
  { id: 's2', type: 'follow_accepted', created_at: at(80), read_at: at(20), actor_display_name: 'Mia Lund', actor_username: 'mia', actor_avatar_url: null },
];

/** C4: one weekly roll-up line, never one per title. */
export const C4WeeklyRollUp = {
  render: () => <NotificationsPage list={[DIGEST, ...social]} requests={[]} loading={false} now={now}
    onApprove={noop} onDecline={noop} onOpen={noop} onOpenTitle={noop} onOpenPeople={noop} onOpenSmartLists={noop}
    onMarkAllRead={noop} wasUnread={n => !n.read_at} />,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Your smart lists found 5 new titles this week.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'See them' })).toBeVisible();
  },
};

/* ── Free ── */

/** A5: the Pick for Me gate gains one benefit line. */
export const A5FreeGate = {
  parameters: { app: app(false) },
  render: () => <Tonight premium={false} />,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(TONIGHT_PICKER.gate.newTag)).toBeVisible();
  },
};

/** B5: a Free viewer builds the rules and sees the count. */
export const B5FreeBuilder = {
  parameters: { app: app(false) },
  render: () => {
    function Free() {
      const [kept, setKept] = useState(false);
      return kept
        ? <UpgradeSheet reason="smartLists" kept onClose={() => setKept(false)} />
        : <SmartListDialog lists={[]} premium={false} initialRules={DRAMA_RULES} onConfirm={resolved} onClose={noop} onPremium={noop}
          onLocked={() => setKept(true)} catalog={GENRE_CATALOG} preview={DRAMA_PREVIEW} />;
    }
    return <Free />;
  },
};

/** B5: Create opens the upgrade sheet, and says the rules are kept. */
export const B5FreeRulesKept = {
  parameters: { app: app(false) },
  render: () => <UpgradeSheet reason="smartLists" kept onClose={noop} />,
  tags: ['interaction-test'],
  play: async () => {
    await expect(within(document.body).getByText(PLANS_PAGE.upgradeSheet.reasons.smartLists.kept)).toBeVisible();
  },
};

/* ── Weekly roll-up switch (PLO-513 extras) ──
   A new-discoveries list's page carries "Include in weekly roll-up", on by
   default. The weekly job (smart-list-digest) skips a list switched off.
   Lists of your own titles are never in the roll-up, so they have no switch. */

const OWN_SAVED = {
  id: 'saved-comedies', name: 'Comedies I saved',
  rules: normalizeSmartListRules({ source: 'watchlist', mediaType: 'any' }),
};
const ROLLUP_PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const ROLLUP_DARK = { backgrounds: { value: '#0c0c0c' } };

// The page with a customLists that remembers the switch, as the hook does.
function RollUpPage({ list, client, failing = false }) {
  const base = listsApp();
  const [smartLists, setSmartLists] = useState([list]);
  const value = {
    ...base,
    customLists: {
      ...base.customLists,
      smartLists,
      setSmartListDigest: async (id, enabled) => {
        if (failing) return false;
        setSmartLists(prev => prev.map(l => (l.id === id ? { ...l, digest_enabled: enabled } : l)));
        return true;
      },
    },
  };
  return (
    <AppContext.Provider value={value}>
      <Routes>
        <Route path="/my-lists/:key" element={<ListPage smartList={{ clients: { tmdb: client, db: seenClient(null) }, catalog: GENRE_CATALOG }} />} />
      </Routes>
    </AppContext.Provider>
  );
}
const rollUpStory = (list, { client = tmdbClient([], DRAMA_SHOWS), failing = false } = {}) => ({
  parameters: { route: `/my-lists/list-${list.id}` },
  render: () => <RollUpPage list={list} client={client} failing={failing} />,
});

/** The switch, on by default; switching it off says the list is left out. */
export const RollUpSwitch = {
  ...rollUpStory(DISCOVER_DRAMA),
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole('switch', { name: SMART_LISTS.rollUp });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(canvas.getByText(SMART_LISTS.rollUpOn)).toBeVisible();
    fireEvent.click(toggle);
    await waitFor(() => expect(canvas.getByRole('switch', { name: SMART_LISTS.rollUp })).toHaveAttribute('aria-checked', 'false'));
    await expect(canvas.getByText(SMART_LISTS.rollUpOff)).toBeVisible();
  },
};

/** Already switched off, in Dark. */
export const RollUpSwitchOffDark = {
  ...rollUpStory({ ...DISCOVER_DRAMA, digest_enabled: false }),
  globals: ROLLUP_DARK,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const toggle = await within(canvasElement).findByRole('switch', { name: SMART_LISTS.rollUp });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  },
};

/** On a phone. Chromatic ignores the viewport global, so the width is named for it too. */
export const RollUpSwitchPhone = {
  ...rollUpStory(DISCOVER_DRAMA),
  globals: ROLLUP_PHONE,
  parameters: { route: `/my-lists/list-${DISCOVER_DRAMA.id}`, chromatic: { viewports: [414] } },
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('switch', { name: SMART_LISTS.rollUp })).toBeVisible();
  },
};

/** A save that fails puts the switch back and says so. */
export const RollUpSwitchFails = {
  ...rollUpStory(DISCOVER_DRAMA, { failing: true }),
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    fireEvent.click(await canvas.findByRole('switch', { name: SMART_LISTS.rollUp }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(SMART_LISTS.rollUpFailed);
    await expect(canvas.getByRole('switch', { name: SMART_LISTS.rollUp })).toHaveAttribute('aria-checked', 'true');
  },
};

/** Your own titles are never in the roll-up: no switch. */
export const RollUpHiddenForOwnTitles = {
  ...rollUpStory(OWN_SAVED),
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /my watchlist/ });
    await expect(canvas.queryByRole('switch', { name: SMART_LISTS.rollUp })).toBeNull();
  },
};

/** C4 with its quiet footer: where to switch a list out. */
export const C4WeeklyRollUpManage = {
  render: () => <NotificationsPage list={[DIGEST, ...social]} requests={[]} loading={false} now={now}
    onApprove={noop} onDecline={noop} onOpen={noop} onOpenTitle={noop} onOpenPeople={noop} onOpenSmartLists={noop}
    onManageSmartLists={noop} onMarkAllRead={noop} wasUnread={n => !n.read_at} />,
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(SMART_LIST_DIGEST.manageBody)).toBeVisible();
    await expect(canvas.getByRole('button', { name: new RegExp(SMART_LIST_DIGEST.manageLink) })).toBeVisible();
  },
};
