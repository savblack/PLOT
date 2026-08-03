import ProfileBadges from '../components/ProfileBadges.jsx';

export default {
  title: 'Components/ProfileBadges',
  component: ProfileBadges,
  argTypes: {
    isPremium: { control: 'boolean' },
    isSupporter: { control: 'boolean' },
    size: { control: { type: 'range', min: 12, max: 32, step: 1 } },
  },
  args: {
    isPremium: true,
    isSupporter: true,
    size: 15,
  },
};

const Name = ({ children, ...rest }) => (
  <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
    {children}
    <ProfileBadges {...rest} />
  </div>
);

export const Default = {
  render: (args) => <Name {...args}>Sam Rivera</Name>,
};

// The four states side by side — the pair has to stay legible when only one
// badge is present and when both are.
export const AllStates = () => (
  <div style={{ display: 'grid', gap: '0.75rem' }}>
    <Name isPremium={false} isSupporter={false}>Neither</Name>
    <Name isPremium isSupporter={false}>Premium only</Name>
    <Name isPremium={false} isSupporter>Supporter only</Name>
    <Name isPremium isSupporter>Both</Name>
  </div>
);

// Profile-header size, where the glyph detail has to hold up.
export const Large = () => (
  <div style={{ fontWeight: 600, fontSize: '1.6rem', color: 'var(--text-primary)' }}>
    Sam Rivera
    <ProfileBadges isPremium isSupporter size={24} />
  </div>
);
