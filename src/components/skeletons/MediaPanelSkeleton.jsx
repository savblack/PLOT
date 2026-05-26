import Skeleton from '../Skeleton.jsx';

function EpRow() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.55rem 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <Skeleton width={28} height={28} radius="50%" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <Skeleton width="50%" height={12} style={{ marginBottom: '0.3rem' }} />
        <Skeleton width={72} height={10} />
      </div>
    </div>
  );
}

export default function MediaPanelSkeleton() {
  return (
    <div style={{ padding: '1rem 1rem 2rem' }}>
      {/* Title */}
      <Skeleton width="65%" height={22} style={{ marginBottom: '0.6rem' }} />

      {/* Meta chips */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
        {[48, 64, 80].map((w, i) => (
          <Skeleton key={i} width={w} height={20} radius="var(--radius-pill)" />
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[1, 2, 3].map(i => (
          <Skeleton key={i} style={{ flex: 1, height: 40, borderRadius: 'var(--radius-sm)' }} />
        ))}
      </div>

      {/* Overview lines */}
      <Skeleton width="100%" height={12} style={{ marginBottom: '0.4rem' }} />
      <Skeleton width="90%"  height={12} style={{ marginBottom: '0.4rem' }} />
      <Skeleton width="70%"  height={12} style={{ marginBottom: '1.5rem' }} />

      {/* Section label */}
      <Skeleton width={80} height={13} style={{ marginBottom: '0.75rem' }} />

      {/* Episode rows */}
      {Array.from({ length: 4 }).map((_, i) => <EpRow key={i} />)}
    </div>
  );
}
