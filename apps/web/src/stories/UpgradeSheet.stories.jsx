import { expect, fireEvent, within } from 'storybook/test';
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

export const UpgradeShowsComingSoon = {
  tags: ['interaction-test'],
  play: async () => {
    const body = within(document.body);
    fireEvent.click(body.getByRole('button', { name: PLANS_PAGE.upgradeAction }));
    await expect(body.getByRole('status')).toHaveTextContent('Checkout is not open yet');
  },
};
