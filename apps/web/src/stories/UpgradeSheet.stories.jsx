import { expect, fireEvent, waitFor, within } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { AppContext } from '../hooks/useApp.js';
import UpgradeSheet from '../components/UpgradeSheet.jsx';

/* The in-app upgrade sheet for a Free viewer who has hit the list limit. It
   portals to document.body, so the story canvas is the whole viewport. */

const app = { profile: { id: 'story-user', is_premium: false } };

export default {
  title: 'Premium/UpgradeSheet',
  component: UpgradeSheet,
  parameters: { layout: 'fullscreen' },
  args: { reason: 'lists', onClose: () => {} },
  decorators: [
    (Story) => {
      localStorage.removeItem('plot.premiumWaitlist.anon.themes');
      localStorage.removeItem('plot.premiumWaitlist.anon.smart_lists');
      return (
        <MemoryRouter initialEntries={['/my-lists']}>
          <AppContext.Provider value={app}>
            <Story />
          </AppContext.Provider>
        </MemoryRouter>
      );
    },
  ],
};

export const Lists = {};
export const Themes = { args: { reason: 'themes', family: 'sage' } };

const signedIn = { profile: { id: 'story-user', is_premium: false }, user: { id: 'story-user', email: 'reader@example.com' } };

export const ThemesSignedIn = {
  args: { reason: 'themes', family: 'sage' },
  decorators: [(Story) => <AppContext.Provider value={signedIn}><Story /></AppContext.Provider>],
};

export const ThemesAlreadyJoined = {
  args: { reason: 'themes', family: 'sage' },
  render: (args) => {
    localStorage.setItem('plot.premiumWaitlist.anon.themes', '1');
    return <UpgradeSheet {...args} />;
  },
};

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
    await expect(body.queryByText(PLANS_PAGE.comingSoon)).toBeNull();
  },
};

export const SmartLists = { args: { reason: 'smartLists' } };
