import Skeleton from '../Skeleton.jsx';

const ROW_TITLE_WIDTHS = ['55%', '45%', '60%', '40%', '50%', '65%'];

function HistoryRow({ titleWidth }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem' }}>
      <Skeleton width={48} height={64} style={{ borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <Skeleton width={titleWidth} height={13} style={{ marginBottom: '0.4rem' }} />
        <Skeleton width={88} height={10} />
      </div>
    </div>
  );
}

export default function HistorySkeleton() {
  return (
    <div>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem' }}>
        {[50, 62, 42].map((w, i) => (
          <Skeleton key={i} width={w} height={28} radius="var(--radius-pill)" />
        ))}
      </div>

      {/* Month group header */}
      <div style={{ padding: '0.4rem 1rem 0.2rem' }}>
        <Skeleton width={120} height={13} />
      </div>

      {ROW_TITLE_WIDTHS.map((w, i) => <HistoryRow key={i} titleWidth={w} />)}
    </div>
  );
}
