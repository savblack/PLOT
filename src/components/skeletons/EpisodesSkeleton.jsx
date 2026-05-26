import Skeleton from '../Skeleton.jsx';

export default function EpisodesSkeleton() {
  return (
    <div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.55rem 0',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <Skeleton width={28} height={28} radius="50%" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <Skeleton width="50%" height={12} style={{ marginBottom: '0.3rem' }} />
            <Skeleton width={72} height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}
