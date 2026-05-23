import { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoadingSpinner from './components/LoadingSpinner.jsx';

// Layout + views
const App         = lazy(() => import('./App.jsx'));
const GuideView   = lazy(() => import('./components/GuideView.jsx'));
const CalendarView= lazy(() => import('./components/CalendarView.jsx'));
const WatchlistView=lazy(() => import('./components/WatchlistView.jsx'));
const HistoryView = lazy(() => import('./components/HistoryView.jsx'));
const SearchView  = lazy(() => import('./components/SearchView.jsx'));
const SettingsView= lazy(() => import('./components/SettingsView.jsx'));

// Standalone pages
const AuthPage          = lazy(() => import('./pages/AuthPage.jsx'));
const AuthCallbackPage  = lazy(() => import('./pages/AuthCallbackPage.jsx'));
const TraktCallbackPage = lazy(() => import('./pages/TraktCallbackPage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.jsx'));
const OnboardingFlow    = lazy(() => import('./pages/OnboardingFlow.jsx'));
const NotFoundPage      = lazy(() => import('./pages/NotFoundPage.jsx'));
const TermsPage         = lazy(() => import('./pages/TermsPage.jsx'));
const PrivacyPage       = lazy(() => import('./pages/PrivacyPage.jsx'));
const RootRoute         = lazy(() => import('./pages/RootRoute.jsx'));

const wrap = (el) => <Suspense fallback={<LoadingSpinner />}>{el}</Suspense>;

const router = createBrowserRouter([
  // Landing / auth redirect
  { path: '/', element: wrap(<RootRoute />) },

  // Static
  { path: '/terms',          element: wrap(<TermsPage />) },
  { path: '/privacy',        element: wrap(<PrivacyPage />) },

  // Auth
  { path: '/login',          element: wrap(<AuthPage initialMode="login" />) },
  { path: '/signup',         element: wrap(<AuthPage initialMode="signup" />) },
  { path: '/auth/callback',  element: wrap(<AuthCallbackPage />) },
  { path: '/auth/trakt',     element: wrap(<TraktCallbackPage />) },
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
      { path: '/app',      element: <Navigate to="/guide" replace /> },
      { path: '/guide',    element: wrap(<GuideView />) },
      { path: '/calendar', element: wrap(<CalendarView />) },
      { path: '/watching', element: <Navigate to="/list" replace /> },
      { path: '/list',     element: wrap(<WatchlistView />) },
      { path: '/history',  element: wrap(<HistoryView />) },
      { path: '/search',   element: wrap(<SearchView />) },
      { path: '/settings', element: wrap(<SettingsView />) },
    ],
  },

  // 404
  { path: '*', element: wrap(<NotFoundPage />) },
]);

export default router;
