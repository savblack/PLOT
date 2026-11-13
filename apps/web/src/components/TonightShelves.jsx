// Just Decide's opening view (Nov 2026 redesign, option D): chips that narrow
// everything, then shelves of titles that fit tonight, laid out like Home.
// "Pick one for me" runs the picker on the chips' options and the page moves
// to its results (TonightView.jsx). Rules and shelves: @plot/core
// tonightShelves.js. Mockups: https://claude.ai/artifact/VMDXnp5BmJJd9ekX2FS7QH
// Mobile parity: apps/mobile/app/(app)/tonight.tsx.
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { useTonightShelves, SHELF_CHIPS, chipOn, chipLabel, toggleChip } from '@plot/core/tonightShelves.js';
import { useApp } from '../hooks/useApp.js';
import { TONIGHT_PICKER as T } from '../copy/tonightPicker.js';
import { EVENTS, track } from '../lib/analytics.js';
import { RailSection } from './DiscoverView.jsx';
import MediaCard from './MediaCard.jsx';
import Chip, { ChipRow } from './Chip.jsx';
import EmptyState from './EmptyState.jsx';
import PremiumGateButton from './PremiumGateButton.jsx';
import PremiumMark from './PremiumMark.jsx';

const reportGate = () => track(EVENTS.PREMIUM_GATE_HIT, { feature: 'tonight_picker' });

/** Pick one for me: Premium draws five; Free gets the day's one pick, then the gate. */
export function PickForMe({ picker, premium, className = '' }) {
  const locked = !premium && !picker.freePickLeft;
  return (
    <button type="button" className={`btn btn-primary tonight-go ${className}`}
      onClick={() => picker.go(premium ? 'five' : 'surprise')}
      aria-label={locked ? `${T.pickForMe}, ${T.gate.locked}` : picker.freePickLeft ? `${T.pickForMe}. ${T.freePickNote}` : undefined}
      title={picker.freePickLeft ? T.freePickNote : undefined}>
      {locked && <PremiumMark className="tonight-go-mark" />}{T.pickForMe}
    </button>
  );
}

/** The chips: they narrow every shelf, and Pick uses them too. */
export function ShelfChips({ picker }) {
  const { options } = picker;
  const chips = SHELF_CHIPS.filter(c => c !== 'services' || picker.hasServices);
  const tap = (chip) => {
    const next = toggleChip(chip, options);
    for (const key of Object.keys(next)) if (next[key] !== options[key]) picker.setOption(key, next[key]);
  };
  return (
    <ChipRow className="tonight-chips" aria-label={T.chips.label}>
      {chips.map(chip => (
        <Chip key={chip} label={chipLabel(chip, options.mediaType)} selected={chipOn(chip, options)} onClick={() => tap(chip)} />
      ))}
    </ChipRow>
  );
}

/** `useShelves` is a seam for stories; the app always uses the real loader. */
export default function TonightShelves({ picker, premium, useShelves = useTonightShelves }) {
  const { user, profile, watchlist, openPanel } = useApp();
  const { shelves, loading, error } = useShelves({
    options: picker.options,
    premium,
    userId: user?.id,
    watchlistItems: watchlist.items,
    watchlistReady: !watchlist.loading,
    streamingProviders: profile?.streaming_providers,
    region: profile?.region || DEFAULT_REGION,
  });
  const filled = shelves.filter(s => s.items.length);

  return (
    <div className="tonight-shelves">
      <div className="discover-sections" aria-busy={loading}>
        {error ? <EmptyState className="tonight-empty" title={T.loadError} />
          : !loading && !filled.length && !shelves.some(s => s.locked)
            ? <EmptyState className="tonight-empty" body={watchlist.items?.length ? T.shelves.empty : T.shelves.emptyWatchlist} />
            : shelves.map(shelf => shelf.locked ? (
              <section key={shelf.id} className="discover-section tonight-shelf-locked">
                <div className="discover-section-header"><div className="discover-section-heading"><h2 className="discover-section-title">{shelf.title}</h2></div></div>
                <div className="tonight-shelf-locked-body">
                  <p className="tonight-hint">{T.shelves.servicesLocked}</p>
                  <PremiumGateButton reason="justDecide" className="btn btn-secondary btn-sm" onOpen={reportGate} />
                </div>
              </section>
            ) : (
              <RailSection key={shelf.id} title={shelf.title} subtitle={shelf.note}>
                {shelf.items.map(item => (
                  <MediaCard key={`${item.media_type}:${item.id}`} item={item}
                    openPanel={(id, type) => { picker.openPick(item); openPanel(id, type); }}
                    watchlist={watchlist} />
                ))}
              </RailSection>
            ))}
      </div>
    </div>
  );
}
