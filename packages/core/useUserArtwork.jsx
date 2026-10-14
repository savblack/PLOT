import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyArtwork, artworkMap, artworkPath, artworkSubject } from './artwork.js';
import { clearUserArtwork, readUserArtwork, saveUserArtwork } from './artworkStore.js';
import { ARTWORK } from './copy/artwork.js';
import { ArtworkContext } from './userArtworkContext.js';

const EMPTY_ROWS = [];

function withRow(rows, row) {
  const key = `${row.subject_type}:${row.tmdb_id}:${row.season_number}:${row.kind}`;
  return [...rows.filter(existing => `${existing.subject_type}:${existing.tmdb_id}:${existing.season_number}:${existing.kind}` !== key), row];
}

function withoutSubject(rows, subject) {
  const key = `${subject.subject_type}:${subject.tmdb_id}:${subject.season_number}:${subject.kind}`;
  return rows.filter(existing => `${existing.subject_type}:${existing.tmdb_id}:${existing.season_number}:${existing.kind}` !== key);
}

/**
 * Loads this account's artwork once. Children resolve paths from that map.
 * Nothing is fetched or applied unless premium is true.
 * @param {{ userId?: string | null, premium?: boolean, children?: import('react').ReactNode }} props
 */
export function ArtworkProvider({ userId = null, premium = false, children }) {
  const enabled = !!userId && premium === true;
  const [state, setState] = useState({ userId: '', rows: EMPTY_ROWS, loaded: false, error: false });
  const [revision, setRevision] = useState(0);
  const [saveError, setSaveError] = useState(null);
  const request = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const version = ++request.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the previous account's rows only until this account's read returns
    setState(previous => ({
      userId,
      rows: previous.userId === userId ? previous.rows : EMPTY_ROWS,
      loaded: previous.userId === userId && previous.loaded,
      error: false,
    }));
    readUserArtwork(userId).then(rows => {
      if (!cancelled && version === request.current) setState({ userId, rows, loaded: true, error: false });
    }).catch(() => {
      if (!cancelled && version === request.current) {
        setState(previous => ({ ...previous, userId, loaded: false, error: true }));
      }
    });
    return () => { cancelled = true; };
  }, [enabled, userId, revision]);

  const rows = enabled && state.userId === userId && !state.error ? state.rows : EMPTY_ROWS;
  const map = useMemo(() => artworkMap(rows), [rows]);
  const ready = enabled && state.userId === userId && state.loaded && !state.error;

  const save = useCallback(async (choice) => {
    if (!enabled) return false;
    setSaveError(null);
    try {
      const row = await saveUserArtwork(userId, choice);
      request.current += 1;
      setState(previous => ({
        userId,
        rows: withRow(previous.userId === userId ? previous.rows : EMPTY_ROWS, row),
        loaded: true,
        error: false,
      }));
      return true;
    } catch {
      setSaveError(ARTWORK.couldNotSave);
      return false;
    }
  }, [enabled, userId]);

  const clear = useCallback(async (choice) => {
    if (!userId) return false;
    const subject = artworkSubject(choice);
    if (!subject) return false;
    setSaveError(null);
    try {
      await clearUserArtwork(userId, choice);
      request.current += 1;
      setState(previous => ({
        userId,
        rows: withoutSubject(previous.userId === userId ? previous.rows : EMPTY_ROWS, subject),
        loaded: true,
        error: false,
      }));
      return true;
    } catch {
      setSaveError(ARTWORK.couldNotSave);
      return false;
    }
  }, [userId]);

  const artwork = useMemo(() => ({
    premium: enabled,
    ready,
    error: saveError,
    path: (subjectType, tmdbId, kind, seasonNumber) => (enabled ? artworkPath(map, subjectType, tmdbId, kind, seasonNumber) : null),
    apply: (item) => (enabled ? applyArtwork(item, map) : item),
    save,
    clear,
    reload: () => setRevision(version => version + 1),
  }), [enabled, ready, saveError, map, save, clear]);

  return <ArtworkContext.Provider value={artwork}>{children}</ArtworkContext.Provider>;
}
