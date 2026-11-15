import React, { useEffect, useState } from 'react';
import { changePassword, closeAccount, getAccount } from '../../api/account';
import { PASSWORD_HINT, passwordProblem } from '../auth/passwordRules';
import { Button } from '../ui';

const sinceLine = (since) => {
  const date = since ? new Date(since) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return `Reading here since ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`;
};

const messageFrom = (error, fallback) => error?.response?.data?.error || fallback;

/* Who you are, your password, and the two ways out: log out, or close the
   account. Closing asks for the password again, so a borrowed session
   cannot close someone else's account. */
const AccountSection = ({ onAccount, onLogout = () => {}, onClosed = onLogout }) => {
  const [account, setAccount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAccount()
      .then((loaded) => {
        if (cancelled) return;
        setAccount(loaded);
        onAccount?.(loaded);
      })
      .catch(() => { if (!cancelled) setAccount({}); });
    return () => { cancelled = true; };
  }, [onAccount]);

  return (
    <section className="settings-account">
      <div className="settings-redesign__pagehead">
        <div>
          <h2>Account</h2>
          {account?.username ? (
            <p className="settings-redesign__help" style={{ marginTop: '0.45rem' }}>
              Logged in as <strong>{account.username}</strong>. {sinceLine(account.since)}
            </p>
          ) : null}
        </div>
      </div>

      <PasswordChange username={account?.username || ''} />

      <div className="settings-account__block">
        <h3>Log out</h3>
        <p className="settings-redesign__help">Ends this session on this device. Your library stays as it is.</p>
        <Button onClick={onLogout}>Log out</Button>
      </div>

      <CloseAccount onClosed={onClosed} />
    </section>
  );
};

const PasswordChange = ({ username }) => {
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [done, setDone] = useState(false);

  const change = async (event) => {
    event.preventDefault();
    const weak = passwordProblem({ username, password: newPassword });
    if (weak) {
      setProblem(weak);
      return;
    }
    setBusy(true);
    setProblem('');
    try {
      await changePassword({ password, newPassword });
      setDone(true);
      setPassword('');
      setNewPassword('');
    } catch (error) {
      setProblem(messageFrom(error, 'The password did not change. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="settings-account__block" id="account-password" onSubmit={change} noValidate>
      <h3>Password</h3>
      <label className="settings-account__field">
        <span>Current password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setDone(false); setProblem(''); }} />
      </label>
      <label className="settings-account__field">
        <span>New password</span>
        <input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setDone(false); setProblem(''); }} />
        <small>{PASSWORD_HINT}</small>
      </label>
      <div>
        <Button type="submit" disabled={busy || !password || !newPassword}>
          {busy ? 'Changing it…' : 'Change password'}
        </Button>
      </div>
      {problem ? <p className="settings-redesign__receipt is-error" role="alert">{problem}</p> : null}
      {done ? <p className="settings-redesign__receipt" role="status">Your password is changed. Use the new one next time you log in.</p> : null}
    </form>
  );
};

const CloseAccount = ({ onClosed }) => {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const close = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      await closeAccount({ password });
      onClosed();
    } catch (error) {
      setProblem(messageFrom(error, 'The account was not closed. Try again.'));
      setBusy(false);
    }
  };

  return (
    <div className="settings-account__block" id="account-close">
      <h3>Close your account</h3>
      <p className="settings-redesign__help">
        Access ends at once, on every device. What you saved is then erased by hand, and nobody can open it in the meantime. Export your data first if you want a copy.
      </p>
      {open ? (
        <form onSubmit={close} noValidate className="settings-account__close">
          <label className="settings-account__field">
            <span>Your password, to confirm</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setProblem(''); }} />
          </label>
          <div className="settings-account__actions">
            <Button type="submit" className="settings-account__danger" disabled={busy || !password}>
              {busy ? 'Closing it…' : 'Close my account'}
            </Button>
            <Button variant="quiet" onClick={() => { setOpen(false); setPassword(''); setProblem(''); }}>Keep it</Button>
          </div>
          {problem ? <p className="settings-redesign__receipt is-error" role="alert">{problem}</p> : null}
        </form>
      ) : (
        <Button onClick={() => setOpen(true)}>Close my account…</Button>
      )}
    </div>
  );
};

export default AccountSection;
