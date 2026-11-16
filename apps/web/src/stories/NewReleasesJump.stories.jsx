import { NewReleasesJumpBar, NewReleasesJumpCard } from '../components/NewReleasesJump.jsx';
import { useActiveRail } from '../hooks/useActiveRail.js';

// New Releases' jump index in both forms: the side column's card at desktop
// widths, the sticky chip row below 1024px. The sections are stand-ins the
// height of a real rail, so following the scroll and jumping both work here.
// The genre names are the set the page shows once TV's combined genres have
// been folded into the movie ones (@plot/core/useNewReleases.js).
const LEAD = ['Last 30 Days', 'Most Binged Shows', 'Now Showing', 'Top 10 by Platform'];
const GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family',
  'Fantasy', 'History', 'Horror', 'Kids', 'Music', 'Mystery', 'News', 'Reality', 'Romance',
  'Science Fiction', 'Soap', 'Talk', 'Thriller', 'TV Movie', 'War', 'Western',
];
const key = title => title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const RAILS = [
  ...LEAD.map(title => ({ key: key(title), title })),
  ...GENRES.map(title => ({ key: key(title), title, isGenre: true })),
];

function Page() {
  const [currentKey, jumpTo] = useActiveRail(RAILS);
  return (
    <div className="new-releases-page">
      <NewReleasesJumpBar rails={RAILS} currentKey={currentKey} onJump={jumpTo} />
      <div className="cal-body new-releases-layout">
        <aside className="cal-side new-releases-side">
          <NewReleasesJumpCard rails={RAILS} currentKey={currentKey} onJump={jumpTo} />
        </aside>
        <div className="new-releases-stream">
          <div className="discover-sections">
            {RAILS.map(rail => (
              <section key={rail.key} id={`new-releases-${rail.key}`} className="discover-section" style={{ marginBottom: 32 }}>
                <div className="discover-section-header"><h2 className="discover-section-title">{rail.title}</h2></div>
                <div style={{ height: 240, borderRadius: 12, background: 'var(--surface-sunken)' }} />
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default { title: 'New Releases/Jump to', component: Page, parameters: { layout: 'fullscreen' } };
export const Default = {};
