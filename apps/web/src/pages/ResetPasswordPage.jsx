import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../api/supabase';
import './AuthPage.css';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import { COMMON } from '../copy/common.js';
import { AUTH_PAGE } from '../copy/authPage.js';
import { RESET_PASSWORD_PAGE } from '../copy/resetPasswordPage.js';

function friendlyError(msg) {
  if (!msg) return COMMON.genericError;
  if (msg.includes('Password should be at least')) return AUTH_PAGE.weakPassword;
  if (msg.includes('same password')) return RESET_PASSWORD_PAGE.samePassword;
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
        <Link to="/" className="auth-panel-logo" aria-label="PLOT">
          PLOT
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
                      aria-label={showPassword ? RESET_PASSWORD_PAGE.hidePasswords : RESET_PASSWORD_PAGE.showPasswords}
                      aria-pressed={showPassword}
                      title={showPassword ? RESET_PASSWORD_PAGE.hidePasswords : RESET_PASSWORD_PAGE.showPasswords}
                    >
                      {showPassword ? AUTH_PAGE.hide : AUTH_PAGE.show}
                    </button>
                  </div>
                </div>

                <div className="auth-field">
                  <label htmlFor="rp-confirm">{RESET_PASSWORD_PAGE.confirmPasswordLabel}</label>
                  <input
                    id="rp-confirm"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={RESET_PASSWORD_PAGE.confirmPasswordPlaceholder}
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
                  aria-label={loading ? RESET_PASSWORD_PAGE.updatingPassword : RESET_PASSWORD_PAGE.updatePassword}
                >
                  {loading ? <PlotLoader size="button" tone="dark" ariaHidden /> : RESET_PASSWORD_PAGE.updatePassword}
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
