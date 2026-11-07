import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/signin.css';

/* Log in and Create account share one quiet page: the name, a heading, the
   form, and the way to the other one. Nothing beside it competes with the
   form, because the form is the only thing anyone came here to do. */
export const AuthPage = ({ title, lede, children, footer }) => (
  <main className="signin">
    <Link to="/" className="signin__brand">Noeis</Link>
    <div className="signin__column">
      <h1>{title}</h1>
      {lede ? <p className="signin__lede">{lede}</p> : null}
      {children}
      {footer ? <p className="signin__switch">{footer}</p> : null}
    </div>
  </main>
);

/* A field, with what it needs said under it, and what went wrong said there
   instead when something did. */
export const AuthField = ({ id, label, hint, error, after, ...input }) => (
  <div className={`signin__field${error ? ' has-error' : ''}`}>
    <label htmlFor={id}>{label}</label>
    <div className="signin__input">
      <input
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        {...input}
      />
      {after}
    </div>
    {error || hint ? (
      <p id={`${id}-note`} className="signin__note" role={error ? 'alert' : undefined}>{error || hint}</p>
    ) : null}
  </div>
);

/* Hand the session to the browser extension, so it is signed in too. */
export const storeToken = (token) => {
  localStorage.setItem('token', token);
  const storage = window.chrome?.storage?.local;
  if (storage) storage.remove(['token', 'authToken', 'jwt'], () => storage.set({ token }, () => {}));
};
