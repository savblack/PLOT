// Web rendering for the shared title search and library eligibility logic.
import { useEffect, useRef, useState } from 'react';
import { useUnifiedSearch } from '@plot/core/useUnifiedSearch.js';
import { quickAddCountAfterAdd, quickAddProgress } from '@plot/core/hasFeltValue.js';
import { QUICK_ADD } from '@plot/core/copy/quickAdd.js';
import { MEDIA } from '@plot/core/copy/media.js';
import { useApp } from '../hooks/useApp.js';
import { EVENTS, track } from '../lib/analytics.js';
import './QuickAdd.css';

export default function QuickAdd() {
  const { accountValue, watchlist, watching, history } = useApp();
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(false);
  const shown = useRef(false);
  const { items, loading } = useUnifiedSearch(query, { signedIn: true });
  const count = accountValue.titleCount;
  useEffect(() => {
    if (shown.current || count == null) return;
    shown.current = true;
    track(EVENTS.QUICK_ADD_SHOWN, { title_count: count, surface: 'home' });
    if (count === 0) track(EVENTS.ACTIVATION_NUDGE_SHOWN, { surface: 'home' });
  }, [count]);

  const add = async (item, list) => {
    const id = Number(item.id);
    const type = item.media_type;
    const already = watchlist.isInList(id) || (type === 'tv' && watching.isWatching(id)) || history.isWatched(id, type);
    setSaving(`${type}:${id}:${list}`);
    setError(false);
    let saved;
    try {
      saved = list === 'watching' ? await watching.startWatching(item) : await watchlist.addToList(item);
    } catch {
      setError(true);
      return;
    } finally { setSaving(null); }
    if (!saved) { setError(true); return; }
    track(EVENTS.QUICK_ADD_TITLE_ADDED, {
      title_count: quickAddCountAfterAdd(count, already), list, surface: 'home',
    });
    setQuery('');
  };

  if (count == null || count >= 5) return null;
  const results = query.trim().length >= 2 && !loading
    ? items.filter(item => item.kind === 'title').slice(0, 5) : [];
  return (
    <section className="quick-add" aria-label={QUICK_ADD.title}>
      <h2>{QUICK_ADD.title}</h2>
      <label className="sr-only" htmlFor="quick-add-search">{QUICK_ADD.search}</label>
      <input id="quick-add-search" type="search" value={query} placeholder={QUICK_ADD.search}
        onChange={event => setQuery(event.target.value)}
        onFocus={() => { if (count === 0) track(EVENTS.ACTIVATION_NUDGE_ADD_CLICKED, { surface: 'home' }); }} />
      {count > 0 && <p className="quick-add-progress">{QUICK_ADD.progress(quickAddProgress(count))}</p>}
      {error && <p role="alert">{QUICK_ADD.unavailable}</p>}
      {results.length > 0 && <ul className="quick-add-results">{results.map(({ key, data }) => (
        <li key={key}>
          <span>{data.title || data.name}</span>
          <div>
            {data.media_type === 'tv' && <button type="button" disabled={!!saving || watching.isWatching(data.id)}
              onClick={() => void add(data, 'watching')}>{MEDIA.startWatching}</button>}
            <button type="button" disabled={!!saving || watchlist.isInList(data.id)}
              onClick={() => void add(data, 'watchlist')}>{MEDIA.saveToWatchlist}</button>
          </div>
        </li>
      ))}</ul>}
    </section>
  );
}
