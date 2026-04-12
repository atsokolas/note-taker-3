import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api, { clearStoredTokens } from '../api';
import { Button } from './ui';

const Login = ({ onLoginSuccess, chromeStoreLink }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const reason = sessionStorage.getItem('auth_redirect_reason');
      const registrationNotice = sessionStorage.getItem('registration_notice');
      const registrationUsername = sessionStorage.getItem('registration_username');
      if (!reason && !registrationNotice && !registrationUsername) return;
      sessionStorage.removeItem('auth_redirect_reason');
      sessionStorage.removeItem('registration_notice');
      sessionStorage.removeItem('registration_username');
      if (reason === 'expired') {
        setMessage('Your session expired. Please log in again.');
        setIsError(true);
        return;
      }
      if (registrationNotice) {
        setMessage(registrationNotice);
        setIsError(false);
      }
      if (registrationUsername) {
        setUsername(registrationUsername);
      }
    } catch (_error) {
      // ignore storage failures
    }
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setMessage('');
    setIsError(false);
    setSubmitting(true);
    try {
      const cleanUsername = username.trim();
      const cleanPassword = password;
      if (!cleanUsername || !cleanPassword) {
        setMessage('Username and password are required.');
        setIsError(true);
        return;
      }
      clearStoredTokens();
      const response = await api.post('/api/auth/login', {
        username: cleanUsername,
        password: cleanPassword
      }, { skipAuthHandling: true });
      if (response.data.token) {
        clearStoredTokens();
        localStorage.setItem('token', response.data.token);
        if (window.chrome && window.chrome.storage && window.chrome.storage.local) {
          window.chrome.storage.local.remove(['token', 'authToken', 'jwt'], () => {
            window.chrome.storage.local.set({ token: response.data.token }, () => {});
          });
        }
        setMessage('Login successful.');
        setIsError(false);
        if (typeof onLoginSuccess === 'function') {
          onLoginSuccess();
        }
      } else {
        setMessage('Login succeeded, but no token was returned.');
        setIsError(true);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Login failed. Invalid credentials or server error.';
      setMessage(errorMessage);
      setIsError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell auth-shell--editorial">
      <div className="auth-editorial auth-editorial--login">
        <section className="auth-editorial__lead">
          <Link to="/" className="auth-editorial__brand">Noeis</Link>
          <div className="auth-editorial__eyebrow">Reading room access</div>
          <h1>Return to your notebook.</h1>
          <p className="auth-editorial__lede">
            Log in to pick up your saved reading, active concepts, and open questions without
            losing the thread.
          </p>
          <div className="auth-editorial__notes">
            <div className="auth-editorial__note">
              <span>Works in the browser</span>
              <p>Manual notes, direct paste, CSV imports, and markdown uploads all work in the web app.</p>
            </div>
            <div className="auth-editorial__note">
              <span>One-click clipping</span>
              <p>
                For capture straight from the page, install the free
                <a href={chromeStoreLink} target="_blank" rel="noopener noreferrer"> Chrome Extension</a>.
              </p>
            </div>
          </div>
        </section>

        <section className="auth-editorial__panel">
          <div className="auth-editorial__panel-head">
            <div className="auth-editorial__eyebrow">Login</div>
            <h2>Enter Noeis</h2>
            <p>Use your existing account details to reopen the workspace.</p>
          </div>

          <form onSubmit={handleLogin} className="auth-editorial__form">
            <label className="auth-editorial__field" htmlFor="username-login">
              <span>Username</span>
              <input
                type="text"
                id="username-login"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label className="auth-editorial__field" htmlFor="password-login">
              <span>Password</span>
              <input
                type="password"
                id="password-login"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            <Button type="submit" className="auth-editorial__submit" disabled={submitting}>
              {submitting ? 'Logging in…' : 'Login'}
            </Button>
          </form>

          {message && (
            <p className={`status-message ${isError ? 'error-message' : 'success-message'}`}>{message}</p>
          )}

          <div className="auth-editorial__switch">
            <span>Don&apos;t have an account?</span>
            <button type="button" className="auth-editorial__switch-button" onClick={() => navigate('/register')}>
              Register here
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
