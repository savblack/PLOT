import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { loadPrivateNotes, privateNoteKey, savePrivateNote } from './privateNotes.js';
import { PRIVATE_NOTES } from './copy/privateNotes.js';

/** @param {string|null|undefined} userId */
export function usePrivateNotes(userId) {
  const [state, setState] = useState({ owner: null, rows: {}, loading: true, error: '' });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setState({ owner: userId, rows: {}, loading: !!userId, error: '' });
    if (!userId) return false;
    try {
      const rows = await loadPrivateNotes(supabase, userId);
      if (request !== generation.current) return false;
      setState({ owner: userId, rows, loading: false, error: '' });
      return true;
    } catch {
      if (request === generation.current) setState({ owner: userId, rows: {}, loading: false, error: PRIVATE_NOTES.loadError });
      return false;
    }
  }, [userId]);
  useEffect(() => {
    const counter = generation;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset account-scoped state before the asynchronous fetch, like other core data hooks
    reload();
    return () => { counter.current++; };
  }, [reload]);
  const save = useCallback(async (input) => {
    if (!userId) throw new Error(PRIVATE_NOTES.saveError);
    const request = generation.current;
    const row = await savePrivateNote(supabase, { ...input, userId });
    if (request === generation.current) setState(prev => ({ ...prev, rows: { ...prev.rows, [privateNoteKey(input.id, input.type)]: row } }));
    return row;
  }, [userId]);
  const owned = state.owner === userId;
  return { rows: owned ? state.rows : {}, loading: !owned || state.loading, error: owned ? state.error : '', reload, save };
}
