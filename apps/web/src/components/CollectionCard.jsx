import { useEffect, useState } from 'react';
import { tmdb } from '@plot/core/tmdb.js';
import { collectionStubFromDetails, orderedCollectionParts } from '@plot/core/collections.js';
import { posterUrl } from '../utils/images.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import CollectionFilms from './CollectionFilms.jsx';
import CollectionRun from './CollectionRun.jsx';
import { useCollectionProgress } from '../hooks/useCollectionProgress.js';
import './CollectionCard.css';

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  );
}

/**
 * "Part of a collection": the franchise a movie belongs to, as a collapsible
 * card under "More like this". The header is the toggle and carries the
 * progress bar so the count reads in both states. Movies only — TMDB has no
 * collection concept for series, which is also why "Save as list" exists:
 * a saved collection is an ordinary custom list, and lists take TV.
 *
 * `history` comes from the panel rather than a second useHistory() so the
 * card and the panel never disagree about what is watched.
 */
export default function CollectionCard({ details, itemId, history, onOpenTitle }) {
  const stub = collectionStubFromDetails(details);
  const [collection, setCollection] = useState(null);
  const [open, setOpen] = useState(false);

  const collectionId = stub?.id ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the previous franchise before fetching the new one
    setCollection(null);
    setOpen(false);
    if (!collectionId) return undefined;
    let cancelled = false;
    tmdb.getCollection(collectionId).then(data => {
      if (!cancelled && data) setCollection(data);
    });
    return () => { cancelled = true; };
  }, [collectionId]);

  const parts = orderedCollectionParts(collection);
  const { items, watched, total } = useCollectionProgress(parts, { currentId: itemId, history });

  if (!stub || !collection || parts.length < 2) return null;

  const stack = items.slice(0, 4);
  const nextUp = items.find(item => !item.watched);
  const headerId = `collection-card-${stub.id}`;

  return (
    <section className="collection-card-section" aria-labelledby={`${headerId}-title`}>
      <div className="panel-section-title collection-card-heading" id={`${headerId}-title`}>{MEDIA_PANEL.partOfCollection}</div>
      <div className="collection-card">
        <button
          type="button"
          className="collection-card-header"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-controls={`${headerId}-body`}
        >
          <span className="collection-card-stack" aria-hidden="true">
            {stack.map(part => (
              part.poster_path
                ? <img key={part.id} src={posterUrl(part.poster_path, 'w92')} alt="" loading="lazy" />
                : <span key={part.id} />
            ))}
          </span>
          <span className="collection-card-titles">
            <span className="collection-card-name">{stub.name}</span>
            <span className="collection-card-count">
              {MEDIA_PANEL.collectionProgress(watched, total)}
              {nextUp && <>{' · '}{MEDIA_PANEL.collectionNextUp(nextUp.title)}</>}
            </span>
          </span>
          <span className={`collection-card-chevron${open ? ' collection-card-chevron--open' : ''}`}><ChevronIcon /></span>
        </button>
        <CollectionRun items={items} watched={watched} total={total} compact />
        {open && (
          <div id={`${headerId}-body`}>
            <CollectionFilms stub={stub} parts={parts} items={items} onOpenTitle={onOpenTitle} />
          </div>
        )}
      </div>
    </section>
  );
}
