import { useMemo, useState } from 'react';
import {
  defaultPickerOptions, drawFromPool, pickerSentence, pickerFiltersSummary, pickerAnswers, savedSearchLabel,
  PICKER_MIN_SPIN_MS, PICKER_MODES, PICKER_STEPS,
} from '@plot/core/tonightPicker.js';
import { GENRE_MOODS } from '@plot/core/copy/tonightPicker.js';
import { TonightPage } from '../components/TonightView.jsx';

// Static states for the picker page. Title ids are fixture values, not TMDB
// ids, and posters are left empty, so nothing here looks like a real lookup.
// Genre ids are TMDB's fixed genre catalog ids so the mood words resolve.
const GENRES = [[35, 'Comedy'], [53, 'Thriller'], [18, 'Drama'], [28, 'Action'], [27, 'Horror'], [10749, 'Romance'], [80, 'Crime'], [878, 'Science Fiction'], [99, 'Documentary'], [16, 'Animation'], [9648, 'Mystery'], [14, 'Fantasy'], [36, 'History']]
  .map(([id, name]) => ({ id, name, mood: GENRE_MOODS[id] ?? null }));

const POOL = [
  ['Top pick title', 111, 7.8, false],
  ['A watchlist movie', 98, 7.4, true],
  ['Something new to you', 104, 6.9, false],
  ['A longer title that has to wrap onto two lines', 119, 7.6, false],
  ['Sunday classic', 95, 8.1, true],
  ['Late show', 88, 6.4, false],
].map(([title, runtime, vote_average, onWatchlist], i) => ({
  id: -(100 + i), media_type: 'movie', title, poster_path: null, backdrop_path: null,
  release_date: `20${12 + i}-05-01`, genre_ids: [], runtime, vote_average,
  providers: i % 2 ? [{ id: 8, name: 'Netflix', logo_path: null }] : [], onWatchlist,
}));

const noop = () => {};

function useFakePicker({ phase: initialPhase = 'setup', step: initialStep = 0, pool = POOL, hasServices = true, hasWatchlist = true, preset = {}, premium = true, saved: initialSaved = [] }) {
  const [options, setOptions] = useState(() => ({ ...defaultPickerOptions({ hasServices }), ...preset }));
  const [phase, setPhase] = useState(initialPhase);
  const [mode, setMode] = useState('five');
  const [step, setStep] = useState(initialStep);
  const [results, setResults] = useState(() => (initialPhase === 'results' ? pool.slice(0, 5) : []));
  const go = (next = 'five') => {
    setMode(next);
    if (!premium) { setPhase('locked'); return; }
    setPhase('spinning');
    setTimeout(() => {
      const picked = drawFromPool(pool, PICKER_MODES[next]);
      setResults(picked);
      setPhase(picked.length ? 'results' : 'empty');
    }, PICKER_MIN_SPIN_MS);
  };
  const sentence = useMemo(() => pickerSentence(options, { genres: GENRES, hasServices }), [options, hasServices]);
  const [saved, setSaved] = useState(initialSaved);
  const sig = results.map(r => r.id).join('|');
  const isSaved = results.length > 0 && saved.some(i => i.results.map(r => r.id).join('|') === sig);
  return {
    options,
    setOption: (k, v) => setOptions(o => ({ ...o, [k]: v, ...(k === 'mediaType' && v !== o.mediaType ? { genreIds: [] } : {}) })),
    toggleGenre: (id) => setOptions(o => ({ ...o, genreIds: o.genreIds.includes(id) ? o.genreIds.filter(g => g !== id) : [...o.genreIds, id] })),
    genres: GENRES,
    hasServices, hasWatchlist,
    phase, mode, results, canSpinAgain: pool.length > results.length,
    step,
    goToStep: (i) => { setStep(i); setPhase('setup'); },
    nextStep: () => setStep(i => Math.min(PICKER_STEPS.length - 1, i + 1)),
    prevStep: () => setStep(i => Math.max(0, i - 1)),
    sentence,
    filtersSummary: pickerFiltersSummary(options, { hasServices }),
    answers: pickerAnswers(options, { genres: GENRES }),
    go, spinAgain: () => go(mode), backToOptions: () => setPhase('setup'), closeLock: () => setPhase('setup'),
    savedSearches: premium ? saved : [], isSaved,
    toggleSaveSearch: () => setSaved(list => (isSaved
      ? list.filter(i => i.results.map(r => r.id).join('|') !== sig)
      : [{ id: `s${list.length}`, savedAt: Date.now(), label: savedSearchLabel(sentence), options, mode, results }, ...list])),
    removeSavedSearch: (id) => setSaved(list => list.filter(i => i.id !== id)),
    openSavedSearch: (id) => { const item = saved.find(i => i.id === id); if (item) { setResults(item.results); setPhase('results'); } },
  };
}

function Story({ premium = true, ...props }) {
  const picker = useFakePicker({ ...props, premium });
  return <TonightPage premium={premium} picker={picker} onOpen={noop} navigate={noop} />;
}

export default {
  title: 'Pages/Tonight',
  component: TonightPage,
  parameters: { layout: 'fullscreen' },
};

export const Question1 = { render: () => <Story /> };
export const Question2 = { render: () => <Story step={1} /> };
export const Question2Tv = { render: () => <Story step={1} preset={{ mediaType: 'tv' }} /> };
export const Question3 = { render: () => <Story step={2} preset={{ maxRuntime: 120, genreIds: [35, 53] }} /> };
export const Question4 = { render: () => <Story step={3} preset={{ maxRuntime: 120, genreIds: [35, 53], era: '2010s', minScore: 7 }} /> };
export const Spinning = { render: () => <Story phase="spinning" /> };
export const Results = { render: () => <Story phase="results" preset={{ maxRuntime: 120, genreIds: [35, 53], era: '2010s', minScore: 7 }} /> };
export const NothingFits = { render: () => <Story phase="empty" pool={[]} /> };
export const NoServicesOrWatchlist = { render: () => <Story hasServices={false} hasWatchlist={false} /> };
// Free: every question works; Go and Surprise me open the upgrade pop-up.
export const FreeAnswering = { render: () => <Story premium={false} step={3} preset={{ maxRuntime: 120, genreIds: [35, 53], era: '2010s', minScore: 7 }} /> };
export const FreeUnlockPopUp = { render: () => <Story premium={false} phase="locked" step={3} preset={{ maxRuntime: 120, genreIds: [35, 53], era: '2010s', minScore: 7 }} /> };

const SAVED = [
  { id: 's1', savedAt: Date.UTC(2026, 8, 24), label: 'A mini-series with episodes under 60 min, any kind.', options: {}, mode: 'five', results: POOL.slice(0, 5) },
  { id: 's2', savedAt: Date.UTC(2026, 8, 20), label: 'A movie under 2 hours, that’s funny or tense, on my services.', options: {}, mode: 'five', results: POOL.slice(1, 4) },
];
export const WithSavedSearches = { render: () => <Story saved={SAVED} /> };
export const ResultsSaved = { render: () => <Story phase="results" saved={[{ ...SAVED[0], results: POOL.slice(0, 5) }]} /> };
