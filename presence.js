/* On noeis.io, and nowhere else.
 *
 * Three things the extension learns from the reader's own Noeis tab, so they
 * never have to be asked for twice:
 *
 *   - Signed in. The extension follows the reader's noeis.io session: signing
 *     in there signs the toolbar in, signing out there signs it out. Only a
 *     sign-out pressed in the extension itself holds until they sign in again
 *     from it.
 *   - Here. The app can tell "not installed", "installed but signed out" and
 *     "connected" apart (useExtensionPresence), so onboarding says true things.
 *   - The theme. The reader's palette, read off the page, so the toolbar card
 *     and the margin wear the same paper and ink as the app.
 */
(() => {
  const version = chrome.runtime.getManifest().version;
  const root = document.documentElement;
  let palette = '';

  const announce = (signedIn) => {
    root.setAttribute('data-noeis-extension', version);
    root.setAttribute('data-noeis-extension-auth', signedIn ? 'connected' : 'signed_out');
    window.postMessage({ source: 'noeis-extension', type: 'NOEIS_EXTENSION_PRESENCE', version, signedIn }, location.origin);
  };

  const readPalette = () => {
    const style = getComputedStyle(root);
    const colors = Object.fromEntries([...style]
      .filter(name => name.startsWith('--noeis-'))
      .map(name => [name, style.getPropertyValue(name).trim()]));
    const next = JSON.stringify(colors);
    if (next === palette || next === '{}') return;
    palette = next;
    chrome.storage.local.set({ palette: colors });
  };

  const sync = async () => {
    const page = localStorage.getItem('token') || '';
    const { token = '', signedOut = false } = await chrome.storage.local.get(['token', 'signedOut']);
    const next = signedOut ? token : page;
    if (next !== token) await (next ? chrome.storage.local.set({ token: next }) : chrome.storage.local.remove('token'));
    announce(Boolean(next));
    return Boolean(next);
  };

  window.addEventListener('message', (event) => {
    if (event.source === window && event.data?.source === 'noeis-app' && event.data?.type === 'NOEIS_EXTENSION_PING') sync();
  });
  // Signing in on the app is a route change, not a page load: look again
  // while signed out, and whenever the reader comes back to the tab.
  const watch = setInterval(async () => { if (await sync()) clearInterval(watch); }, 1500);
  ['focus', 'storage'].forEach(name => window.addEventListener(name, sync));
  new MutationObserver(readPalette).observe(root, { attributes: true, attributeFilter: ['data-ui-theme', 'data-ui-scheme'] });

  sync();
  readPalette();
})();
