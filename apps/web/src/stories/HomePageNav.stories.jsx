import { MemoryRouter } from 'react-router-dom';
import { HomePageNav } from '../components/DiscoverView.jsx';
import { defaultHomeLayout } from '@plot/core/homeLayout.js';

// Home's sidebar Jump to card. The sections are the default set. Customize is
// not on this card: it sits at the foot of the page (DiscoverView).
const LABELS = {
  picks: "Plot's Picks", continue: 'Continue watching', hot: 'Hot Right Now', weekly: 'Top 20 This Week',
  people: 'Your people', releases: 'New Releases', binged: 'Most Binged Shows', cinema: 'Now Showing',
  anticipated: 'Most Anticipated', platforms: 'Top 10 By Platform',
};

function Preview() {
  const layout = defaultHomeLayout();
  const sections = layout.order.filter(id => !layout.hidden.includes(id)).map(id => ({ id: `home-${id}`, navLabel: LABELS[id] }));
  return (
    <MemoryRouter>
      <div style={{ width: 280, padding: 24 }}>
        <HomePageNav sections={sections} />
      </div>
    </MemoryRouter>
  );
}

export default { title: 'Home/Jump to card', component: Preview };
export const Default = {};
