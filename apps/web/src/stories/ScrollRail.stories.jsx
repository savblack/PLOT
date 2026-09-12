import ScrollRail from '../components/ScrollRail.jsx';

/* The rails live on Discover, behind auth, so the chevron controls can't be
   exercised on any public route. These stories stand them up with placeholder
   cards: hover the rail to reveal the controls, click to page through, and
   watch each one disappear at its end of the travel. */

// The controls are pointer-and-wide-screen only in app.css. A story frame is
// narrower than the breakpoint, so force them visible here — everything else
// (size, position, hover reveal, end-of-travel unmount) is the shipped CSS.
const FORCE_CONTROLS = `
  .sb-rail .rail-nav { display: flex; }
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

// Enough cards to overflow: the right control shows, the left one does not
// until you page away from the start.
export const Default = {
  render: () => <ScrollRail>{cards(14)}</ScrollRail>,
};

// Two cards fit inside the frame, so neither control should ever appear —
// a rail that cannot scroll must not offer to.
export const NotScrollable = {
  render: () => <ScrollRail>{cards(2)}</ScrollRail>,
};

// The landscape binge rail centres its controls on the frame rather than on a
// poster's midpoint.
export const BingeRail = {
  render: () => (
    <ScrollRail className="discover-binge-rail">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="discover-binge-card"
          style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)' }}
        />
      ))}
    </ScrollRail>
  ),
};
