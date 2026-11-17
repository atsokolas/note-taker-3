import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { clearStoredTokens } from '../api';
import { forgetReturnPath, readReturnPath } from '../navigation/appRoutes';
import { AuthField, AuthPage, storeToken } from './auth/AuthPage';

/* What the page says before anything is typed: why you are here again, or
   that the account you just made is waiting. Read once, then forgotten. */
const takeArrivalNotice = () => {
  try {
    const reason = sessionStorage.getItem('auth_redirect_reason');
    const notice = sessionStorage.getItem('registration_notice');
    const username = sessionStorage.getItem('registration_username') || '';
    ['auth_redirect_reason', 'registration_notice', 'registration_username'].forEach(key => sessionStorage.removeItem(key));
    if (reason === 'expired') return { notice: 'You were logged out. Log in to pick up where you were.', username };
    return { notice: notice || '', username };
  } catch (_error) {
    return { notice: '', username: '' };
  }
};

/* recovery: the bare form, inside Work, to sign back in without leaving the
   page that holds unsaved writing. */
const Login = ({ onLoginSuccess, recovery = false }) => {
  const [arrival] = useState(takeArrivalNotice);
  const [username, setUsername] = useState(arrival.username);
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { setProblem(''); }, [username, password]);

  const logIn = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      clearStoredTokens();
      const { data } = await api.post('/api/auth/login', {
        username: username.trim(),
        password
      }, { skipAuthHandling: true });
      if (!data?.token) throw new Error('no token');
      clearStoredTokens();
      storeToken(data.token);
      if (typeof onLoginSuccess === 'function') {
        // The authenticated route consumes the return. Navigating here as
        // well races its /login redirect during the auth boundary change.
        onLoginSuccess();
        return;
      }
      const returnTo = readReturnPath();
      forgetReturnPath();
      if (returnTo) navigate(returnTo, { replace: true });
    } catch (error) {
      setProblem(error.response?.data?.error || 'Noeis could not be reached. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const form = (
    <form onSubmit={logIn} noValidate>
      {arrival.notice ? <p className="signin__notice" role="status">{arrival.notice}</p> : null}
      <AuthField
        id="username-login"
        label="Username"
        type="text"
        value={username}
        onChange={event => setUsername(event.target.value)}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus={!recovery && !arrival.username}
        required
      />
      <AuthField
        id="password-login"
        label="Password"
        type="password"
        value={password}
        onChange={event => setPassword(event.target.value)}
        autoComplete="current-password"
        autoFocus={!recovery && Boolean(arrival.username)}
        error={problem}
        required
      />
      <button type="submit" className="signin__submit" disabled={submitting || !username.trim() || !password}>
        {submitting ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );

  if (recovery) return <div className="signin signin-bare">{form}</div>;

  return (
    <AuthPage
      title="Log in to Noeis."
      footer={<>New here? <Link to="/register">Create an account</Link></>}
    >
      {form}
    </AuthPage>
  );
};

export default Login;
