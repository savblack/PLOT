import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultSmartListRules, normalizeSmartListRules, smartListRulesFromPicker, smartListSentence,
  setSmartListRule, removeSmartListRule, addableSmartListRules, isRemovableSmartListRule,
  smartListRuleChoices, suggestSmartListName, previewSmartList,
  serialiseSmartListDraft, parseSmartListDraft, smartListDraftKey, SMART_LIST_DRAFT_TTL_MS,
} from '../../smartLists.js';
import { defaultPickerOptions, _resetPickerCache } from '../../tonightPicker.js';

// Genre ids are TMDB's fixed genre list (not title ids); names as TMDB gives them.
const GENRES = [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }, { id: 53, name: 'Thriller' }, { id: 9648, name: 'Mystery' }];
const rules = (over = {}) => normalizeSmartListRules({ ...defaultSmartListRules(), ...over });
const text = (parts) => parts.map(p => p.text).join(' ');
const chips = (parts) => parts.filter(p => p.kind === 'chip').map(p => p.rule);

test('Just Decide answers become discover rules, keeping what has a rule', () => {
  const options = { ...defaultPickerOptions({ hasServices: true }), mediaType: 'movie', maxRuntime: 120, genreIds: [53, 9648], era: '2010s', minScore: 7, language: 'fr' };
  assert.deepEqual(smartListRulesFromPicker(options, { hasServices: true }), {
    v: 1, source: 'discover', mediaType: 'movie', genreIds: [53, 9648], era: '2010s', minScore: 7,
    maxRuntime: 120, onlyServices: true, minMyRating: null, hideWatched: true,
  });
});

test('a show request keeps its episode length and drops keyword-backed genres', () => {
  const options = { ...defaultPickerOptions(), mediaType: 'tv', maxEpisodeRuntime: 30, maxRuntime: 90, genreIds: [-53, 18] };
  const r = smartListRulesFromPicker(options);
  assert.equal(r.mediaType, 'tv');
  assert.equal(r.maxRuntime, 30);
  assert.deepEqual(r.genreIds, [18]);
});

test('services only carries over when services are saved; watchlist answers pick the watchlist source', () => {
  const options = { ...defaultPickerOptions({ hasServices: true }), onlyWatchlist: true };
  const r = smartListRulesFromPicker(options, { hasServices: false });
  assert.equal(r.onlyServices, false);
  assert.equal(r.source, 'watchlist');
});

test('the sentence reads like the canvas, with commas between filters and a full stop at the end', () => {
  const parts = smartListSentence(rules({ mediaType: 'tv', genreIds: [18, 80], minScore: 7, onlyServices: true }), { genres: GENRES });
  assert.equal(text(parts), 'Find shows from new discoveries that are Drama or Crime, rated 7+, on my services.');
  assert.deepEqual(chips(parts), ['mediaType', 'source', 'genreIds', 'minScore', 'onlyServices']);
});

test('with no filters the source chip ends the sentence', () => {
  assert.equal(text(smartListSentence(rules())), 'Find movies from new discoveries.');
});

test('the services chip hides when no services are saved', () => {
  const parts = smartListSentence(rules({ onlyServices: true }), { hasServices: false });
  assert.ok(!chips(parts).includes('onlyServices'));
});

test('type and source can be changed but never removed', () => {
  assert.equal(isRemovableSmartListRule('mediaType'), false);
  assert.equal(isRemovableSmartListRule('source'), false);
  assert.equal(isRemovableSmartListRule('minScore'), true);
});

test('a genre choice toggles; a type change drops genres and length the new type does not offer', () => {
  let r = rules({ mediaType: 'movie', genreIds: [53], maxRuntime: 120 });
  r = setSmartListRule(r, 'genreIds', 18);
  assert.deepEqual(r.genreIds, [53, 18]);
  r = setSmartListRule(r, 'genreIds', 53);
  assert.deepEqual(r.genreIds, [18]);
  r = setSmartListRule(r, 'mediaType', 'tv', { offeredGenreIds: [80] });
  assert.deepEqual(r.genreIds, []);
  assert.equal(r.maxRuntime, null);
});

test('removing a rule clears it and nothing else', () => {
  const r = rules({ genreIds: [18], era: '2010s', minScore: 7, maxRuntime: 90, onlyServices: true });
  assert.deepEqual(removeSmartListRule(r, 'era'), { ...r, era: 'any' });
  assert.deepEqual(removeSmartListRule(r, 'onlyServices'), { ...r, onlyServices: false });
  assert.equal(removeSmartListRule(r, 'mediaType'), r);
});

test('Add a rule offers only what is unset and applies', () => {
  const offered = (r, ctx) => addableSmartListRules(r, ctx).map(a => a.rule);
  assert.deepEqual(offered(rules(), { hasServices: true }), ['genreIds', 'era', 'minScore', 'maxRuntime', 'onlyServices']);
  assert.deepEqual(offered(rules({ mediaType: 'any' }), { hasServices: false }), ['genreIds', 'era', 'minScore']);
  assert.ok(offered(rules({ source: 'history' })).includes('minMyRating'));
  assert.deepEqual(offered(rules({ genreIds: [18], era: '1990s', minScore: 6, maxRuntime: 90, onlyServices: true }), { hasServices: true }), []);
});

test('chip menus mark the current choice; genres are several at once', () => {
  const r = rules({ minScore: 7, genreIds: [18] });
  const score = smartListRuleChoices('minScore', r);
  assert.equal(score.multi, false);
  assert.deepEqual(score.choices.filter(c => c.selected).map(c => c.value), [7]);
  const genres = smartListRuleChoices('genreIds', r, { genres: GENRES });
  assert.equal(genres.multi, true);
  assert.deepEqual(genres.choices.filter(c => c.selected).map(c => c.value), [18]);
  assert.equal(smartListRuleChoices('maxRuntime', rules({ mediaType: 'tv' })).choices.length, 3);
});

test('a suggested name reads from the rules', () => {
  assert.equal(
    suggestSmartListName(rules({ genreIds: [53, 9648], maxRuntime: 120, onlyServices: true }), { genres: GENRES }),
    'Thriller and mystery movies, under 2 hours on my services',
  );
  assert.equal(suggestSmartListName(rules({ mediaType: 'tv', genreIds: [18, 80], minScore: 7 }), { genres: GENRES }), 'Drama and crime shows, 7+');
  assert.equal(suggestSmartListName(rules({ mediaType: 'any', source: 'watchlist' })), 'Movies and shows from my watchlist');
});

test('a Free viewer’s draft round-trips, and stale or broken drafts are dropped', () => {
  const now = 1_800_000_000_000;
  const r = rules({ genreIds: [18] });
  const stored = serialiseSmartListDraft({ name: 'Dramas', rules: r }, now);
  assert.deepEqual(parseSmartListDraft(stored, now + 1000), { name: 'Dramas', rules: r });
  assert.equal(parseSmartListDraft(stored, now + SMART_LIST_DRAFT_TTL_MS + 1), null);
  assert.equal(parseSmartListDraft('{nope', now), null);
  assert.equal(parseSmartListDraft(JSON.stringify({ v: 1, savedAt: now, rules: null }), now), null);
  assert.equal(smartListDraftKey('u1'), 'plot.smartList.draft.u1');
});

test('the live count is what TMDB reports for discover, summed across types', async () => {
  _resetPickerCache();
  const page = (n, total) => ({
    results: Array.from({ length: n }, (_, i) => ({ id: 100 + i, poster_path: `/p${i}.jpg`, genre_ids: [18], vote_average: 7 })),
    total_pages: 3, total_results: total,
  });
  const client = { discoverMovies: async () => page(5, 41), discoverTV: async () => page(4, 12) };
  const res = await previewSmartList({ rules: rules({ mediaType: 'any' }), client });
  assert.equal(res.count, 53);
  assert.equal(res.items.length, 4);
  assert.equal(res.fromTmdb, true);
});

test('the live count for your own titles counts them exactly', async () => {
  const watchlistItems = [
    { tmdb_id: 1, media_type: 'movie', title: 'A', genre_ids: [18], release_date: '2015-01-01', created_at: '2026-01-02' },
    { tmdb_id: 2, media_type: 'movie', title: 'B', genre_ids: [35], release_date: '2015-01-01', created_at: '2026-01-01' },
  ];
  const res = await previewSmartList({ rules: rules({ source: 'watchlist', genreIds: [18] }), watchlistItems, client: {} });
  assert.equal(res.count, 1);
  assert.equal(res.fromTmdb, false);
});
