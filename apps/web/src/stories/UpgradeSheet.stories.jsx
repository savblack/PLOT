import { expect, fireEvent, waitFor, within } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { AppContext } from '../hooks/useApp.js';
import UpgradeSheet from '../components/UpgradeSheet.jsx';
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
    await expect(body.getByRole('button', { name: PLANS_PAGE.upgradeSheet.notNow })).toHaveFocus();
  },
};

// Premium is live, so the offer is not labelled "Coming soon" and Upgrade is a real button.
// (Clicking it starts Stripe checkout or sends a signed-out visitor to sign up, which
// would navigate the story frame, so this only checks what the sheet offers.)
export const UpgradeOffersPremium = {
  tags: ['interaction-test'],
  play: async () => {
    const body = within(document.body);
    await expect(body.getByRole('button', { name: PLANS_PAGE.upgradeAction })).toBeEnabled();
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

// Someone who has never subscribed: the free trial is the headline and the
// button, and the feature they tapped is the sentence under it.
export const TrialFirst = {
  args: { reason: 'stats', premiumState: { trialEligible: true } },
  tags: ['interaction-test'],
  play: async () => {
    const body = within(document.body);
    await expect(body.getByRole('heading', { name: S.trialTitle })).toBeVisible();
    await expect(body.getByText(S.reasons.stats.title)).toBeVisible();
    await expect(body.getByRole('button', { name: PLANS_PAGE.startTrialAction })).toBeEnabled();
    // Yearly is chosen first, and the line under the button says what it costs after the trial.
    await expect(body.getByText(S.afterTrial.yearly)).toBeVisible();
    fireEvent.click(body.getByRole('button', { name: new RegExp(`^${PLANS_PAGE.billing.monthly}`) }));
    await expect(body.getByText(S.afterTrial.monthly)).toBeVisible();
    await expect(body.queryByText(S.afterTrial.yearly)).toBeNull();
    // The older sheet's extra selling is gone.
    await expect(body.queryByText(S.alsoIn)).toBeNull();
  },
};

// A returning subscriber gets no trial: the feature leads, the button says
// Upgrade, and the price line makes no mention of a trial.
export const ReturningSubscriber = {
  args: { reason: 'stats', premiumState: { trialEligible: false } },
  tags: ['interaction-test'],
  play: async () => {
    const body = within(document.body);
    await expect(body.getByRole('heading', { name: S.reasons.stats.title })).toBeVisible();
    await expect(body.queryByText(S.trialTitle)).toBeNull();
    await expect(body.getByRole('button', { name: PLANS_PAGE.upgradeAction })).toBeEnabled();
    await expect(body.getByText(S.price.yearly)).toBeVisible();
  },
};
