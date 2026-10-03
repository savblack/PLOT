import { useEffect, useState } from 'react';
import OnboardingScreen from '../pages/OnboardingScreen.jsx';
import { buildingFan, buildingLines } from '@plot/core/onboardingSetup.js';

// Fictional titles and services, no images. Ids are negative on purpose: they
// are not TMDB ids (AGENTS.md: never guess one).
const titles = ['Slow Lane', 'Severed Ties', 'The Back Lot', 'Quips', 'East Pier', 'Digger Bay', 'The Envoy', 'Behemoth Bay', 'Harbour Lights', 'Gala Night', 'Old One', 'Late Talk']
  .map((title, i) => ({ id: -(i + 1), media_type: i % 2 ? 'movie' : 'tv', title, poster_path: null }));
const services = ['Service One', 'Service Two', 'Service Three', 'Service Four', 'Service Five', 'Service Six', 'Service Seven', 'Service Eight']
  .map((name, i) => ({ id: -(i + 100), name, logo_path: null }));
const noop = () => {};

function Screen({ step, selected = [-2, -4], picked = [-100, -104], firstName = 'Sam', lineIndex = 1, ticking = false }) {
  const [sel, setSel] = useState(selected);
  const [line, setLine] = useState(lineIndex);
  useEffect(() => {
    if (!ticking) return undefined;
    const id = setInterval(() => setLine(i => (i + 1) % 4), 1500);
    return () => clearInterval(id);
  }, [ticking]);
  const [svc, setSvc] = useState(picked);
  return (
    <OnboardingScreen
      step={step}
      firstName={firstName}
      saving={false}
      saveError={null}
      canGoBack={step !== 'seed' && step !== 'building'}
      onBack={noop}
      onSkip={noop}
      seed={{
        query: '', onQuery: noop, searching: false, items: titles, selectedIds: new Set(sel), count: sel.length,
        onToggle: (item) => setSel(s => (s.includes(item.id) ? s.filter(x => x !== item.id) : [...s, item.id])),
        onContinue: noop, onSwitch: noop,
      }}
      onPickImport={noop}
      services={{
        list: services, error: false, selectedIds: svc,
        onToggle: (id) => setSvc(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id])),
        region: 'US', editingRegion: false, onEditRegion: noop, onRegion: noop, onRegionDone: noop,
        onContinue: noop,
      }}
      building={{ leaving: false, fan: buildingFan(titles.filter(t => sel.includes(t.id)), titles), lines: buildingLines(svc.length > 0), lineIndex: line }}
    />
  );
}

export default {
  title: 'Onboarding/Flow',
  parameters: { layout: 'fullscreen' },
};

/** 1 · Save a few, or switch. Tap posters to save them. */
export const SaveAFew = { render: () => <Screen step="seed" /> };
/** 1 · No name from the sign-in provider (email sign-up), nothing saved yet. */
export const SaveAFewNoName = { render: () => <Screen step="seed" firstName="" selected={[]} /> };
/** 1b · Switching apps: where their history is now. Part of step 1. */
export const SwitchingApps = { render: () => <Screen step="import" /> };
/** 2 · Where do you watch. */
export const WhereDoYouWatch = { render: () => <Screen step="services" /> };
/** 2 · Nothing picked yet. */
export const WhereDoYouWatchNonePicked = { render: () => <Screen step="services" picked={[]} /> };
/** 3 · Building your Plot: the cards deal in, then shuffle with each line. */
export const Building = { render: () => <Screen step="building" ticking /> };
/** 3 · Only one title picked: trending titles fill the fan. */
export const BuildingOnePick = { render: () => <Screen step="building" selected={[-5]} ticking /> };
