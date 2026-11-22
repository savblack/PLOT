import { COMMON } from '../copy/common.js';

/* My Lists and a single list while their data loads (Nov 19): the page's own
   shape in the deeper cream, so the wait reads as "loading your lists" rather
   than a blank page. The shimmer is Home's (.home-personal-skeleton), and
   reduced motion stills it. */
export default function ListsLoading() {
  return (
    <div className="lists-loading" role="status" aria-label={COMMON.loading}>
      <div className="lists-loading-side" aria-hidden="true">
        <span className="home-personal-skeleton lists-loading-line lists-loading-line--title" />
        {[72, 58, 64, 50, 68].map((w, i) => (
          <span key={i} className="home-personal-skeleton lists-loading-line" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="lists-loading-grid" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="lists-loading-card">
            <span className="home-personal-skeleton lists-loading-poster" />
            <span className="home-personal-skeleton lists-loading-line" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
          </span>
        ))}
      </div>
    </div>
  );
}
