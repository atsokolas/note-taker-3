import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { clearStoredTokens } from '../api';
import {
  trackSignupFailed,
  trackSignupStarted,
  trackSignupSucceeded,
  trackSignupViewed
} from '../utils/marketingAnalytics';
import { readMarketingAttribution } from '../utils/marketingAttribution';
import { AuthField, AuthPage, storeToken } from './auth/AuthPage';
import { PASSWORD_HINT, passwordProblem } from './auth/passwordRules';

const safeReturn = () => {
  try {
    const returnTo = sessionStorage.getItem('auth_return_to') || '';
    sessionStorage.removeItem('auth_return_to');
    return returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '';
  } catch (_error) {
    return '';
  }
};

const Register = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // One password field you can read, instead of two you cannot. A typo you can
  // see is a typo you fix before it becomes an account you cannot open.
  const [showPassword, setShowPassword] = useState(false);
  const [problem, setProblem] = useState({ field: '', text: '' });
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { trackSignupViewed(); }, []);
  useEffect(() => { setProblem({ field: '', text: '' }); }, [username, password]);

  const fail = (field, text, reason) => {
    setProblem({ field, text });
    trackSignupFailed({ reason, error: text });
  };

  const register = async (event) => {
    event.preventDefault();
    if (submitting) return;
    const cleanUsername = username.trim();
    const weak = passwordProblem({ username: cleanUsername, password });
    if (weak) {
      fail('password', weak, 'validation');
      return;
    }
    setSubmitting(true);
    try {
      trackSignupStarted();
      clearStoredTokens();
      const response = await api.post('/api/auth/register', {
        username: cleanUsername,
        password,
        marketingAttribution: readMarketingAttribution()
      }, { skipAuthHandling: true });
      trackSignupSucceeded({ username: cleanUsername });

      // Straight into first run: register returns no token, so log in with
      // what was just typed. A second form here would be pure friction.
      const token = await api.post('/api/auth/login', { username: cleanUsername, password }, { skipAuthHandling: true })
        .then(({ data }) => data?.token)
        .catch(() => '');
      if (token) {
        clearStoredTokens();
        storeToken(token);
        if (typeof onLoginSuccess === 'function') onLoginSuccess();
        // Without somewhere to return to, go straight to first run rather than
        // through the home page, which would paint for a moment and then leave.
        navigate(safeReturn() || '/welcome', { replace: true });
        return;
      }

      // The account exists but sign-in failed: the login form, ready for it.
      try {
        sessionStorage.setItem('registration_notice', response.data?.loginMessage || 'Account created. You can log in now.');
        sessionStorage.setItem('registration_username', cleanUsername);
      } catch (_error) {
        // ignore storage failures
      }
      navigate('/login');
    } catch (error) {
      const status = error.response?.status;
      const text = error.response?.data?.error || 'Noeis could not be reached. Try again in a moment.';
      fail(status === 409 ? 'username' : status === 400 ? 'password' : 'form', text, 'request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthPage
      title="Create your account."
      lede="Bring what you read, and Noeis writes it into a wiki where every line cites its source. Your library is private."
      footer={<>Have an account? <Link to="/login">Log in</Link></>}
    >
      <form onSubmit={register} noValidate>
        <AuthField
          id="register-username"
          label="Username"
          type="text"
          value={username}
          onChange={event => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          error={problem.field === 'username' ? problem.text : ''}
          required
        />
        <AuthField
          id="register-password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={event => setPassword(event.target.value)}
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          error={problem.field === 'password' ? problem.text : ''}
          required
          after={(
            <button
              type="button"
              className="signin__reveal"
              aria-pressed={showPassword}
              onClick={() => setShowPassword(shown => !shown)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          )}
        />
        {problem.field === 'form' ? <p className="signin__problem" role="alert">{problem.text}</p> : null}
        <button type="submit" className="signin__submit" disabled={submitting || !username.trim() || !password}>
          {submitting ? 'Creating your account…' : 'Create account'}
        </button>
      </form>
    </AuthPage>
  );
};

export default Register;
