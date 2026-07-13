import { useNavigate } from 'react-router-dom';
import { ErrorScreen } from '../components/ErrorBoundary';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <ErrorScreen
      code="404"
      title="Looks like we've hit a plot hole."
      body="Let's get you back to something worth watching."
      primaryLabel="Go home"
      primaryAction={() => navigate('/')}
      ghostLabel="Search titles"
      ghostAction={() => navigate('/app/home')}
    />
  );
}
