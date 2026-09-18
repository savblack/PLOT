import { MEDIA_PANEL } from '../copy/mediaPanel.js';

/**
 * How far through a franchise you are, as one segment per film rather than a
 * percentage of a hairline. A collection is a small countable set — nine films
 * is nine marks — so the segmented bar says *which* ones are left, and the line
 * under it names the first you haven't seen.
 *
 * Shared by the collection panel and the card on a movie, so both read the
 * same progress the same way.
 *
 * @param {{ items: any[], watched: number, total: number, compact?: boolean }} props
 */
export default function CollectionRun({ items, watched, total, compact = false }) {
  if (!total) return null;
  const next = items.find(item => !item.watched);

  return (
    <section className={`collection-run${compact ? ' collection-run--compact' : ''}`}>
      {!compact && (
        <div className="collection-run-head">
          <h3 className="panel-card-title">{MEDIA_PANEL.yourRun}</h3>
          <span className="collection-run-count">{MEDIA_PANEL.collectionRunCount(watched, total)}</span>
        </div>
      )}
      <div
        className="collection-run-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={watched}
        aria-label={MEDIA_PANEL.collectionRunCount(watched, total)}
      >
        {items.map(item => (
          <span
            key={item.id}
            className={`collection-run-seg${item.watched ? ' collection-run-seg--on' : ''}`}
          />
        ))}
      </div>
      {!compact && (
        <p className="collection-run-next">
          {next ? MEDIA_PANEL.collectionNextUp(next.title) : MEDIA_PANEL.collectionAllWatched}
        </p>
      )}
    </section>
  );
}
