import Skeleton from '../Skeleton.jsx';

function ListSection() {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {/* Section header */}
      <div style={{ padding: '0.5rem 1rem 0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Skeleton width={24} height={24} radius="var(--radius-sm)" />
        <Skeleton width={140} height={17} />
      </div>

      {/* Poster rail */}
      <div style={{ display: 'flex', gap: '0.6rem', padding: '0.25rem 1rem', overflow: 'hidden' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ flexShrink: 0, width: 88 }}>
            <Skeleton style={{ width: 88, aspectRatio: '2/3', borderRadius: 'var(--radius-sm)', marginBottom: '0.35rem' }} />
            <Skeleton width="75%" height={10} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MyListsSkeleton() {
  return (
    <div style={{ padding: '0.5rem 0' }}>
      <ListSection />
      <ListSection />
      <ListSection />
    </div>
  );
}
