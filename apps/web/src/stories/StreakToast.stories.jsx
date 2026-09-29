import { StreakToastView } from '../components/StreakToast.jsx';

/* The streak moment: the toast after a watch completes a 7, 14, 30 or
   every-30 day streak. "Share it" opens the share sheet on the Streak card
   in the app; here it is a no-op. */

export default {
  title: 'Components/StreakToast',
  component: StreakToastView,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div style={{ minHeight: '60vh', background: 'var(--bg)' }}><Story /></div>],
  args: { days: 7, onShare: () => {}, onDismiss: () => {} },
};

export const Seven = {};
export const Thirty = { args: { days: 30 } };
