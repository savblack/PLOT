import { useState } from 'react';
import { privateNoteKey } from './privateNotes.js';
import { PRIVATE_NOTES } from './copy/privateNotes.js';

/** Shared draft and conflict handling. Drafts stay in memory, never device storage or analytics. */
export function usePrivateNoteEditor(store, id, type, title) {
  const row = store.rows[privateNoteKey(id, type)];
  const [draft, setDraft] = useState(/** @type {string|null} */ (null));
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [status, setStatus] = useState('');
  const begin = () => {
    if (draft === null) { setDraft(row?.note || ''); setRevision(row?.revision || 0); }
    setEditing(true); setStatus('');
  };
  const cancel = () => { setDraft(null); setEditing(false); setError(''); setConflict(false); };
  const save = async (remove = false) => {
    if (busy || conflict) return;
    setBusy(true); setError('');
    try {
      await store.save({ id, type, title, text: remove ? '' : draft, revision });
      setDraft(null); setEditing(false); setStatus(remove ? PRIVATE_NOTES.deleted : PRIVATE_NOTES.saved);
    } catch (e) { setError(e.conflict ? PRIVATE_NOTES.conflict : PRIVATE_NOTES.saveError); setConflict(!!e.conflict); }
    finally { setBusy(false); }
  };
  const reload = async () => { if (await store.reload()) cancel(); };
  return { note: row?.note || '', draft: draft ?? '', setDraft, editing, begin, cancel, busy, error, conflict, status, save, reload };
}
