import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../api/supabase';
import PlotLogo from '../components/PlotLogo.jsx';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(null);

  useEffect(() => {
    const handle = async () => {
      const token_hash = searchParams.get('token_hash');
      const type       = searchParams.get('type');
      const code       = searchParams.get('code');

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { setError(error.message); return; }
        navigate('/onboarding', { replace: true });
        return;
      }

      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (error) { setError(error.message); return; }
        if (type === 'recovery') { navigate('/reset-password', { replace: true }); return; }
      }

      // Signup confirmation or generic redirect — onboarding checks completion itself
      navigate('/onboarding', { replace: true });
    };

    handle();
  }, [navigate, searchParams]);

  if (error) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Manrope', system-ui, sans-serif",
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
      }}>
        <PlotLogo style={{ width: '100px', height: 'auto' }} />
        <p style={{ color: '#c0392b', fontSize: '0.95rem' }}>This link has expired or is invalid.</p>
        <a href="/login" style={{ color: '#1a1a1a', fontWeight: 600, fontSize: '0.9rem' }}>Back to sign in</a>
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <PlotLogo style={{ width: '100px', height: 'auto' }} />
    </div>
  );
}
