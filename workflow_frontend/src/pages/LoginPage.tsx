import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken } from '../auth';
import { APP } from '../workflow.config';

type Mode = 'login' | 'register';

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode]       = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        const r = await fetch('/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({})) as { detail?: string };
          setError(d.detail ?? `Registration failed (${r.status})`);
          setLoading(false);
          return;
        }
        // Auto-login after register
      }

      const r = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({})) as { detail?: string };
        setError(d.detail ?? `Login failed (${r.status})`);
        setLoading(false);
        return;
      }
      const { access_token } = await r.json() as { access_token: string };
      setToken(access_token);
      navigate('/', { replace: true });
    } catch (err) {
      setError(`Network error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [mode, username, password, navigate]);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__header">
          <span className="login-card__logo">⚡</span>
          <h1 className="login-card__title">{APP.title}</h1>
          <p className="login-card__sub">AI-powered workflow builder</p>
        </div>

        <div className="login-card__tabs">
          <button
            className={`login-card__tab${mode === 'login' ? ' login-card__tab--active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            Sign in
          </button>
          <button
            className={`login-card__tab${mode === 'register' ? ' login-card__tab--active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
          >
            Register
          </button>
        </div>

        <form className="login-card__form" onSubmit={(e) => void submit(e)}>
          <label className="login-field">
            <span className="login-field__label">Username</span>
            <input
              className="login-field__input"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              required
            />
          </label>

          <label className="login-field">
            <span className="login-field__label">Password</span>
            <input
              className="login-field__input"
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              minLength={mode === 'register' ? 8 : 1}
            />
            {mode === 'register' && (
              <span className="login-field__hint">At least 8 characters</span>
            )}
          </label>

          {error && <p className="login-card__error">{error}</p>}

          <button className="login-card__submit" type="submit" disabled={loading}>
            {loading ? '…' : mode === 'register' ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}