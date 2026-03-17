import { useState } from 'react';
import { supabase } from '../api/supabase';

export default function AuthModal({ onClose, onAuthSuccess }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // login, signup
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = mode === 'login' 
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
    } else {
      onAuthSuccess(data.user);
      onClose();
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-box glass animate-in" onClick={e => e.stopPropagation()}>
        <h2>{mode === 'login' ? 'Welcome Back' : 'Join PLOT'}</h2>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-badge">{error}</div>}
          
          <input 
            type="email" 
            placeholder="Email address" 
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="auth-input"
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="auth-input"
          />
          
          <button className="auth-submit" disabled={loading}>
            {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <p className="toggle-mode">
          {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
          <span onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </span>
        </p>
      </div>

      <style>{`
        .auth-box {
          max-width: 400px;
          width: 90%;
          padding: 3rem 2.5rem;
          background: white;
          border-radius: var(--radius-lg);
          text-align: center;
          position: relative;
        }

        h2 { font-size: 2rem; margin-bottom: 1.5rem; }
        
        .subtitle { 
          color: var(--text-secondary); 
          margin-bottom: 2.5rem;
          font-size: 0.95rem;
        }

        .auth-input {
          width: 100%;
          padding: 1rem;
          border-radius: var(--radius-md);
          border: 1px solid #eee;
          margin-bottom: 1rem;
          outline: none;
          font-family: inherit;
          transition: var(--transition);
        }

        .auth-input:focus { border-color: #000; }

        .auth-submit {
          width: 100%;
          padding: 1rem;
          background: #000;
          color: white;
          border: none;
          border-radius: var(--radius-pill);
          font-weight: 600;
          cursor: pointer;
          margin-top: 1rem;
          transition: var(--transition);
        }

        .auth-submit:hover { opacity: 0.9; transform: scale(0.99); }
        .auth-submit:disabled { background: #999; cursor: not-allowed; }

        .error-badge {
          background: #fff0f0;
          color: #d00;
          padding: 0.8rem;
          border-radius: var(--radius-md);
          font-size: 0.85rem;
          margin-bottom: 1.5rem;
          border: 1px solid #ffebeb;
        }

        .toggle-mode {
          margin-top: 2rem;
          font-size: 0.9rem;
          color: var(--text-secondary);
        }

        .toggle-mode span {
          color: #000;
          font-weight: 600;
          cursor: pointer;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
