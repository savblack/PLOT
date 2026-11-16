// Web only: New Releases' jump index, drawn two ways. Which section is in
// view comes from hooks/useActiveRail.js; the sections themselves (and which
// genres exist) come from @plot/core/useNewReleases.js, shared with mobile.
import { useEffect, useRef } from 'react';
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';

function Chip({ rail, currentKey, onJump }) {
  return (
    <button
      type="button"
      className="new-releases-jump-chip"
      data-key={rail.key}
      aria-current={currentKey === rail.key ? 'true' : undefined}
      onClick={() => onJump(rail.key)}
    >
      {rail.title}
    </button>
  );
}

/* The page's own rows (Last 30 Days and friends) are the few that differ in
   kind, so they stay rows; the twenty-odd genres are short names of one kind,
   so they wrap as chips. No counts: every rail is capped at the same length,
   so the number was the same on nearly every row. */
function split(rails) {
  return [rails.filter(rail => !rail.isGenre), rails.filter(rail => rail.isGenre)];
}

/**
 * Desktop: the side column's Jump to card.
 * @param {{ rails: Array<{key: string, title: string, isGenre?: boolean}>, currentKey?: string, onJump: (key: string) => void }} props
 */
export function NewReleasesJumpCard({ rails, currentKey, onJump }) {
  if (!rails.length) return null;
  const [lead, genres] = split(rails);
  return (
    <nav className="hist-card new-releases-jump" aria-label={DISCOVER_VIEW.newReleasesJump.label}>
      <div className="hist-card-head"><h2 className="hist-card-title">{CUSTOM_LISTS.jumpTo}</h2></div>
      {lead.length > 0 && (
        <div>
          {lead.map(rail => (
            <button
              key={rail.key}
              type="button"
              className="cal-filter-row"
              aria-current={currentKey === rail.key ? 'true' : undefined}
              onClick={() => onJump(rail.key)}
            >
              <span className="cal-filter-name">{rail.title}</span>
            </button>
          ))}
        </div>
      )}
      {genres.length > 0 && (
        <div className="new-releases-jump-group">
          <div className="cal-filter-label">{DISCOVER_VIEW.newReleasesJump.genres}</div>
          <div className="new-releases-jump-chips">
            {genres.map(rail => <Chip key={rail.key} rail={rail} currentKey={currentKey} onJump={onJump} />)}
          </div>
        </div>
      )}
    </nav>
  );
}

/**
 * Below the two-column width: one row of chips that sticks to the top of the
 * page and scrolls sideways, keeping the section in view centered.
 * @param {{ rails: Array<{key: string, title: string, isGenre?: boolean}>, currentKey?: string, onJump: (key: string) => void }} props
 */
export function NewReleasesJumpBar({ rails, currentKey, onJump }) {
  const barRef = useRef(null);
  const [lead, genres] = split(rails);

  useEffect(() => {
    const bar = barRef.current;
    const chip = bar?.querySelector('[aria-current="true"]');
    // Hidden at desktop widths (no layout box), where there is nothing to scroll.
    if (!chip || !bar.clientWidth) return;
    bar.scrollTo({ left: chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
  }, [currentKey]);

  if (!rails.length) return null;
  return (
    <nav className="new-releases-jumpbar" aria-label={DISCOVER_VIEW.newReleasesJump.label} ref={barRef}>
      {lead.map(rail => <Chip key={rail.key} rail={rail} currentKey={currentKey} onJump={onJump} />)}
      {lead.length > 0 && genres.length > 0 && <span className="new-releases-jumpbar-rule" aria-hidden="true" />}
      {genres.map(rail => <Chip key={rail.key} rail={rail} currentKey={currentKey} onJump={onJump} />)}
    </nav>
  );
}
