import Skeleton from '../Skeleton.jsx';

function PosterCard() {
  return (
    <div style={{ flexShrink: 0, width: 120 }}>
      <Skeleton style={{ width: 120, aspectRatio: '2/3', borderRadius: 'var(--radius-md)', marginBottom: '0.45rem' }} />
      <Skeleton width="80%" height={11} />
    </div>
  );
}

function SectionLabel({ subLabel, labelWidth = 160 }) {
  return (
    <div style={{ padding: '1.1rem 1rem 0.25rem' }}>
      <Skeleton width={80} height={9} style={{ marginBottom: '0.3rem' }} />
      <Skeleton width={labelWidth} height={20} />
    </div>
  );
}

function ChartRowSkel() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 1rem' }}>
      <Skeleton width={28} height={16} style={{ borderRadius: 2 }} />
      <Skeleton width={40} height={56} style={{ borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <Skeleton width="55%" height={13} />
        <Skeleton width={72} height={10} />
      </div>
    </div>
  );
}

export default function DiscoverSkeleton() {
  return (
    <div>
      {/* Hero */}
      <Skeleton style={{ width: '100%', height: 200, borderRadius: 0 }} />

      {/* Hot Right Now rail */}
      <SectionLabel subLabel="Trending today" labelWidth={140} />
      <div style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 1rem 1rem', overflow: 'hidden' }}>
        {Array.from({ length: 5 }).map((_, i) => <PosterCard key={i} />)}
      </div>

      {/* Top 20 This Week chart */}
      <SectionLabel subLabel="Global ranking" labelWidth={170} />
      {Array.from({ length: 6 }).map((_, i) => <ChartRowSkel key={i} />)}
    </div>
  );
}
