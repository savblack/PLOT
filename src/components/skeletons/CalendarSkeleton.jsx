import Skeleton from '../Skeleton.jsx';

const EVENT_WIDTHS = ['60%', '45%', '55%'];

export default function CalendarSkeleton() {
  return (
    <div style={{ padding: '0.5rem 0' }}>
      {EVENT_WIDTHS.map((w, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.45rem 1rem',
            borderBottom: i < EVENT_WIDTHS.length - 1 ? '1px solid var(--border)' : 'none',
          }}
        >
          <Skeleton width={32} height={32} style={{ borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <Skeleton width={w} height={12} style={{ marginBottom: '0.3rem' }} />
            <Skeleton width={64} height={10} />
          </div>
        </div>
      ))}
    </div>
  );
}
