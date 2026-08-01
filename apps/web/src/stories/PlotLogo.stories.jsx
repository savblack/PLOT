import PlotLogo from '../components/PlotLogo.jsx';

export default {
  title: 'Components/PlotLogo',
  component: PlotLogo,
};

export const Default = () => <PlotLogo />;

export const OnDark = () => (
  <div style={{ background: '#0c0c0c', padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
    <PlotLogo white />
  </div>
);

export const CustomSize = () => <PlotLogo style={{ fontSize: '3rem' }} />;
