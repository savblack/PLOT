import { COMMON } from '@plot/core/copy/common.js';
import { PREMIUM_WAITLIST } from '@plot/core/copy/premiumWaitlist.js';
import PremiumWaitlistForm from '../components/PremiumWaitlistForm.jsx';

const noop = () => {};

function Frame({ children }) {
  return (
    <div style={{ width: 'min(440px, 100%)', padding: 24, background: 'var(--surface-raised)', color: 'var(--text-primary)' }}>
      <h2 style={{ marginTop: 0 }}>{PREMIUM_WAITLIST.headline('Custom themes')}</h2>
      <p>{PREMIUM_WAITLIST.body}</p>
      {children}
    </div>
  );
}

export default {
  title: 'Premium/Waitlist',
  component: PremiumWaitlistForm,
};

export const Email = {
  render: () => (
    <Frame>
      <PremiumWaitlistForm signedIn={false} joined={false} busy={false} email="" invalid={false} error="" onEmail={noop} onSubmit={noop} />
    </Frame>
  ),
};

export const InvalidEmail = {
  render: () => (
    <Frame>
      <PremiumWaitlistForm signedIn={false} joined={false} busy={false} email="not-an-email" invalid error="" onEmail={noop} onSubmit={noop} />
    </Frame>
  ),
};

export const Failed = {
  render: () => (
    <Frame>
      <PremiumWaitlistForm signedIn={false} joined={false} busy={false} email="reader@example.com" invalid={false} error={COMMON.genericError} onEmail={noop} onSubmit={noop} />
    </Frame>
  ),
};

export const SignedIn = {
  render: () => (
    <Frame>
      <PremiumWaitlistForm signedIn joined={false} busy={false} email="" invalid={false} error="" onEmail={noop} onSubmit={noop} />
    </Frame>
  ),
};

export const Joined = {
  render: () => (
    <Frame>
      <PremiumWaitlistForm signedIn={false} joined busy={false} email="" invalid={false} error="" onEmail={noop} onSubmit={noop} />
    </Frame>
  ),
};
