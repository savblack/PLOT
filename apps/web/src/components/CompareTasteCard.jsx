// The side-column way into Compare: a line on what it is and one button.
// Shared by History and Watch Together so both columns carry the same card.
// The Compare page shows a sample to anyone and the Premium prompt when a
// Free viewer picks a person, so this needs no gate of its own.
//
// Mobile's twin is apps/mobile/components/taste/ComparePrompt.tsx; the words
// are TASTE_OVERLAP in @plot/core/copy.
import { Link } from 'react-router-dom';
import { TASTE_OVERLAP } from '../copy/tasteOverlap.js';

export default function CompareTasteCard() {
  return (
    <div className="hist-card">
      <span className="hist-card-label">{TASTE_OVERLAP.historyPromptTitle}</span>
      <div className="hist-card-body">
        <span className="hist-card-note">{TASTE_OVERLAP.historyPromptBody}</span>
        <Link className="btn btn-sm btn-secondary" to="/compare" style={{ alignSelf: 'flex-start' }}>{TASTE_OVERLAP.compareTaste}</Link>
      </div>
    </div>
  );
}
