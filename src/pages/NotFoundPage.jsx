import { useNavigate } from 'react-router-dom';
import { ErrorScreen } from '../components/ErrorBoundary';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <ErrorScreen
      code="404"
      title="Page not found."
      body="Whatever you were looking for has gone missing — like a film lost to time. Head back and keep exploring."
      primaryLabel="Go home"
      primaryAction={() => navigate('/')}
      ghostLabel="Search titles"
      ghostAction={() => navigate('/app/home')}
    />
  );
}
