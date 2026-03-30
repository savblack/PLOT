import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from './App.jsx';
import AuthPage from './pages/AuthPage.jsx';
import AuthCallbackPage from './pages/AuthCallbackPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import OnboardingFlow from './pages/OnboardingFlow.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ProfilePreviewPage from './pages/ProfilePreviewPage.jsx';
import TermsPage from './pages/TermsPage.jsx';
import PrivacyPage from './pages/PrivacyPage.jsx';

const router = createBrowserRouter([
  { path: '/',               element: <Navigate to="/login" replace /> },
  { path: '/terms',          element: <TermsPage /> },
  { path: '/privacy',        element: <PrivacyPage /> },
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
