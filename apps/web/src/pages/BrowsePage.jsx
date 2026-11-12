import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { parseKeywordBrowse } from '@plot/core/browse.js';
import { useKeywordBrowse } from '@plot/core/useKeywordBrowse.js';
import { BROWSE } from '@plot/core/copy/browse.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { RankedCard } from '../components/DiscoverView.jsx';
import './BrowsePage.css';

// Titles that share one TMDB keyword, reached from a keyword chip on a title.
export default function BrowsePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { openPanel, watchlist } = useApp();
  const browse = parseKeywordBrowse(params);
  const { items, error, retry } = useKeywordBrowse(browse?.mediaType, browse?.keywordId);

  return (
    <main className="browse-page">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>{BROWSE.back}</button>
      <header className="browse-header">
        <div className="browse-kicker">{BROWSE.keywordEyebrow}</div>
        <h1>{browse?.name ? BROWSE.keywordTitle(browse.name) : BROWSE.keywordEyebrow}</h1>
      </header>
      {!browse && <p className="browse-note">{BROWSE.empty}</p>}
      {browse && error && (
        <EmptyState title={BROWSE.loadError} action={<button type="button" className="btn btn-ghost btn-sm" onClick={retry}>{BROWSE.retry}</button>} />
      )}
      {browse && !error && items === null && <LoadingSpinner />}
      {browse && !error && items?.length === 0 && <p className="browse-note">{BROWSE.empty}</p>}
      {items?.length > 0 && (
        <div className="browse-grid">
          {items.map(item => (
            <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} openPanel={openPanel} watchlist={watchlist} />
          ))}
        </div>
      )}
    </main>
  );
}
