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

const validateRegistration = ({ username, password, confirmPassword }) => {
  const cleanUsername = username.trim();

  if (!cleanUsername || !password) {
    return 'Username and password are required.';
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match.';
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

const Register = ({ chromeStoreLink }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    const validationMessage = validateRegistration({ username, password, confirmPassword });
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
      try {
        sessionStorage.setItem('registration_notice', response.data?.loginMessage || 'Account created. You can log in now.');
        sessionStorage.setItem('registration_username', cleanUsername);
      } catch (_error) {
        // ignore storage failures
      }
      trackSignupSucceeded({ username: cleanUsername });
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
          <div className="auth-editorial__eyebrow">Create your reading room</div>
          <h1>Set up the notebook once, then let it compound.</h1>
          <p className="auth-editorial__lede">
            Create an account to keep your saved reading, concepts, and open questions inside one
            editorial workspace.
          </p>
          <div className="auth-editorial__notes">
            <div className="auth-editorial__note">
              <span>For heavy readers</span>
              <p>Keep highlights attached to source, build notes in context, and deepen concepts over time.</p>
            </div>
            <div className="auth-editorial__note">
              <span>Capture options</span>
              <p>
                Use manual paste and imports in the app, or install the free
                <a href={chromeStoreLink} target="_blank" rel="noopener noreferrer"> Chrome Extension</a>
                {' '}for one-click clipping.
              </p>
            </div>
          </div>
        </section>

        <section className="auth-editorial__panel">
          <div className="auth-editorial__panel-head">
            <div className="auth-editorial__eyebrow">Register</div>
            <h2>Create your account</h2>
            <p>Use a password with at least eight characters, including one letter and one number.</p>
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

            <label className="auth-editorial__field" htmlFor="register-password">
              <span>Password</span>
              <input
                type="password"
                id="register-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            <label className="auth-editorial__field" htmlFor="register-confirm-password">
              <span>Confirm password</span>
              <input
                type="password"
                id="register-confirm-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            <Button type="submit" className="auth-editorial__submit" disabled={submitting}>
              {submitting ? 'Registering…' : 'Register'}
            </Button>
          </form>

          {message && (
            <p className={`status-message ${isError ? 'error-message' : 'success-message'}`}>{message}</p>
          )}

          <div className="auth-editorial__switch">
            <span>Already have an account?</span>
            <button type="button" className="auth-editorial__switch-button" onClick={() => navigate('/login')}>
              Login here
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Register;
