import { useState } from 'react';
import OnboardingScreen from '../pages/OnboardingScreen.jsx';
import { buildingLines } from '@plot/core/onboardingSetup.js';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';

// Fictional titles and services, no images. Ids are negative on purpose: they
// are not TMDB ids (AGENTS.md: never guess one).
const titles = ['Slow Lane', 'Severed Ties', 'The Back Lot', 'Quips', 'East Pier', 'Digger Bay', 'The Envoy', 'Behemoth Bay', 'Harbour Lights', 'Gala Night', 'Old One', 'Late Talk']
  .map((title, i) => ({ id: -(i + 1), media_type: i % 2 ? 'movie' : 'tv', title, poster_path: null }));
const services = ['Service One', 'Service Two', 'Service Three', 'Service Four', 'Service Five', 'Service Six', 'Service Seven', 'Service Eight']
  .map((name, i) => ({ id: -(i + 100), name, logo_path: null }));
const noop = () => {};

function Screen({ step, selected = [-2, -4], picked = [-100, -104], firstName = 'Sam', lineIndex = 1 }) {
  const [sel, setSel] = useState(selected);
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
        matchLine: svc.length ? ONBOARDING_FLOW.services.matchLine(1, sel.length || 2) : ONBOARDING_FLOW.services.noneSelected,
        onContinue: noop,
      }}
      building={{ leaving: false, fan: titles.slice(0, 3), lines: buildingLines(svc.length > 0), lineIndex }}
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
/** 2 · Nothing picked: the line explains that skipping looks across every platform. */
export const WhereDoYouWatchNonePicked = { render: () => <Screen step="services" picked={[]} /> };
/** 3 · Building your Plot (the lines rotate in the app; this shows line two). */
export const Building = { render: () => <Screen step="building" /> };
