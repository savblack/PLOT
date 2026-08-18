import { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import RouteErrorBoundary from './components/RouteErrorBoundary.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoadingSpinner from './components/LoadingSpinner.jsx';
import { SHOW_MEDIA_SYNC_INTEGRATIONS, SHOW_PRICING_PAGE } from './launchFeatures.js';
import { isPreviewDeployment } from './utils/previewDeployment.js';

// The auth entry/exit points must never fail, so they're bundled eagerly (not
// lazy): navigating to /login, /signup or /logout is almost always a
// client-side transition inside an already-loaded (possibly stale) tab, which
// is exactly when a lazily-fetched chunk 404s after a deploy. Keeping them in
// the main bundle means the app can always get you in or out.
import AuthPage from './pages/AuthPage.jsx';
import LogoutPage from './pages/LogoutPage.jsx';
// App is the shell almost every visitor hits, so it's bundled eagerly too —
// lazy-loading it meant its own boot loader (auth/profile fetch) had to wait
// on a chunk fetch first, showing an unstyled flash before the real one even
// started.
import App from './App.jsx';

// Layout + views
const DiscoverView = lazy(() => import('./components/DiscoverView.jsx'));
const CalendarView= lazy(() => import('./components/CalendarView.jsx'));
const MyListsView   = lazy(() => import('./components/MyListsView.jsx'));
const SearchView  = lazy(() => import('./components/SearchView.jsx'));
const SettingsView= lazy(() => import('./components/SettingsView.jsx'));
const ImportView  = lazy(() => import('./components/ImportView.jsx'));
const RequestsView= lazy(() => import('./components/RequestsView.jsx'));
const NotificationsView = lazy(() => import('./components/NotificationsView.jsx'));

// Standalone pages
const AuthCallbackPage  = lazy(() => import('./pages/AuthCallbackPage.jsx'));
const TraktCallbackPage = lazy(() => import('./pages/TraktCallbackPage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.jsx'));
const OnboardingFlow    = lazy(() => import('./pages/OnboardingFlow.jsx'));
const NotFoundPage      = lazy(() => import('./pages/NotFoundPage.jsx'));
const TermsPage         = lazy(() => import('./pages/TermsPage.jsx'));
const PrivacyPage       = lazy(() => import('./pages/PrivacyPage.jsx'));
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage.jsx'));
const RootRoute         = lazy(() => import('./pages/RootRoute.jsx'));
const DesignSystemPage  = lazy(() => import('./pages/DesignSystemPage.jsx'));
const SavePage          = lazy(() => import('./pages/SavePage.jsx'));
const TalentPage        = lazy(() => import('./pages/TalentPage.jsx'));
const PlansPage         = lazy(() => import('./pages/PlansPage.jsx'));

const wrap = (el) => <Suspense fallback={<LoadingSpinner />}>{el}</Suspense>;
const isPreview = isPreviewDeployment();

const router = createBrowserRouter([
  // Top-level layout route: its errorElement catches anything thrown while
  // routing, rendering, or lazy-loading any route below — so a crash shows the
  // branded error screen instead of React Router's raw developer page.
  {
    element: <Outlet />,
    errorElement: <RouteErrorBoundary />,
    children: [
  // Landing / auth redirect
  { path: '/', element: wrap(<RootRoute />) },

  // Static
  { path: '/terms',          element: wrap(<TermsPage />) },
  { path: '/privacy',        element: wrap(<PrivacyPage />) },
  { path: '/pricing',        element: SHOW_PRICING_PAGE ? wrap(<PlansPage />) : <Navigate to="/app" replace /> },
  { path: '/plans',          element: SHOW_PRICING_PAGE ? wrap(<PlansPage />) : <Navigate to="/app" replace /> },

  // Design system — standalone, no auth, dev builds only
  ...(import.meta.env.DEV ? [{ path: '/design-system', element: wrap(<DesignSystemPage />) }] : []),

  // Deep link: "Save to watchlist" from outside the app (newsletter, chart page)
  { path: '/save',           element: wrap(<SavePage />) },

  // Auth
  { path: '/login',          element: <AuthPage initialMode="login" /> },
  { path: '/signup',         element: <AuthPage initialMode="signup" /> },
  { path: '/logout',         element: <LogoutPage /> },
  { path: '/auth/callback',  element: wrap(<AuthCallbackPage />) },
  { path: '/auth/trakt',     element: SHOW_MEDIA_SYNC_INTEGRATIONS ? wrap(<TraktCallbackPage />) : <Navigate to="/settings" replace /> },
  { path: '/reset-password', element: wrap(<ResetPasswordPage />) },

  // Onboarding (protected, skip onboarding check)
  {
    path: '/onboarding',
    element: isPreview ? <Navigate to="/home" replace /> : wrap(
      <ProtectedRoute skipOnboardingCheck>
        <ErrorBoundary><OnboardingFlow /></ErrorBoundary>
      </ProtectedRoute>
    ),
  },

  // App shell — layout route with child views
  {
    element: wrap(
      <ProtectedRoute publicPrefixes={['/u/']}>
        <ErrorBoundary><App /></ErrorBoundary>
      </ProtectedRoute>
    ),
    children: [
      { path: 'app',      element: <Navigate to="/home" replace /> },
      { path: 'u/:username', element: wrap(<PublicProfilePage />) },
      { path: 'home',     element: wrap(<DiscoverView />) },
      { path: 'calendar', element: wrap(<CalendarView />) },
      { path: 'watching', element: <Navigate to="/my-lists" replace /> },
      { path: 'list',     element: <Navigate to="/my-lists" replace /> },
      { path: 'history',  element: <Navigate to="/my-lists" replace state={{ tab: 'history' }} /> },
      { path: 'my-lists', element: wrap(<MyListsView />) },
      { path: 'search',   element: wrap(<SearchView />) },
      { path: 'person/:personId', element: wrap(<TalentPage />) },
      { path: 'settings', element: wrap(<SettingsView />) },
      { path: 'requests', element: wrap(<RequestsView />) },
      { path: 'notifications', element: wrap(<NotificationsView />) },
      { path: 'import',   element: wrap(<ImportView />) },
    ],
  },

  // 404
  { path: '*', element: wrap(<NotFoundPage />) },
    ],
  },
]);

export default router;
