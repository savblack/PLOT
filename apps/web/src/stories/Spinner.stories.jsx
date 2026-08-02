import Spinner from '../components/Spinner.jsx';

export default {
  title: 'Components/Spinner',
  component: Spinner,
  argTypes: {
    size: { control: 'select', options: ['xs', 'sm', 'md', 'button'] },
  },
  args: {
    size: 'sm',
    label: 'Loading',
  },
};

export const Default = {};

export const Sizes = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
    {['xs', 'sm', 'md', 'button'].map((size) => (
      <div key={size} style={{ textAlign: 'center' }}>
        <Spinner size={size} />
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{size}</div>
      </div>
    ))}
  </div>
);

export const InButton = () => (
  <button
    type="button"
    disabled
    style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
      background: 'var(--text-primary)', color: 'var(--surface)',
      border: 'none', borderRadius: '9999px', padding: '0.55rem 1.1rem',
      fontSize: '0.85rem', fontWeight: 600,
    }}
  >
    <Spinner size="button" ariaHidden />
    Working…
  </button>
);
