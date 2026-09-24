import { useState } from 'react';
import { defaultPickerOptions, drawFromPool, PICKER_MIN_SPIN_MS, PICKER_MODES } from '@plot/core/tonightPicker.js';
import { TonightPage } from '../components/TonightView.jsx';

// Static states for the picker page. Ids are fixture values, not TMDB ids,
// and posters are left empty, so nothing here looks like a real lookup.
const GENRES = ['Action', 'Comedy', 'Drama', 'Horror', 'Romance', 'Science Fiction', 'Thriller', 'Animation', 'Documentary']
  .map((name, i) => ({ id: -(i + 1), name }));

const POOL = [
  ['A watchlist movie', 98, 7.4, true],
  ['Something new to you', null, 6.9, false],
  ['A longer title that has to truncate', null, 7.8, false],
  ['Late show', null, 6.4, false],
  ['Short and sweet', 88, 7.1, true],
  ['Sunday classic', null, 8.1, false],
].map(([title, runtime, vote_average, onWatchlist], i) => ({
  id: -(100 + i), media_type: 'movie', title, poster_path: null, backdrop_path: null,
  release_date: `20${12 + i}-05-01`, genre_ids: [], runtime, vote_average, providers: [], onWatchlist,
}));

const TV_POOL = [
  ['A limited series', 52, 8.2, true, 1, true],
  ['One-season wonder', 28, 7.6, false, 1, false],
  ['Long-running drama', 58, 8.4, false, 6, false],
].map(([title, runtime, vote_average, onWatchlist, seasons, miniseries], i) => ({
  id: -(200 + i), media_type: 'tv', title, poster_path: null, backdrop_path: null,
  release_date: `20${16 + i}-02-01`, genre_ids: [], runtime, vote_average, providers: [], onWatchlist, seasons, miniseries,
}));

const noop = () => {};

function useFakePicker({ phase: initialPhase = 'setup', mode: initialMode = 'three', pool = POOL, hasServices = true, hasWatchlist = true }) {
  const [options, setOptions] = useState(() => defaultPickerOptions({ hasServices }));
  const [phase, setPhase] = useState(initialPhase);
  const [mode, setMode] = useState(initialMode);
  const [results, setResults] = useState(() => (initialPhase === 'results' ? pool.slice(0, PICKER_MODES[initialMode]) : []));
  const go = (next = 'three') => {
    setMode(next);
    setPhase('spinning');
    setTimeout(() => {
      const picked = drawFromPool(options.mediaType === 'tv' && pool.length ? TV_POOL : pool, PICKER_MODES[next]);
      setResults(picked);
      setPhase(picked.length ? 'results' : 'empty');
    }, PICKER_MIN_SPIN_MS);
  };
  return {
    options,
    setOption: (k, v) => setOptions(o => ({ ...o, [k]: v })),
    toggleGenre: (id) => setOptions(o => ({ ...o, genreIds: o.genreIds.includes(id) ? o.genreIds.filter(g => g !== id) : [...o.genreIds, id] })),
    genres: GENRES,
    hasServices, hasWatchlist,
    phase, mode, results, canSpinAgain: pool.length > results.length,
    go, spinAgain: () => go(mode), backToOptions: () => setPhase('setup'),
  };
}

function Story(props) {
  const picker = useFakePicker(props);
  return <TonightPage premium picker={picker} onOpen={noop} navigate={noop} />;
}

export default {
  title: 'Pages/Tonight',
  component: TonightPage,
  parameters: { layout: 'fullscreen' },
};

export const Options = { render: () => <Story /> };
export const Spinning = { render: () => <Story phase="spinning" /> };
export const ThreeOptions = { render: () => <Story phase="results" /> };
export const RandomPick = { render: () => <Story phase="results" mode="random" /> };
export const TvResults = { render: () => <Story phase="results" pool={TV_POOL} /> };
export const OnlyOneFits = { render: () => <Story phase="results" pool={TV_POOL.slice(0, 1)} /> };
export const NothingFits = { render: () => <Story pool={[]} /> };
export const NoServicesOrWatchlist = { render: () => <Story hasServices={false} hasWatchlist={false} /> };
export const FreeGate = {
  render: () => <TonightPage premium={false} picker={{}} onOpen={noop} navigate={noop} />,
};
