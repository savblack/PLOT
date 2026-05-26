import Skeleton from '../Skeleton.jsx';

const BLOCK_WIDTHS = [
  [160, 100, 200],
  [80,  220, 120],
  [200, 100,  90],
  [120, 180, 140],
  [90,  160, 220],
  [140, 100, 180],
  [200,  80, 130],
];

function ChannelRow({ widths }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.55rem 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <Skeleton width={72} height={14} style={{ flexShrink: 0 }} />
      <div style={{ display: 'flex', gap: '0.4rem', flex: 1, overflow: 'hidden' }}>
        {widths.map((w, j) => (
          <Skeleton key={j} width={w} height={36} style={{ borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
        ))}
      </div>
    </div>
  );
}

export default function EpgSkeleton() {
  return (
    <div style={{ padding: '0.75rem 1rem' }}>
      {/* Date chip nav */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflow: 'hidden' }}>
        {[52, 60, 48, 56, 52, 48].map((w, i) => (
          <Skeleton key={i} width={w} height={30} radius="var(--radius-pill)" />
        ))}
      </div>

      {/* Channel rows */}
      {BLOCK_WIDTHS.map((widths, i) => <ChannelRow key={i} widths={widths} />)}
    </div>
  );
}
