import { Suspense, lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoadingSpinner from './components/LoadingSpinner.jsx';

const App = lazy(() => import('./App.jsx'));
const AuthPage = lazy(() => import('./pages/AuthPage.jsx'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.jsx'));
const OnboardingFlow = lazy(() => import('./pages/OnboardingFlow.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));
const TermsPage = lazy(() => import('./pages/TermsPage.jsx'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage.jsx'));
const RootRoute = lazy(() => import('./pages/RootRoute.jsx'));

const withSuspense = (element) => (
  <Suspense fallback={<LoadingSpinner />}>
    {element}
  </Suspense>
);

const router = createBrowserRouter([
  { path: '/',               element: withSuspense(<RootRoute />) },
  { path: '/terms',          element: withSuspense(<TermsPage />) },
  { path: '/privacy',        element: withSuspense(<PrivacyPage />) },
  { path: '/signup',         element: withSuspense(<AuthPage initialMode="signup" />) },
  { path: '/login',          element: withSuspense(<AuthPage initialMode="login" />) },
  { path: '/auth/callback',  element: withSuspense(<AuthCallbackPage />) },
  { path: '/reset-password', element: withSuspense(<ResetPasswordPage />) },
  {
    path: '/onboarding',
    element: withSuspense(<ProtectedRoute skipOnboardingCheck><ErrorBoundary><OnboardingFlow /></ErrorBoundary></ProtectedRoute>),
  },
  {
    path: '/app',
    element: withSuspense(<ProtectedRoute><ErrorBoundary><App /></ErrorBoundary></ProtectedRoute>),
  },
  {
    path: '/app/:view',
    element: withSuspense(<ProtectedRoute><ErrorBoundary><App /></ErrorBoundary></ProtectedRoute>),
  },
  {
    path: '/u/:username',
    element: withSuspense(<ErrorBoundary><App /></ErrorBoundary>),
  },
  {
    path: '/u/:username/list/:listId',
    element: withSuspense(<ErrorBoundary><App /></ErrorBoundary>),
  },
  { path: '*', element: withSuspense(<NotFoundPage />) },
]);

export default router;
