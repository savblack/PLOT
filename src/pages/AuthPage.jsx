import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import './AuthPage.css';

const POSTERS = [
  '/website-images/hero/challengers.webp',
  '/website-images/hero/past-lives.jpg',
  '/website-images/hero/saltburn.jpg',
  '/website-images/hero/gone-girl.jpg',
  '/website-images/hero/aftersun.jpg',
  '/website-images/hero/the-substance.avif',
  '/website-images/hero/nosferatu.jpg',
  '/website-images/hero/parasite.jpg',
  '/website-images/hero/the-bear.jpg',
  '/website-images/hero/the-white-lotus.jpg',
  '/website-images/hero/oppenheimer.webp',
  '/website-images/hero/promising-young-woman.jpg',
  '/website-images/hero/the-wolf-of-wall-street.png',
  '/website-images/hero/clueless.jpg',
  '/website-images/hero/the-summer-i-turned-pretty.jpg',
  '/website-images/hero/the-conjuring.avif',
  '/website-images/hero/love-story.webp',
  '/website-images/hero/scream.jpg',
  '/website-images/hero/friday-night-lights.jpg',
  '/website-images/hero/american-primeval.jpg',
  '/website-images/hero/squid-game-2.jpg',
  '/website-images/hero/the-vampire-diaries.jpeg',
  '/website-images/hero/housemaid.jpg',
  '/website-images/hero/anniversary.jpg',
];

export default function AuthPage({ initialMode = 'signup' }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); }
      else navigate('/app');
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) { setError(error.message); setLoading(false); }
      else setSuccess(true);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setSuccess(false);
  };

  // Duplicate posters so the scroll animation loops seamlessly
  const scrollPosters = [...POSTERS, ...POSTERS];

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
          <span className="auth-visual-tagline">Your film &amp; TV journal</span>
        </div>
      </div>

      {/* ── Right: form panel ── */}
      <div className="auth-panel">
        <Link to="/" className="auth-panel-logo">PLOT</Link>

        <div className="auth-panel-body">

          {success ? (
            <div className="auth-success">
              <div className="auth-success-icon">✓</div>
              <h1>Check your inbox</h1>
              <p>We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back to sign in.</p>
              <button className="auth-cta" onClick={() => switchMode('login')}>Back to sign in</button>
            </div>
          ) : (
            <>
              <div className="auth-header">
                <h1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
                <p>{mode === 'signup' ? 'For people who think about what they watch.' : 'Good to see you again.'}</p>
              </div>

              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                {error && <div className="auth-error">{error}</div>}

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

                <div className="auth-field">
                  <label htmlFor="auth-password">Password</label>
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
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <button type="submit" className="auth-cta" disabled={loading}>
                  {loading
                    ? <span className="auth-spinner" />
                    : mode === 'signup' ? 'Create account' : 'Sign in'}
                </button>
              </form>

              <p className="auth-toggle">
                {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}
                {' '}
                <button onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}>
                  {mode === 'signup' ? 'Sign in' : 'Sign up'}
                </button>
              </p>
            </>
          )}
        </div>

        <p className="auth-panel-footer">
          By continuing you agree to our <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
