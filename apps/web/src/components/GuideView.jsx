import EpgView from './EpgView.jsx';

/* ── Guide route ──
   The schedule grid was a sub-tab of Home. It is a destination of its own now:
   a programme guide is a different mode from a discovery feed, and it needs
   the full column height that the wrapper class gives it. Upcoming used to
   live in this file too; it is Calendar's "All releases" now, with its data
   plumbing in hooks/useFilteredUpcoming.js and its card in MediaCard.jsx. */
export default function GuideView() {
  return (
    <div className="guide-schedule-mode">
      <EpgView />
    </div>
  );
}
