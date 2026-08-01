import SectionToggleIcon from '../components/SectionToggleIcon.jsx';

export default {
  title: 'Components/SectionToggleIcon',
  component: SectionToggleIcon,
  argTypes: {
    collapse: { control: 'boolean' },
  },
  args: {
    collapse: false,
  },
};

export const Default = {
  render: (args) => (
    <div style={{ width: 24, height: 24, color: 'var(--text-primary)' }}>
      <SectionToggleIcon {...args} />
    </div>
  ),
};

export const Both = () => (
  <div style={{ display: 'flex', gap: '2rem', color: 'var(--text-primary)' }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 24, height: 24 }}><SectionToggleIcon collapse={false} /></div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>expand</div>
    </div>
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 24, height: 24 }}><SectionToggleIcon collapse /></div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>collapse</div>
    </div>
  </div>
);
