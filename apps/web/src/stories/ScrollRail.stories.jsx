import RailArrows from '../components/RailArrows.jsx';
import ScrollRail from '../components/ScrollRail.jsx';
import { useRailScroll } from '../hooks/useRailScroll.js';

/* The rails live on Discover, behind auth, so the controls can't be exercised
   on any public route. These stories stand them up with placeholder cards:
   page through with the arrows and watch each one disable at its end of the
   travel. */

// The arrows are pointer-and-wide-screen only in app.css. A story frame is
// narrower than the breakpoint, so force them visible here — everything else
// (size, colour, disabled state, end-of-travel behaviour) is the shipped CSS.
const FORCE_CONTROLS = `
  .sb-rail .rail-arrow { display: flex; }
`;

function Card({ n }) {
  return (
    <div className="media-card">
      <div className="media-card-img" style={{ background: 'var(--surface-sunken)' }} />
      <div className="media-card-title">Title {n}</div>
      <div className="media-card-meta">2024 · Movie</div>
    </div>
  );
}

const cards = (count) => Array.from({ length: count }, (_, i) => <Card key={i} n={i + 1} />);

/* Mirrors how Discover composes the two halves: one useRailScroll feeds the
   arrows in the header and the scroll container below it. */
function Shelf({ title, subtitle, className, children }) {
  const rail = useRailScroll();
  return (
    <section>
      <div className="discover-section-header">
        <div className="discover-section-heading">
          <h2 className="discover-section-title">{title}</h2>
          {subtitle && <span className="discover-section-sub">{subtitle}</span>}
        </div>
        <div className="discover-section-actions"><RailArrows rail={rail} /></div>
      </div>
      <ScrollRail rail={rail} className={className}>{children}</ScrollRail>
    </section>
  );
}

export default {
  title: 'Components/ScrollRail',
  component: ScrollRail,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="sb-rail" style={{ maxWidth: 640 }}>
        <style>{FORCE_CONTROLS}</style>
        <Story />
      </div>
    ),
  ],
};

// Enough cards to overflow: both arrows render, the left one disabled until
// you page away from the start.
export const Default = {
  render: () => <Shelf title="Most Binged Shows" subtitle="Popular TV">{cards(14)}</Shelf>,
};

// Two cards fit inside the frame, so neither arrow should appear — a rail that
// cannot scroll must not offer to.
export const NotScrollable = {
  render: () => <Shelf title="Now Showing" subtitle="In cinemas">{cards(2)}</Shelf>,
};

// A title that answers its own question carries no subtitle.
export const NoSubtitle = {
  render: () => <Shelf title="Hot Right Now">{cards(14)}</Shelf>,
};

// The landscape binge rail: same controls, different card shape.
export const BingeRail = {
  render: () => (
    <Shelf title="Most Anticipated" className="discover-binge-rail">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="discover-binge-card"
          style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)' }}
        />
      ))}
    </Shelf>
  ),
};
