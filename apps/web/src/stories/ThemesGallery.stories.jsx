import '../index.css';
import { MemoryRouter } from 'react-router-dom';
import { expect, fireEvent, within } from 'storybook/test';
import { SETTINGS_VIEW } from '@plot/core/copy/settingsView.js';
import { AppContext } from '../hooks/useApp.js';
import { useTheme } from '../hooks/useTheme.js';
import ThemesGallery from '../components/ThemesGallery.jsx';

/* The Themes gallery at /settings/themes, with the real theme hook so a
   Premium pick applies to the story and a Free pick opens the upgrade sheet
   with that family's light and dark preview. */

function Preview({ premium }) {
  const { mode, family, setMode, setFamily } = useTheme({ isPremium: premium });
  return (
    <MemoryRouter initialEntries={['/settings/themes']}>
      <AppContext.Provider value={{ profile: { id: 'story-user', is_premium: premium }, themeMode: mode, themeFamily: family, setThemeMode: setMode, setThemeFamily: setFamily }}>
        <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}><ThemesGallery /></div>
      </AppContext.Provider>
    </MemoryRouter>
  );
}

export default { title: 'Pages/Settings/ThemesGallery', component: Preview, parameters: { layout: 'fullscreen' } };

export const Premium = { args: { premium: true } };
export const Free = { args: { premium: false } };

// A Free viewer's Premium pick shows the preview sheet and never applies the theme.
export const FreeTapStaysLocked = {
  args: { premium: false },
  tags: ['interaction-test'],
  play: async () => {
    const body = within(document.body);
    fireEvent.click(body.getByRole('button', { name: SETTINGS_VIEW.appearance.lockedTheme('Sage') }));
    // The sheet opens on the next render, so wait for it rather than checking at once.
    await expect(await body.findByRole('dialog')).toHaveTextContent('That’s Sage, in light and dark.');
    await expect(document.documentElement.dataset.palette).toBeUndefined();
  },
};
