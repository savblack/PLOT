import { COMMON } from '@plot/core/copy/common.js';
import { expect, fireEvent, waitFor, within } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { AppContext } from '../hooks/useApp.js';
import UpgradeSheet, { UpgradeSheetView } from '../components/UpgradeSheet.jsx';
import PremiumPurchaseAction from '../components/PremiumPurchaseAction.jsx';

/* The in-app upgrade sheet for a Free viewer who has hit the list limit. It
   portals to document.body, so the story canvas is the whole viewport. */

const app = { profile: { id: 'story-user', is_premium: false } };
const S = PLANS_PAGE.upgradeSheet;

export default {
  title: 'Premium/UpgradeSheet',
  component: UpgradeSheet,
  parameters: { layout: 'fullscreen' },
  args: { reason: 'lists', onClose: () => {} },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/my-lists']}>
        <AppContext.Provider value={app}>
          <Story />
        </AppContext.Provider>
      </MemoryRouter>
    ),
  ],
};

export const Lists = {};
export const Themes = { args: { reason: 'themes' } };

// Focus opens on the sheet itself; Shift+Tab from there must wrap inside it.
export const ReverseTabStaysInside = {
  tags: ['interaction-test'],
  play: async () => {
    const body = within(document.body);
    const dialog = body.getByRole('dialog');
    await waitFor(() => expect(dialog).toHaveFocus());
    fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: true });
    // The last control is See everything; Cancel in the header is the first.
    await expect(body.getByRole('button', { name: PLANS_PAGE.upgradeSheet.seeAll })).toHaveFocus();
  },
};

// Premium is live, so the offer is not labelled "Coming soon" and Upgrade is a real button.
// (Clicking it starts Stripe checkout or sends a signed-out visitor to sign up, which
// would navigate the story frame, so this only checks what the sheet offers.)
export const UpgradeOffersPremium = {
  tags: ['interaction-test'],
  play: async () => {
    const body = within(document.body);
    // Storybook has no billing server, so the read never answers: the offer
    // shows once its short wait is over.
    await expect(await body.findByRole('button', { name: PLANS_PAGE.upgradeAction }, { timeout: 4000 })).toBeEnabled();
    await expect(body.queryByText('Coming soon')).toBeNull();
  },
};

export const SmartLists = { args: { reason: 'smartLists' } };

// The purchase button on its own, for someone who has never subscribed
// (premium.trialEligible, from core/billing.js). Everyone else keeps Upgrade.
const offer = { checkoutAvailable: true, busy: false, startCheckout: () => {} };
export const StartFreeTrialLabel = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, padding: 24 }}>
      <PremiumPurchaseAction premium={{ ...offer, trialEligible: true }} plan="yearly" />
      <PremiumPurchaseAction premium={{ ...offer, trialEligible: false }} plan="yearly" />
    </div>
  ),
  tags: ['interaction-test'],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: PLANS_PAGE.startTrialAction })).toBeEnabled();
    await expect(canvas.getByRole('button', { name: PLANS_PAGE.upgradeAction })).toBeEnabled();
  },
};

// The sheet with a made-up billing state. Storybook has no billing server, so
// these render UpgradeSheetView, which takes the state it is given. Each story
// records what a press would send to checkout.
const sent = [];
const billingState = (over = {}) => ({
  checkoutAvailable: true, busy: false, error: null, billingReady: true, trialEligible: false,
  startCheckout: (plan) => { sent.push(plan); },
  ...over,
});
const view = (premium, reason = 'stats') => ({
  render: (args) => <UpgradeSheetView {...args} reason={reason} premium={premium} />,
});

// Someone who has never subscribed: the free trial is the headline and the
// button, and the feature they tapped is the sentence under it.
export const TrialFirst = {
  ...view(billingState({ trialEligible: true })),
  tags: ['interaction-test'],
  play: async () => {
    sent.length = 0;
    const body = within(document.body);
    await expect(body.getByRole('heading', { name: S.trialTitle })).toBeVisible();
    await expect(body.getByText(S.reasons.stats.title)).toBeVisible();
    const start = body.getByRole('button', { name: PLANS_PAGE.startTrialAction });
    const annual = body.getByRole('button', { name: new RegExp(`^${PLANS_PAGE.billing.annual}`) });
    const monthly = body.getByRole('button', { name: new RegExp(`^${PLANS_PAGE.billing.monthly}`) });
    // Annual is chosen first; the line says what it costs after the trial,
    // and that is the plan a press sends.
    await expect(annual).toHaveAttribute('aria-pressed', 'true');
    await expect(monthly).toHaveAttribute('aria-pressed', 'false');
    await expect(body.getByText(S.afterTrial.yearly)).toBeVisible();
    fireEvent.click(start);
    // Choosing Monthly changes the row, the line and the plan together.
    fireEvent.click(monthly);
    await expect(monthly).toHaveAttribute('aria-pressed', 'true');
    await expect(annual).toHaveAttribute('aria-pressed', 'false');
    await expect(body.getByText(S.afterTrial.monthly)).toBeVisible();
    await expect(body.queryByText(S.afterTrial.yearly)).toBeNull();
    fireEvent.click(start);
    await expect(sent).toEqual(['yearly', 'monthly']);
    // The older sheet's extra selling is gone.
    await expect(body.queryByText(S.alsoIn)).toBeNull();
  },
};

// A returning subscriber gets no trial: the feature leads, the button says
// Upgrade, and the price line makes no mention of a trial.
export const ReturningSubscriber = {
  ...view(billingState({ trialEligible: false })),
  tags: ['interaction-test'],
  play: async () => {
    const body = within(document.body);
    await expect(body.getByRole('heading', { name: S.reasons.stats.title })).toBeVisible();
    await expect(body.queryByText(S.trialTitle)).toBeNull();
    await expect(body.getByRole('button', { name: PLANS_PAGE.upgradeAction })).toBeEnabled();
    await expect(body.getByText(S.price.yearly)).toBeVisible();
    await expect(body.queryByText(S.afterTrial.yearly)).toBeNull();
  },
};

// Checkout closed: nothing is for sale, so there is no trial headline and no
// plans to pick, even for someone who would otherwise be offered the trial.
export const WaitlistWhenCheckoutIsClosed = {
  ...view(billingState({ checkoutAvailable: false, trialEligible: true })),
  tags: ['interaction-test'],
  play: async () => {
    const body = within(document.body);
    await expect(body.getByRole('heading', { name: S.reasons.stats.title })).toBeVisible();
    await expect(body.queryByText(S.trialTitle)).toBeNull();
    await expect(body.getByRole('link', { name: PLANS_PAGE.waitlistAction })).toBeVisible();
    await expect(body.queryByRole('group', { name: S.planLabel })).toBeNull();
    await expect(body.queryByText(S.afterTrial.yearly)).toBeNull();
    await expect(body.queryByText(S.price.yearly)).toBeNull();
  },
};

// Before the first billing read answers, the offer is held back rather than
// drawn as the no-trial version and then swapped.
export const HeldUntilBillingIsKnown = {
  ...view(billingState({ billingReady: false })),
  tags: ['interaction-test'],
  play: async () => {
    const dialog = within(document.body).getByRole('dialog');
    await expect(dialog.querySelector('.upgrade-sheet-offer')).toHaveAttribute('aria-busy', 'true');
    await expect(dialog.querySelector('.upgrade-sheet-title')).not.toBeVisible();
    // Cancel still works while it waits.
    await expect(within(dialog).getByRole('button', { name: COMMON.cancel })).toBeVisible();
  },
};

// The themes sheet keeps its light and dark preview and its line under a trial headline.
export const TrialFirstThemes = {
  ...view(billingState({ trialEligible: true }), 'themes'),
  args: { family: 'sage' },
  tags: ['interaction-test'],
  play: async () => {
    const body = within(document.body);
    await expect(body.getByRole('heading', { name: S.trialTitle })).toBeVisible();
    await expect(body.getByText(S.reasons.themes.title)).toBeVisible();
    await expect(body.getByText(/That’s Sage, in light and dark\./)).toBeVisible();
  },
};
