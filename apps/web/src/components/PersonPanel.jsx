// A person (cast or crew) opened on their own, in the panel.
//
// Tapping a cast member inside a title already showed them in the panel, but
// the same person opened from search, Home, Your People or History went to a
// full page instead (design audit, 10 Nov 2026, pick 1.1 A: panels for
// things, pages for places). This is the same view, in the same drawer, with
// its own address (`?panel=person-<id>`), so Back closes it and a title
// opened from their credits leads back here.
//
// Web only: mobile opens a person as a native screen.
import { useEffect, useState } from 'react';
import { tmdb } from '@plot/core/tmdb.js';
import { useApp } from '../hooks/useApp.js';
import { COMMON } from '../copy/common.js';
import { IconClose } from './navIcons.jsx';
import PanelCloseRail from './PanelCloseRail.jsx';
import TalentPanelView from './TalentPanelView.jsx';
import '../pages/TalentPage.css';

export default function PersonPanel({ personId, closing, onClose }) {
  const { openPanel } = useApp();
  const [loaded, setLoaded] = useState({ id: null, person: null, credits: null, error: false });

  useEffect(() => {
    let cancelled = false;
    Promise.all([tmdb.getPersonDetails(personId), tmdb.getPersonCredits(personId)]).then(([person, credits]) => {
      if (cancelled) return;
      setLoaded(person && credits ? { id: personId, person, credits, error: false } : { id: personId, person: null, credits: null, error: true });
    }).catch(() => { if (!cancelled) setLoaded({ id: personId, person: null, credits: null, error: true }); });
    return () => { cancelled = true; };
  }, [personId]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !closing) { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closing, onClose]);

  // What was loaded for another person is not this one's: show the spinner.
  const current = loaded.id === personId ? loaded : { person: null, credits: null, error: false };

  return (
    <>
      <div className={`panel-overlay${closing ? ' closing' : ''}`} onClick={onClose} />
      <PanelCloseRail closing={closing} onClose={onClose} />
      <div className={`panel${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label={current.person?.name || COMMON.loading}>
        {/* No cover band: a portrait stretched across one zooms in on the face. */}
        <div className="panel-toolbar">
          <span aria-hidden="true" />
          <button type="button" className="panel-toolbar-btn" onClick={onClose} aria-label={COMMON.close}>
            <IconClose />
          </button>
        </div>
        <div className="panel-body">
          <TalentPanelView
            person={current.person}
            credits={current.credits}
            error={current.error}
            onOpenTitle={(id, type) => openPanel(id, type, 'person')}
          />
        </div>
      </div>
    </>
  );
}
