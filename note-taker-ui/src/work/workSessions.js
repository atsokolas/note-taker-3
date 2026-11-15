import { createWorkSession, workAccount } from './workSession';

// Route/auth remounts must not discard a draft that the device could not retain.
// Sessions are keyed by owner; another account never receives the old session.
const sessions = new Map();
export const workSessionFor = token => {
  const account = workAccount(token);
  if (!sessions.has(account)) sessions.set(account, createWorkSession({ token }));
  return sessions.get(account);
};
export const resumeWorkSession = (session, token) => {
  sessions.set(session.account, session);
  return session.resume(token);
};
export const releaseWorkSession = session => {
  session.dispose();
  if (session.pending().length || session.continuation() || !session.canLeave()) sessions.set(session.account, session);
  else if (sessions.get(session.account) === session) sessions.delete(session.account);
};
export const forgetWorkSession = account => {
  sessions.get(account)?.dispose();
  sessions.delete(account);
};
