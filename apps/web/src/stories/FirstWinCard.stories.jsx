import { useState } from 'react';
import { FirstWinCardView } from '../components/FirstWinCard.jsx';

const noop = () => {};
const show = { id: -1, media_type: 'tv', title: 'North', poster_path: null };

function Card({ title = show, open = false, logged = false }) {
  const [isOpen, setOpen] = useState(open);
  const [isLogged, setLogged] = useState(logged);
  return (
    <div className="home-page" style={{ paddingTop: 24 }}>
      <FirstWinCardView
        title={title}
        logged={isLogged}
        busy={false}
        open={isOpen}
        error=""
        seasons={[1, 2]}
        season={1}
        episodes={isOpen ? [
          { episode_number: 1, name: 'Cold open' },
          { episode_number: 2, name: 'The second reel' },
        ] : null}
        loading={false}
        loadFailed={false}
        onSkip={noop}
        onAction={() => { if (title?.media_type === 'tv') setOpen(on => !on); else setLogged(true); }}
        onSeason={noop}
        onEpisode={() => { setLogged(true); setOpen(false); }}
        onTonight={noop}
      />
    </div>
  );
}

export default {
  title: 'Home/First win card',
  parameters: { layout: 'fullscreen' },
};

/** A show still on the watchlist. Tick episode opens the list. */
export const Show = { render: () => <Card /> };
/** Nothing left on the watchlist. Tonight is still there. */
export const Empty = { render: () => <Card title={null} /> };
/** The episode was logged. */
export const Logged = { render: () => <Card logged /> };
