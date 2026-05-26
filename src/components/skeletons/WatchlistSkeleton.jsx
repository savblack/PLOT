import Skeleton from '../Skeleton.jsx';

function PosterCard() {
  return (
    <div>
      <Skeleton style={{ width: '100%', aspectRatio: '2/3', borderRadius: 'var(--radius-md)', marginBottom: '0.45rem' }} />
      <Skeleton width="75%" height={11} />
    </div>
  );
}

function SectionBlock({ label = 80, count = 3 }) {
  return (
    <div style={{ padding: '0.75rem 1rem 0' }}>
      <Skeleton width={label} height={13} style={{ marginBottom: '0.75rem' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
        {Array.from({ length: count }).map((_, i) => <PosterCard key={i} />)}
      </div>
    </div>
  );
}

export default function WatchlistSkeleton() {
  return (
    <div style={{ paddingBottom: '2rem' }}>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem', overflow: 'hidden' }}>
        {[72, 60, 80, 68].map((w, i) => (
          <Skeleton key={i} width={w} height={28} radius="var(--radius-pill)" />
        ))}
      </div>

      <SectionBlock label={90} count={3} />
      <SectionBlock label={60} count={6} />
    </div>
  );
}
