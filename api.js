/* The one door from the extension to Noeis.
 *
 * The popup imports it; the margin on a page reaches it through the
 * background worker. The token lives here, and so does the rule for a dead
 * one: a 401 drops it, so the extension never presents itself as signed in
 * while every request fails. Errors come back as sentences a reader can act
 * on, never a status code. */

export const API = 'https://note-taker-3-unrg.onrender.com';
export const APP = 'https://www.noeis.io';

export const SIGNED_OUT = 'Your Noeis session ended. Open the Noeis button in the toolbar to sign in again.';

export const request = async (path, { method = 'GET', body } = {}) => {
  const { token } = await chrome.storage.local.get('token');
  if (!token) throw new Error(SIGNED_OUT);
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  }).catch(() => null);
  if (!response) throw new Error('Noeis could not be reached. Check your connection and try again.');
  if (response.status === 401) {
    await chrome.storage.local.remove('token');
    throw new Error(SIGNED_OUT);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Noeis could not do that just now. Try again in a moment.');
  return data;
};
