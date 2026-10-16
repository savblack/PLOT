import { WatchTogetherHomeCardView } from '../components/WatchTogetherHomeCard.jsx';

const noop = () => {};

function Card({ premium }) {
  return (
    <div className="home-page" style={{ paddingTop: 24 }}>
      <WatchTogetherHomeCardView premium={premium} onOpen={noop} onDismiss={noop} />
    </div>
  );
}

export default {
  title: 'Home/Watch together card',
  parameters: { layout: 'fullscreen' },
};

export const Free = { render: () => <Card premium={false} /> };
export const Premium = { render: () => <Card premium={true} /> };
