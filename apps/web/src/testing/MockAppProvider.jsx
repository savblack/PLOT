import { MemoryRouter } from 'react-router-dom';
import { AppContext } from '../hooks/useApp.js';
import { mockAppContextValue } from './mockAppContext.js';

/*
 * Wraps children in a fake AppContext (so `useApp()` resolves) plus a
 * MemoryRouter (so `useNavigate`/`useLocation`/`<Link>` resolve) — the two
 * things that crash a component rendered outside the real app shell.
 * Pass `value` to override specific fields for a given story/test, e.g.
 * `<MockAppProvider value={{ watchlist: { ...mockAppContextValue.watchlist, items: [...] } }}>`.
 */
export function MockAppProvider({ value, initialEntries, children }) {
  const merged = { ...mockAppContextValue, ...value };
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <AppContext.Provider value={merged}>
        {children}
      </AppContext.Provider>
    </MemoryRouter>
  );
}
