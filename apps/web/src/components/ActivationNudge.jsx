// The empty-library nudge (core/activationNudge.js): "Add your first show or
// movie" opens search, and one button per confirmed import source opens the
// import page on that source. Whoever renders it decides when
// (useActivationNudge): Home's top cards and History's empty state.
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ACTIVATION_NUDGE } from '@plot/core/copy/activationNudge.js';
import { EVENTS, track } from '../lib/analytics.js';
import { useApp } from '../hooks/useApp.js';
import ImportSourceIcon from './ImportSourceIcon.jsx';
import './ActivationNudge.css';

const T = ACTIVATION_NUDGE;

/**
 * @param {{
 *   surface: 'home' | 'history' | 'my_lists',
 *   sources: Array<{ id: string, name: string }>,
 * }} props
 */
export default function ActivationNudge({ surface, sources }) {
  const { openSearch } = useApp();
  const navigate = useNavigate();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    track(EVENTS.ACTIVATION_NUDGE_SHOWN, { surface });
  }, [surface]);

  return (
    <section className="activation-nudge" aria-labelledby={`activation-nudge-${surface}`}>
      <div className="activation-nudge-add">
        <h2 id={`activation-nudge-${surface}`}>{T.title}</h2>
        <p>{T.body}</p>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => { track(EVENTS.ACTIVATION_NUDGE_ADD_CLICKED, { surface }); openSearch?.(); }}
        >
          {T.add}
        </button>
      </div>
      {sources.length > 0 && (
        <div className="activation-nudge-import">
          <h3>{T.importTitle}</h3>
          <p>{T.importBody}</p>
          <div className="activation-nudge-sources">
            {sources.map(src => (
              <button
                key={src.id}
                type="button"
                className="activation-nudge-source"
                aria-label={T.importFrom(src.name)}
                onClick={() => {
                  track(EVENTS.ACTIVATION_NUDGE_IMPORT_CLICKED, { surface, source: src.id });
                  navigate(`/import?source=${src.id}`);
                }}
              >
                <ImportSourceIcon id={src.id} name={src.name} size={28} />
                <span>{src.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
