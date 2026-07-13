import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import './AuthPage.css';
import { track, identifyUser, EVENTS } from '../lib/analytics.js';
import { getAuthCallbackUrl } from '../utils/redirects.js';
import { SHOW_GOOGLE_LOGIN, SHOW_APPLE_LOGIN } from '../launchFeatures.js';
import { HERO_POSTERS } from '../constants/heroPosters.js';
import PlotLoader from '../components/PlotLoader.jsx';
import Turnstile from '../components/Turnstile.jsx';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.705a5.41 5.41 0 0 1-.282-1.705c0-.593.102-1.17.282-1.705V4.963H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.963L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" fill="currentColor">
      <path d="M13.03 9.56c-.02-1.86 1.52-2.75 1.59-2.79-.87-1.27-2.22-1.44-2.7-1.46-1.15-.12-2.24.68-2.83.68-.58 0-1.48-.66-2.43-.64-1.25.02-2.4.73-3.04 1.85-1.3 2.25-.33 5.58.93 7.41.62.9 1.36 1.9 2.32 1.86.93-.04 1.29-.6 2.41-.6 1.13 0 1.45.6 2.43.58 1.0-.02 1.64-.91 2.25-1.81.71-1.04 1.0-2.05 1.02-2.1-.02-.01-1.95-.75-1.97-2.97zM11.2 4.03c.51-.62.86-1.48.76-2.34-.74.03-1.63.49-2.16 1.11-.47.55-.89 1.43-.78 2.27.82.06 1.67-.42 2.18-1.04z"/>
    </svg>
  );
}

export default function AuthPage({ initialMode = 'signup' }) {
  const [mode, setMode]               = useState(initialMode);
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [success, setSuccess]         = useState(false);
  const [magicSent, setMagicSent]     = useState(false);
  const [resendStatus, setResendStatus] = useState(null); // null | 'sending' | 'sent' | 'error'
  const [captchaToken, setCaptchaToken] = useState(null);
  const [captchaNonce, setCaptchaNonce] = useState(0); // bump to force a fresh Turnstile token
  const navigate = useNavigate();

  // Turnstile tokens are single-use; clear and re-issue after every auth attempt.
  const resetCaptcha = () => { setCaptchaToken(null); setCaptchaNonce((n) => n + 1); };

  // When no site key is configured the widget never renders, so don't gate on it.
  const captchaReady = !TURNSTILE_SITE_KEY || !!captchaToken;

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
        captchaToken,
      });
      if (error) { setError(friendlyError(error.message)); setLoading(false); resetCaptcha(); }
      else {
        track(EVENTS.PASSWORD_RESET_REQUESTED);
        setSuccess(true);
      }
      return;
    }

    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });
      if (error) { setError(friendlyError(error.message)); setLoading(false); resetCaptcha(); }
      else {
        identifyUser(data.user.id, { email: data.user.email });
        track(EVENTS.USER_LOGGED_IN);
        navigate('/app');
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: getAuthCallbackUrl(), captchaToken },
      });
      if (error) { setError(friendlyError(error.message)); setLoading(false); resetCaptcha(); }
      else {
        // Identify on signup (not just login) so the anonymous pre-signup
        // session — carrying first-touch attribution — stitches to this user.
        identifyUser(data.user?.id, { email: data.user?.email || email });
        track(EVENTS.USER_SIGNED_UP, { method: 'email' });
        setSuccess(true);
      }
    }
  };

  // OAuth: hand off to the provider. We can't fire the signup/login event here
  // (the page redirects away), so we stash the method in sessionStorage and let
  // AuthCallbackPage report it once the session comes back (see reportAuth there).
  const beginOAuth = async (provider) => {
    setError(null);
    try { sessionStorage.setItem('plot_auth_method', provider); } catch { /* ignore */ }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: getAuthCallbackUrl() },
    });
    // A returned error means we never navigated away — surface it and clear the marker.
    if (error) {
      setError(friendlyError(error.message));
      try { sessionStorage.removeItem('plot_auth_method'); } catch { /* ignore */ }
    }
  };

  // Passwordless: email a one-time sign-in link. Works for new and returning
  // users alike; the callback completes auth and reports the method.
  const sendMagicLink = async () => {
    if (!email) { setError('Enter your email address first, then request a link.'); return; }
    setLoading(true);
    setError(null);
    try { sessionStorage.setItem('plot_auth_method', 'magic_link'); } catch { /* ignore */ }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: getAuthCallbackUrl(), captchaToken },
    });
    setLoading(false);
    if (error) { setError(friendlyError(error.message)); resetCaptcha(); }
    else setMagicSent(true);
  };

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setSuccess(false);
    setMagicSent(false);
    setResendStatus(null);
  };

  const handleResend = async () => {
    if (resendStatus === 'sending' || resendStatus === 'sent') return;
    setResendStatus('sending');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: getAuthCallbackUrl(), captchaToken },
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
          <span className="auth-visual-logo">PLOT</span>
          <span className="auth-visual-tagline">Your film &amp; TV companion</span>
        </div>
      </div>

      {/* ── Right: form panel ── */}
      <div className="auth-panel">
        <Link to="/" className="auth-panel-logo" aria-label="PLOT">
          PLOT
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

          {magicSent && (
            <div className="auth-success">
              <div className="auth-success-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <polyline points="2 4 12 13 22 4"/>
                </svg>
              </div>
              <h1>Check your inbox</h1>
              <p>We sent a one-time sign-in link to <strong>{email}</strong>. Open it on this device and you're straight in — no password needed.</p>
              <button className="auth-cta auth-cta--outline" onClick={() => { setMagicSent(false); resetCaptcha(); }}>Back</button>
            </div>
          )}

          {!success && !magicSent && (
            <>
              <div className="auth-header">
                <h1>{headings[mode]}</h1>
                <p>{subheadings[mode]}</p>
              </div>

              {mode !== 'forgot' && (SHOW_GOOGLE_LOGIN || SHOW_APPLE_LOGIN) && (
                <>
                  <div className="auth-social">
                    {SHOW_GOOGLE_LOGIN && (
                      <button type="button" className="auth-social-btn" onClick={() => beginOAuth('google')} disabled={loading}>
                        <GoogleIcon /> Continue with Google
                      </button>
                    )}
                    {SHOW_APPLE_LOGIN && (
                      <button type="button" className="auth-social-btn" onClick={() => beginOAuth('apple')} disabled={loading}>
                        <AppleIcon /> Continue with Apple
                      </button>
                    )}
                  </div>
                  <div className="auth-divider"><span>or</span></div>
                </>
              )}

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

                <Turnstile
                  siteKey={TURNSTILE_SITE_KEY}
                  onToken={setCaptchaToken}
                  resetSignal={captchaNonce}
                />

                <button
                  type="submit"
                  className="auth-cta"
                  disabled={loading || !captchaReady}
                  aria-busy={loading}
                  aria-label={loading ? `${ctaLabels[mode]} in progress` : ctaLabels[mode]}
                >
                  {loading ? <PlotLoader size="button" tone="dark" ariaHidden /> : ctaLabels[mode]}
                </button>
              </form>

              {mode !== 'forgot' && (
                <button
                  type="button"
                  className="auth-magiclink"
                  onClick={sendMagicLink}
                  disabled={loading || !captchaReady}
                >
                  Email me a magic link instead
                </button>
              )}

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
