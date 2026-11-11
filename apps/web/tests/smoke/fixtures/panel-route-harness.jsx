// The stand-in app shell for the panel address smoke test: two routes, a few
// things to open, and the real usePanelRoute driving a stand-in panel. The ids
// are fixture values, not TMDB ids, and nothing here is looked up.
import React from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { usePanelRoute } from '../../../src/hooks/usePanelRoute.js';

const BASE = '/tests/smoke/fixtures/panel-route.html';
const views = [];

export default function Harness() {
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  const { panelItem, panelClosing, openPanel, closePanel } = usePanelRoute({
    onView: (id, type, source) => { views.push(`${type}-${id}:${source}`); },
  });
  const shown = panelItem && !panelClosing;
  return (
    <main>
      <p data-testid="where">{location.pathname.endsWith('/other') ? 'other' : 'home'}</p>
      <p data-testid="views">{views.join(',')}</p>
      <nav>
        <Link to={`${BASE}/other`}>Other page</Link>
        <Link to={BASE}>Home page</Link>
      </nav>
      <button type="button" onClick={() => openPanel(11, 'movie', 'rail')}>Open film 11</button>
      <button type="button" onClick={() => openPanel(7, 'collection', 'rail')}>Open collection 7</button>
      <button type="button" onClick={() => openPanel(5, 'person', 'search')}>Open person 5</button>
      <button type="button" onClick={() => setSearchParams({ type: 'tv' })}>Filter this page</button>
      {shown && (
        <aside role="dialog" aria-label={`${panelItem.type} ${panelItem.id}`}>
          {panelItem.type === 'collection' && (
            <button type="button" onClick={() => openPanel(12, 'movie', 'collection')}>Open film 12 from the collection</button>
          )}
          {panelItem.type === 'person' && (
            <button type="button" onClick={() => openPanel(13, 'movie', 'person')}>Open film 13 from the person</button>
          )}
          <button type="button" onClick={closePanel}>Close</button>
        </aside>
      )}
    </main>
  );
}
