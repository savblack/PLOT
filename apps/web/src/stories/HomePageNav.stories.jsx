import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { HomePageNav } from '../components/DiscoverView.jsx';
import HomeLayoutSheet from '../components/HomeLayoutSheet.jsx';
import {
  defaultHomeLayout, isDefaultHomeLayout, moveHomeSection, nudgeHomeSection, setHomeSectionVisible,
} from '@plot/core/homeLayout.js';

// Home's sidebar Jump to card with its Customize action. The sections are the
// default set; Customize opens the real sheet with local state only.
const LABELS = {
  picks: "Plot's Picks", continue: 'Continue watching', hot: 'Hot Right Now', weekly: 'Top 20 This Week',
  people: 'Your people', releases: 'New Releases', binged: 'Most Binged Shows', cinema: 'Now Showing',
  anticipated: 'Most Anticipated', platforms: 'Top 10 By Platform',
};

function Preview() {
  const [layout, setLayout] = useState(defaultHomeLayout());
  const [open, setOpen] = useState(false);
  const sections = layout.order.filter(id => !layout.hidden.includes(id)).map(id => ({ id: `home-${id}`, navLabel: LABELS[id] }));
  return (
    <MemoryRouter>
      <div style={{ width: 280, padding: 24 }}>
        <HomePageNav sections={sections} onCustomize={() => setOpen(true)} />
      </div>
      {open && (
        <HomeLayoutSheet
          sections={layout.order.map(id => ({ id, label: LABELS[id] }))}
          layout={layout}
          isDefault={isDefaultHomeLayout(layout)}
          error={null}
          onMove={(id, to) => setLayout(l => moveHomeSection(l, id, to))}
          onNudge={(id, d) => setLayout(l => nudgeHomeSection(l, id, d))}
          onToggle={(id) => setLayout(l => setHomeSectionVisible(l, id))}
          onReset={() => setLayout(defaultHomeLayout())}
          onClose={() => setOpen(false)}
        />
      )}
    </MemoryRouter>
  );
}

export default { title: 'Home/Jump to card', component: Preview };
export const Default = {};
