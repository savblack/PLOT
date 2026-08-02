import PlotLoader from '@plot/ui/PlotLoader.jsx';

export default {
  title: 'Components/PlotLoader',
  component: PlotLoader,
  argTypes: {
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg', 'button'] },
    tone: { control: 'select', options: ['auto', 'light', 'dark'] },
  },
  args: {
    size: 'lg',
    tone: 'auto',
    label: 'Loading',
  },
};

export const Default = {};

export const Sizes = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
    {['xs', 'sm', 'md', 'lg'].map((size) => (
      <div key={size} style={{ textAlign: 'center' }}>
        <PlotLoader size={size} />
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{size}</div>
      </div>
    ))}
  </div>
);

export const OnDark = () => (
  <div style={{ background: '#0c0c0c', padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
    <PlotLoader tone="dark" />
  </div>
);
