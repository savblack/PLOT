import { useState, useEffect, useCallback, useRef } from 'react';
import { getConfig } from './config.js';
import { on, emit, HISTORY_CHANGED_EVENT } from './events.js';
import { readEpisodeWatches, saveEpisodeWatches } from './episodeWatches.js';

const EPISODES_CHANGED = 'plot:episodes-changed';
const EMPTY = {};

/** Sparse episode state is loaded only behind the import gate. It supplements
 * legacy pointer progress; manual corrections take precedence over both.
 * @param {string|null|undefined} userId
 * @param {number} tmdbId
 */
export function useEpisodeWatches(userId, tmdbId) {
  const enabled = !!getConfig().importEventsEnabled && !!userId;
  const scope = `${userId}:${tmdbId}`;
  const [state, setState] = useState({ scope: '', states: EMPTY, loaded: false, loading: false, error: false });
  const [revision, setRevision] = useState(0);
  const request = useRef(0);
  const saving = useRef(false);
  const reload = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const version = ++request.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading when the account/title or reload revision changes
    setState(previous => ({ scope, states: previous.scope === scope ? previous.states : EMPTY, loaded: previous.scope === scope && previous.loaded, loading: true, error: false }));
    readEpisodeWatches(userId, tmdbId).then(states => {
      if (!cancelled && version === request.current) setState({ scope, states, loaded: true, loading: false, error: false });
    }).catch(() => {
      if (!cancelled && version === request.current) setState(previous => ({ ...previous, loading: false, error: true }));
    });
    return () => { cancelled = true; };
  }, [enabled, userId, tmdbId, scope, revision]);

  useEffect(() => {
    const offHistory = on(HISTORY_CHANGED_EVENT, reload);
    const offEpisodes = on(EPISODES_CHANGED, reload);
    return () => { offHistory(); offEpisodes(); };
  }, [reload]);

  const loading = enabled && (state.scope !== scope || (state.loading && !state.loaded));
  const refreshing = enabled && state.scope === scope && state.loading;
  const error = enabled && state.scope === scope && state.error;
  const states = enabled && state.scope === scope ? state.states : EMPTY;
  const setWatched = useCallback(async (season, episodes, watched) => {
    if (!enabled || loading || refreshing || error || saving.current) return false;
    saving.current = true;
    // Ignore reads that started before this mutation.
    request.current++;
    try {
      const updates = await saveEpisodeWatches(userId, tmdbId, season, episodes, watched);
      setState(previous => previous.scope === scope
        ? { ...previous, states: { ...previous.states, ...updates } } : previous);
      emit(EPISODES_CHANGED);
      return true;
    } catch { return false; }
    finally { saving.current = false; }
  }, [enabled, loading, refreshing, error, userId, tmdbId, scope]);

  return { states, loading, refreshing, error, hasEpisodes: Object.keys(states).length > 0, setWatched, reload };
}
