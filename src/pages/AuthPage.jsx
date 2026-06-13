import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import './AuthPage.css';
import { usePostHog } from '@posthog/react';
import { getAuthCallbackUrl } from '../utils/redirects.js';
import { HERO_POSTERS } from '../constants/heroPosters.js';
import PlotLogo from '../components/PlotLogo.jsx';
import PlotLoader from '../components/PlotLoader.jsx';

function friendlyError(msg) {
  if (!msg) return 'Something went wrong. Please try again.';
  if (msg.includes('Invalid login credentials'))    return 'Oops! Incorrect email or password.';
  if (msg.includes('Email not confirmed'))          return '__warning__Almost in! Your activation email is waiting in your inbox.';
  if (msg.includes('User already registered'))      return 'An account with this email already exists. Try signing in instead.';
  if (msg.includes('Password should be at least'))  return 'Password must be at least 6 characters.';
  if (msg.includes('Unable to validate email'))     return 'Please enter a valid email address.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Too many attempts. Please wait a moment and try again.';
  return msg;
}

export default function AuthPage({ initialMode = 'signup' }) {
  const [mode, setMode]               = useState(initialMode);
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [success, setSuccess]         = useState(false);
  const [resendStatus, setResendStatus] = useState(null); // null | 'sending' | 'sent' | 'error'
  const navigate = useNavigate();
  const posthog = usePostHog();

  // Auto-redirect if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/app', { replace: true });
    });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAuthCallbackUrl(),
      });
      if (error) { setError(friendlyError(error.message)); setLoading(false); }
      else {
        posthog?.capture('password_reset_requested');
        setSuccess(true);
      }
      return;
    }

    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(friendlyError(error.message)); setLoading(false); }
      else {
        posthog?.identify(data.user.id, { email: data.user.email });
        posthog?.capture('user_logged_in');
        navigate('/app');
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: getAuthCallbackUrl() },
      });
      if (error) { setError(friendlyError(error.message)); setLoading(false); }
      else {
        posthog?.capture('user_signed_up');
        setSuccess(true);
      }
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setSuccess(false);
    setResendStatus(null);
  };

  const handleResend = async () => {
    if (resendStatus === 'sending' || resendStatus === 'sent') return;
    setResendStatus('sending');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: getAuthCallbackUrl() },
    });
    setResendStatus(error ? 'error' : 'sent');
  };

  const scrollPosters = [...HERO_POSTERS, ...HERO_POSTERS];

  const headings = {
    signup: 'Create your account',
    login:  'Welcome back',
    forgot: 'Reset your password',
  };

  const subheadings = {
    signup: 'For people who think about what they watch.',
    login:  'Good to see you again.',
    forgot: 'We\'ll send a link to your inbox.',
  };

  const ctaLabels = {
    signup: 'Create account',
    login:  'Sign in',
    forgot: 'Send reset link',
  };

  return (
    <div className="auth-page">

      {/* ── Left: living poster wall ── */}
      <div className="auth-visual" aria-hidden="true">
        <div className="poster-track">
          {scrollPosters.map((src, i) => (
            <div key={i} className="poster-cell" style={{ backgroundImage: `url('${src}')` }} />
          ))}
        </div>
        <div className="auth-visual-gradient" />
        <div className="auth-visual-brand">
          <PlotLogo className="auth-visual-logo" white />
          <span className="auth-visual-tagline">Your film &amp; TV journal</span>
        </div>
      </div>

      {/* ── Right: form panel ── */}
      <div className="auth-panel">
        <Link to="/" className="auth-panel-logo">
          <PlotLogo />
        </Link>

        <div className="auth-panel-body">

          {success && mode === 'signup' && (
            <div className="auth-success">
              <div className="auth-success-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <polyline points="2 4 12 13 22 4"/>
                </svg>
              </div>
              <h1>Almost there!</h1>
              <p>We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back to sign in.</p>
              <button className="auth-cta auth-cta--outline" onClick={() => switchMode('login')}>Back to sign in</button>
              <p className="auth-success-resend">
                Didn't get it? Check spam or{' '}
                <button
                  className={`auth-resend-btn${resendStatus === 'sent' ? ' auth-resend-btn--sent' : ''}`}
                  onClick={handleResend}
                  disabled={resendStatus === 'sending' || resendStatus === 'sent'}
                >
                  {resendStatus === 'sending' ? 'sending' : resendStatus === 'sent' ? 'sent' : resendStatus === 'error' ? 'try again' : 'resend'}
                </button>.</p>
            </div>
          )}

          {success && mode === 'forgot' && (
            <div className="auth-success">
              <div className="auth-success-icon">✓</div>
              <h1>Link sent</h1>
              <p>Check <strong>{email}</strong> for a password reset link. It'll expire in an hour.</p>
              <button className="auth-cta" onClick={() => switchMode('login')}>Back to sign in</button>
            </div>
          )}

          {!success && (
            <>
              <div className="auth-header">
                <h1>{headings[mode]}</h1>
                <p>{subheadings[mode]}</p>
              </div>

              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                {error && (
                  <div className={error.startsWith('__warning__') ? 'auth-warning' : 'auth-error'}>
                    {error.replace('__warning__', '')}
                  </div>
                )}

                <div className="auth-field">
                  <label htmlFor="auth-email">Email</label>
                  <input
                    id="auth-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                  />
                </div>

                {mode !== 'forgot' && (
                  <div className="auth-field">
                    <div className="auth-field-label-row">
                      <label htmlFor="auth-password">Password</label>
                      {mode === 'login' && (
                        <button type="button" className="auth-forgot-link" onClick={() => switchMode('forgot')}>
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="auth-password-wrap">
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      />
                      <button
                        type="button"
                        className="auth-show-pw"
                        onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  className="auth-cta"
                  disabled={loading}
                  aria-busy={loading}
                  aria-label={loading ? `${ctaLabels[mode]} in progress` : ctaLabels[mode]}
                >
                  {loading ? <PlotLoader size="button" tone="dark" ariaHidden /> : ctaLabels[mode]}
                </button>
              </form>

              <div className="auth-toggle">
                {mode === 'forgot' ? (
                  <button onClick={() => switchMode('login')}>Back to sign in</button>
                ) : mode === 'signup' ? (
                  <p>Already have an account? <button onClick={() => switchMode('login')}>Sign in</button></p>
                ) : (
                  <p>Don't have an account? <button onClick={() => switchMode('signup')}>Sign up</button></p>
                )}
              </div>
            </>
          )}
        </div>

        <p className="auth-panel-footer">
          By continuing you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
