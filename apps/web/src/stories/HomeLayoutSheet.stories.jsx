import { useState } from 'react';
import HomeLayoutSheet from '../components/HomeLayoutSheet.jsx';
import SidebarOrderSheet from '../components/SidebarOrderSheet.jsx';
import {
  addHomePin, defaultHomeLayout, isDefaultHomeLayout, moveHomeSection, nudgeHomePin, nudgeHomeSection,
  removeHomePin, setHomeSectionVisible,
} from '@plot/core/homeLayout.js';
import { pinOptions } from '@plot/core/homePins.js';
import { defaultUiPrefs, setCardStyle, setDensity } from '@plot/core/uiPrefs.js';

// The sheets with the real layout rules and no persistence: drag, nudge, hide,
// pin, density and reset all work, nothing is written anywhere.
const LABELS = {
  picks: "Plot's Picks", continue: 'Continue watching', hot: 'Hot Right Now', weekly: 'Top 20 This Week',
  people: 'Your people', releases: 'New Releases', binged: 'Most Binged Shows', cinema: 'Now Showing',
  anticipated: 'Most Anticipated', platforms: 'Top 10 By Platform',
};
const lists = [{ id: 'l1', name: 'Comfort rewatches' }, { id: 'l2', name: 'Date night' }];
const follows = [{ tmdb_person_id: -10, name: 'Ada Quill' }, { tmdb_person_id: -11, name: 'Ben Arlo' }];
const noop = () => {};

function Preview({ initial = defaultHomeLayout(), error = null, premium = true }) {
  const [layout, setLayout] = useState(initial);
  const [prefs, setPrefs] = useState(defaultUiPrefs());
  const label = (pin) => (pin.kind === 'watchlist' ? 'Want to Watch' : pin.kind === 'list' ? lists.find(l => l.id === pin.id)?.name : follows.find(f => String(f.tmdb_person_id) === pin.id)?.name);
  return (
    <div style={{ height: '100dvh' }}>
      <HomeLayoutSheet
        sections={layout.order.map(id => ({ id, label: LABELS[id] }))}
        layout={layout}
        isDefault={isDefaultHomeLayout(layout)}
        error={error}
        onMove={(id, to) => setLayout(l => moveHomeSection(l, id, to))}
        onNudge={(id, d) => setLayout(l => nudgeHomeSection(l, id, d))}
        onToggle={(id) => setLayout(l => setHomeSectionVisible(l, id))}
        onReset={() => setLayout(defaultHomeLayout())}
        onClose={noop}
        prefs={prefs}
        onDensity={(d) => setPrefs(p => setDensity(p, d))}
        onCardStyle={(c) => setPrefs(p => setCardStyle(p, c))}
        premium={premium}
        pins={layout.pins.map(pin => ({ key: `${pin.kind}:${pin.id}`, pin, label: label(pin) }))}
        pinGroups={pinOptions({ layout, lists, follows })}
        onPin={(pin) => setLayout(l => addHomePin(l, pin))}
        onUnpin={(pin) => setLayout(l => removeHomePin(l, pin))}
        onNudgePin={(pin, d) => setLayout(l => nudgeHomePin(l, pin, d))}
        onUpgrade={noop}
      />
    </div>
  );
}

export default { title: 'Home/Customize Home', component: Preview, parameters: { layout: 'fullscreen' } };
export const Default = {};
export const Customized = {
  args: { initial: setHomeSectionVisible(moveHomeSection(defaultHomeLayout(), 'platforms', 0), 'binged', false) },
};
export const WithPins = {
  args: { initial: addHomePin(addHomePin(addHomePin(defaultHomeLayout(), { kind: 'watchlist' }), { kind: 'list', id: 'l1' }), { kind: 'person', id: -10 }) },
};
export const FreeViewer = { args: { premium: false } };
export const SaveFailed = { args: { error: { message: 'offline' } } };

function SidebarPreview({ error = null }) {
  const [order, setOrder] = useState([]);
  return (
    <div style={{ height: '100dvh' }}>
      <SidebarOrderSheet
        order={order}
        isDefault={order.length === 0}
        error={error}
        onNudge={(ids, id, d) => { const i = ids.indexOf(id); const next = [...ids]; if (i + d < 0 || i + d >= next.length) return; [next[i], next[i + d]] = [next[i + d], next[i]]; setOrder(next); }}
        onMove={(ids, id, to) => { const next = ids.filter(x => x !== id); next.splice(to, 0, id); setOrder(next); }}
        onReset={() => setOrder([])}
        onClose={noop}
      />
    </div>
  );
}
export const SidebarOrder = { render: () => <SidebarPreview /> };
