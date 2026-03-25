import { createBrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import LandingPage from './pages/LandingPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/signup', element: <AuthPage initialMode="signup" /> },
  { path: '/login', element: <AuthPage initialMode="login" /> },
  { path: '/app', element: <ErrorBoundary><App /></ErrorBoundary> },
  { path: '/app/:view', element: <ErrorBoundary><App /></ErrorBoundary> },
  { path: '/u/:username', element: <ErrorBoundary><App /></ErrorBoundary> },
  { path: '/u/:username/list/:listId', element: <ErrorBoundary><App /></ErrorBoundary> },
]);

export default router;
