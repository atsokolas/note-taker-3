import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api, { clearStoredTokens } from '../api';
import { Button } from './ui';
import {
  trackSignupFailed,
  trackSignupStarted,
  trackSignupSucceeded,
  trackSignupViewed
} from '../utils/marketingAnalytics';
import { readMarketingAttribution } from '../utils/marketingAttribution';

const PASSWORD_MIN_LENGTH = 8;

const validateRegistration = ({ username, password }) => {
  const cleanUsername = username.trim();

  if (!cleanUsername || !password) {
    return 'Username and password are required.';
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (cleanUsername.toLowerCase() === password.trim().toLowerCase()) {
    return 'Password cannot match your username.';
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must include at least one letter and one number.';
  }
  return '';
};

/**
 * Sign the freshly-created account in without a second form.
 *
 * /api/auth/register intentionally returns no token, so we chain a login call with
 * the credentials the user just typed. Returns true only when a token was stored.
 * Any failure falls back to the old behavior (send them to /login) rather than
 * stranding a user whose account definitely exists.
 */
const autoLogin = async ({ username, password }) => {
  const response = await api.post('/api/auth/login', { username, password }, { skipAuthHandling: true });
  const token = response.data?.token;
  if (!token) return false;
  clearStoredTokens();
  localStorage.setItem('token', token);
  // Mirror the extension handoff Login.js performs, so the browser extension
  // picks up the session without a separate sign-in.
  if (window.chrome && window.chrome.storage && window.chrome.storage.local) {
    window.chrome.storage.local.remove(['token', 'authToken', 'jwt'], () => {
      window.chrome.storage.local.set({ token }, () => {});
    });
  }
  return true;
};

const Register = ({ chromeStoreLink, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // One password field you can read, instead of two you cannot. A typo you can
  // see is a typo you fix before it becomes an account you cannot open.
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    trackSignupViewed();
  }, []);

  const handleRegister = async (event) => {
    event.preventDefault();
    setMessage('');
    setIsError(false);
    setSubmitting(true);
    const validationMessage = validateRegistration({ username, password });
    if (validationMessage) {
      setMessage(validationMessage);
      setIsError(true);
      setSubmitting(false);
      trackSignupFailed({
        reason: 'validation',
        error: validationMessage
      });
      return;
    }
    try {
      const cleanUsername = username.trim();
      trackSignupStarted();
      clearStoredTokens();
      const response = await api.post('/api/auth/register', {
        username: cleanUsername,
        password,
        marketingAttribution: readMarketingAttribution()
      }, { skipAuthHandling: true });
      trackSignupSucceeded({ username: cleanUsername });

      // Straight into first run. A second sign-in here is pure friction.
      let signedIn = false;
      try {
        signedIn = await autoLogin({ username: cleanUsername, password });
      } catch (_error) {
        signedIn = false;
      }

      if (signedIn) {
        if (typeof onLoginSuccess === 'function') onLoginSuccess();
        let returnTo = '';
        try {
          returnTo = sessionStorage.getItem('auth_return_to') || '';
          sessionStorage.removeItem('auth_return_to');
        } catch (_error) {
          // ignore storage failures
        }
        // Without somewhere to return to, go straight to first run rather than
        // through the home page, which would paint for a moment and then leave.
        const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/welcome';
        navigate(safeReturnTo, { replace: true });
        return;
      }

      // Auto sign-in failed but the account exists — fall back to the login form.
      try {
        sessionStorage.setItem('registration_notice', response.data?.loginMessage || 'Account created. You can log in now.');
        sessionStorage.setItem('registration_username', cleanUsername);
      } catch (_error) {
        // ignore storage failures
      }
      navigate('/login');
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Registration failed. Please try again.';
      setMessage(errorMessage);
      setIsError(true);
      trackSignupFailed({
        reason: 'request',
        error: errorMessage
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell auth-shell--editorial">
      <div className="auth-editorial auth-editorial--register">
        <section className="auth-editorial__lead">
          <Link to="/" className="auth-editorial__brand">Noeis</Link>
          <div className="auth-editorial__eyebrow">Your first five minutes</div>
          <h1>Write what you think. See what your reading says about it.</h1>
          <p className="auth-editorial__lede">
            Hold one view, bring what you have read, and Noeis shows you the passages you saved that
            bear on it. You decide what each one does.
          </p>
          <div className="auth-editorial__notes">
            <div className="auth-editorial__note">
              <span>Bring it in one step</span>
              <p>
                Years of Readwise highlights, or links to a few things you read this week. Later, save
                from any page with the
                <a href={chromeStoreLink} target="_blank" rel="noopener noreferrer"> browser extension</a>.
              </p>
            </div>
            <div className="auth-editorial__note">
              <span>Yours alone</span>
              <p>Your library is private. Nothing leaves it unless you publish it.</p>
            </div>
          </div>
        </section>

        <section className="auth-editorial__panel">
          <div className="auth-editorial__panel-head">
            <div className="auth-editorial__eyebrow">Start</div>
            <h2>Create your account</h2>
            <p>A password of eight or more characters, with a letter and a number.</p>
          </div>

          <form onSubmit={handleRegister} className="auth-editorial__form">
            <label className="auth-editorial__field" htmlFor="register-username">
              <span>Username</span>
              <input
                type="text"
                id="register-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <div className="auth-editorial__field">
              <label htmlFor="register-password"><span>Password</span></label>
              <div className="auth-editorial__password">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="register-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="auth-editorial__reveal"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(shown => !shown)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <Button type="submit" className="auth-editorial__submit" disabled={submitting}>
              {submitting ? 'Creating your account…' : 'Create account'}
            </Button>
          </form>

          {message && (
            <p className={`status-message ${isError ? 'error-message' : 'success-message'}`}>{message}</p>
          )}

          <div className="auth-editorial__switch">
            <span>Already have an account?</span>
            <button type="button" className="auth-editorial__switch-button" onClick={() => navigate('/login')}>
              Sign in
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Register;
