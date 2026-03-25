import { createBrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import LandingPage from './pages/LandingPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import AuthCallbackPage from './pages/AuthCallbackPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import OnboardingFlow from './pages/OnboardingFlow.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ProfilePreviewPage from './pages/ProfilePreviewPage.jsx';

const router = createBrowserRouter([
  { path: '/',               element: <LandingPage /> },
  { path: '/profile-preview', element: <ProfilePreviewPage /> },
  { path: '/signup',         element: <AuthPage initialMode="signup" /> },
  { path: '/login',          element: <AuthPage initialMode="login" /> },
  { path: '/auth/callback',  element: <AuthCallbackPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/onboarding',
    element: <ProtectedRoute skipOnboardingCheck><OnboardingFlow /></ProtectedRoute>,
  },
  {
    path: '/app',
    element: <ProtectedRoute><ErrorBoundary><App /></ErrorBoundary></ProtectedRoute>,
  },
  {
    path: '/app/:view',
    element: <ProtectedRoute><ErrorBoundary><App /></ErrorBoundary></ProtectedRoute>,
  },
  {
    path: '/u/:username',
    element: <ErrorBoundary><App /></ErrorBoundary>,
  },
  {
    path: '/u/:username/list/:listId',
    element: <ErrorBoundary><App /></ErrorBoundary>,
  },
]);

export default router;
