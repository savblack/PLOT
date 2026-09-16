// Web rendering; shared draft/storage logic is also consumed by the native editor.
import { useId, useRef } from 'react';
import { useApp } from '../hooks/useApp.js';
import { usePrivateNoteEditor } from '@plot/core/usePrivateNoteEditor.js';
import { PRIVATE_NOTE_LIMIT, noteLength } from '@plot/core/privateNotes.js';
import { PRIVATE_NOTES as COPY } from '@plot/core/copy/privateNotes.js';
import { COMMON } from '@plot/core/copy/common.js';
import './PrivateNote.css';

function Lock() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>;
}

export default function PrivateNote(props) {
  const { privateNotes, user } = useApp();
  if (!privateNotes || !user) return null;
  return <NoteEditor key={`${user.id}:${props.type}:${props.id}`} {...props} store={privateNotes} />;
}

function NoteEditor({ store, id, type, title }) {
  const editor = usePrivateNoteEditor(store, id, type, title);
  const labelId = useId();
  const trigger = useRef(null);
  const close = () => { editor.cancel(); requestAnimationFrame(() => trigger.current?.focus()); };
  const save = async (remove = false) => { await editor.save(remove); requestAnimationFrame(() => trigger.current?.focus()); };
  return (
    <div className="private-note ph-no-capture ph-mask" data-private="true">
      {store.loading ? <span className="private-note-muted">{COPY.loading}</span> : store.error ? (
        <div role="alert">{store.error} <button type="button" className="btn btn-ghost btn-sm" onClick={store.reload}>{COPY.reload}</button></div>
      ) : editor.editing ? (
        <form onSubmit={e => { e.preventDefault(); save(); }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); if (!editor.busy) close(); } }}>
          <label htmlFor={labelId}><Lock />{COPY.label}</label>
          <textarea id={labelId} value={editor.draft} onChange={e => editor.setDraft(e.target.value)} placeholder={COPY.placeholder} autoFocus disabled={editor.busy} aria-describedby={`${labelId}-privacy`} />
          <div className="private-note-help"><span id={`${labelId}-privacy`}>{COPY.privacy}</span><span>{noteLength(editor.draft)}/{PRIVATE_NOTE_LIMIT}</span></div>
          {editor.error && <p role="alert">{editor.error}</p>}
          <div className="private-note-actions">
            {editor.note && <button type="button" className="btn btn-ghost btn-sm" disabled={editor.busy || editor.conflict} onClick={() => save(true)}>{COMMON.delete}</button>}
            <button type="button" className="btn btn-ghost btn-sm" disabled={editor.busy} onClick={close}>{COMMON.cancel}</button>
            {editor.conflict ? <button type="button" className="btn btn-ghost btn-sm" onClick={editor.reload}>{COPY.reload}</button> : <button className="btn btn-primary btn-sm" disabled={editor.busy || noteLength(editor.draft) > PRIVATE_NOTE_LIMIT || !editor.draft.trim()}>{editor.busy ? COMMON.saving : COPY.save}</button>}
          </div>
        </form>
      ) : (
        <button ref={trigger} type="button" className={`private-note-trigger${editor.note ? ' has-note' : ''}`} onClick={editor.begin} aria-label={`${editor.note ? COPY.edit : COPY.add}: ${title}`}><Lock /><span>{editor.note || COPY.add}</span></button>
      )}
      <span className="sr-only" role="status">{editor.status}</span>
    </div>
  );
}
