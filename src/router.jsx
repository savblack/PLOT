import { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoadingSpinner from './components/LoadingSpinner.jsx';
import { SHOW_MEDIA_SYNC_INTEGRATIONS } from './launchFeatures.js';

// Layout + views
const App         = lazy(() => import('./App.jsx'));
const DiscoverView = lazy(() => import('./components/DiscoverView.jsx'));
const CalendarView= lazy(() => import('./components/CalendarView.jsx'));
const HistoryView   = lazy(() => import('./components/HistoryView.jsx'));
const MyListsView   = lazy(() => import('./components/MyListsView.jsx'));
const SearchView  = lazy(() => import('./components/SearchView.jsx'));
const SettingsView= lazy(() => import('./components/SettingsView.jsx'));
const ImportView  = lazy(() => import('./components/ImportView.jsx'));
const RequestsView= lazy(() => import('./components/RequestsView.jsx'));

// Standalone pages
const AuthPage          = lazy(() => import('./pages/AuthPage.jsx'));
const AuthCallbackPage  = lazy(() => import('./pages/AuthCallbackPage.jsx'));
const TraktCallbackPage = lazy(() => import('./pages/TraktCallbackPage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.jsx'));
const LogoutPage        = lazy(() => import('./pages/LogoutPage.jsx'));
const OnboardingFlow    = lazy(() => import('./pages/OnboardingFlow.jsx'));
const NotFoundPage      = lazy(() => import('./pages/NotFoundPage.jsx'));
const TermsPage         = lazy(() => import('./pages/TermsPage.jsx'));
const PrivacyPage       = lazy(() => import('./pages/PrivacyPage.jsx'));
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage.jsx'));
const RootRoute         = lazy(() => import('./pages/RootRoute.jsx'));
const DesignSystemPage  = lazy(() => import('./pages/DesignSystemPage.jsx'));
const SavePage          = lazy(() => import('./pages/SavePage.jsx'));

const wrap = (el) => <Suspense fallback={<LoadingSpinner />}>{el}</Suspense>;

const router = createBrowserRouter([
  // Landing / auth redirect
  { path: '/', element: wrap(<RootRoute />) },

  // Static
  { path: '/terms',          element: wrap(<TermsPage />) },
  { path: '/privacy',        element: wrap(<PrivacyPage />) },
  { path: '/u/:username',    element: wrap(<PublicProfilePage />) },

  // Deep link: "Save to watchlist" from outside the app (newsletter, chart page)
  { path: '/save',           element: wrap(<SavePage />) },

  // Auth
  { path: '/login',          element: wrap(<AuthPage initialMode="login" />) },
  { path: '/signup',         element: wrap(<AuthPage initialMode="signup" />) },
  { path: '/logout',         element: wrap(<LogoutPage />) },
  { path: '/auth/callback',  element: wrap(<AuthCallbackPage />) },
  { path: '/auth/trakt',     element: SHOW_MEDIA_SYNC_INTEGRATIONS ? wrap(<TraktCallbackPage />) : <Navigate to="/settings" replace /> },
  { path: '/reset-password', element: wrap(<ResetPasswordPage />) },

  // Onboarding (protected, skip onboarding check)
  {
    path: '/onboarding',
    element: wrap(
      <ProtectedRoute skipOnboardingCheck>
        <ErrorBoundary><OnboardingFlow /></ErrorBoundary>
      </ProtectedRoute>
    ),
  },

  // App shell — layout route with child views
  {
    element: wrap(
      <ProtectedRoute>
        <ErrorBoundary><App /></ErrorBoundary>
      </ProtectedRoute>
    ),
    children: [
      { path: 'app',      element: <Navigate to="/home" replace /> },
      { path: 'home',     element: wrap(<DiscoverView />) },
      { path: 'calendar', element: wrap(<CalendarView />) },
      { path: 'watching', element: <Navigate to="/my-lists" replace /> },
      { path: 'list',     element: <Navigate to="/my-lists" replace /> },
      { path: 'history',  element: wrap(<HistoryView />) },
      { path: 'my-lists', element: wrap(<MyListsView />) },
      { path: 'search',   element: wrap(<SearchView />) },
      { path: 'settings', element: wrap(<SettingsView />) },
      { path: 'requests', element: wrap(<RequestsView />) },
      { path: 'import',   element: wrap(<ImportView />) },
      // Design system only available in dev builds
      ...(import.meta.env.DEV ? [{ path: 'design-system', element: wrap(<DesignSystemPage />) }] : []),
    ],
  },

  // 404
  { path: '*', element: wrap(<NotFoundPage />) },
]);

export default router;
