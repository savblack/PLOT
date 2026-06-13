import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../api/supabase';
import './AuthPage.css';
import PlotLogo from '../components/PlotLogo.jsx';
import PlotLoader from '../components/PlotLoader.jsx';

function friendlyError(msg) {
  if (!msg) return 'Something went wrong. Please try again.';
  if (msg.includes('Password should be at least')) return 'Password must be at least 6 characters.';
  if (msg.includes('same password')) return 'New password must be different from your current one.';
  return msg;
}

export default function ResetPasswordPage() {
  const [password, setPassword]         = useState('');
  const [confirm, setConfirm]           = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [done, setDone]                 = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(friendlyError(error.message)); setLoading(false); }
    else {
      setDone(true);
      setTimeout(() => navigate('/app', { replace: true }), 2500);
    }
  };

  return (
    <div className="auth-page" style={{ justifyContent: 'center' }}>
      <div className="auth-panel" style={{ maxWidth: 480, height: 'auto', minHeight: '100vh' }}>
        <Link to="/" className="auth-panel-logo">
          <PlotLogo />
        </Link>

        <div className="auth-panel-body">
          {done ? (
            <div className="auth-success">
              <div className="auth-success-icon">✓</div>
              <h1>Password updated</h1>
              <p>You're all set. Taking you to the app now.</p>
            </div>
          ) : (
            <>
              <div className="auth-header">
                <h1>Set a new password</h1>
                <p>Choose something you'll actually remember.</p>
              </div>

              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                {error && <div className="auth-error">{error}</div>}

                <div className="auth-field">
                  <label htmlFor="rp-password">New password</label>
                  <div className="auth-password-wrap">
                    <input
                      id="rp-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoFocus
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="auth-show-pw"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                      aria-pressed={showPassword}
                      title={showPassword ? 'Hide passwords' : 'Show passwords'}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div className="auth-field">
                  <label htmlFor="rp-confirm">Confirm password</label>
                  <input
                    id="rp-confirm"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Same again"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>

                <button
                  type="submit"
                  className="auth-cta"
                  disabled={loading}
                  aria-busy={loading}
                  aria-label={loading ? 'Updating password' : 'Update password'}
                >
                  {loading ? <PlotLoader size="button" tone="dark" ariaHidden /> : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="auth-panel-footer">
          <a href="/login">Back to sign in</a>
        </p>
      </div>
    </div>
  );
}
