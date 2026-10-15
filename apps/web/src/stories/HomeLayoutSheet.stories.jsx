import { useState } from 'react';
import HomeLayoutSheet from '../components/HomeLayoutSheet.jsx';
import {
  defaultHomeLayout, isDefaultHomeLayout, moveHomeSection, nudgeHomeSection, setHomeSectionVisible,
} from '@plot/core/homeLayout.js';

// The sheet with the real layout rules and no persistence: drag, nudge, hide
// and reset all work, nothing is written anywhere.
const LABELS = {
  picks: "Plot's Picks", continue: 'Continue watching', hot: 'Hot Right Now', weekly: 'Top 20 This Week',
  people: 'Your people', releases: 'New Releases', binged: 'Most Binged Shows', cinema: 'Now Showing',
  anticipated: 'Most Anticipated', platforms: 'Top 10 By Platform',
};

function Preview({ initial = defaultHomeLayout(), error = null }) {
  const [layout, setLayout] = useState(initial);
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
        onClose={() => {}}
      />
    </div>
  );
}

export default { title: 'Home/Customize Home', component: Preview, parameters: { layout: 'fullscreen' } };
export const Default = {};
export const Customized = {
  args: { initial: setHomeSectionVisible(moveHomeSection(defaultHomeLayout(), 'platforms', 0), 'binged', false) },
};
export const SaveFailed = { args: { error: { message: 'offline' } } };
