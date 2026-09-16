import { useState } from 'react';
import { AppContext } from '../hooks/useApp.js';
import { WantToWatchSection } from '../components/ListSections.jsx';
import PrivateNote from '../components/PrivateNote.jsx';
import { PRIVATE_NOTES } from '@plot/core/copy/privateNotes.js';
// Reuses a verified TMDB response: publicListSharing.test.js. All notes are fictional.
const id = 95396;
function Preview({ failure = false, existing = false, list = false }) {
  const [rows, setRows] = useState(existing ? { 'tv:95396': { note: 'Watch with Alex. No getting ahead.', revision: 1 } } : {});
  const store = {
    rows, loading: false, error: '', reload: async () => true,
    save: async ({ text, revision }) => {
      if (failure) throw new Error(PRIVATE_NOTES.saveError);
      const row = { note: text.trim(), revision: revision + 1 };
      setRows({ 'tv:95396': row });
      return row;
    },
  };
  return <AppContext.Provider value={{ user: { id: 'fictional-preview' }, privateNotes: store, openPanel: () => {}, watchlist: { removeFromList: async () => true } }}>
    <div style={{ fontFamily: 'var(--font-sans)', maxWidth: 680, padding: 24, margin: 'auto', color: 'var(--text-primary)', background: 'var(--bg)' }}>
      {list ? <WantToWatchSection items={[{ id: 'fixture-row', tmdb_id: id, media_type: 'tv', title: 'Severance' }]} narrowed={false} /> : <><h2>Severance</h2><PrivateNote id={id} type="tv" title="Severance" /></>}
    </div>
  </AppContext.Provider>;
}
export default { title: 'Lists/PrivateNote', component: Preview };
export const Empty = {};
export const Saved = { args: { existing: true } };
export const FailedSave = { args: { failure: true } };

export const Watchlist = { args: { list: true, existing: true } };
