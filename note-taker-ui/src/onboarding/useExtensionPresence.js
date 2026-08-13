import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useExtensionPresence — can we see the browser extension, and is it signed in?
 *
 * Three states matter and they need different copy:
 *   not_installed        -> ask them to install it
 *   installed_signed_out -> it is there but useless; ask them to sign in
 *   connected            -> capture is actually working; say so and stop asking
 *
 * The extension content script announces itself on Noeis hosts (see content.js),
 * both as a DOM marker and as a postMessage reply to our ping. We read the marker
 * first for the case where the script ran before this mounted, then ping for the
 * case where it did not.
 *
 * `unknown` is the honest initial state: absence of a reply is not proof of
 * absence until we have given the extension a moment to answer.
 */

export const EXTENSION_STATE = Object.freeze({
  UNKNOWN: 'unknown',
  NOT_INSTALLED: 'not_installed',
  INSTALLED_SIGNED_OUT: 'installed_signed_out',
  CONNECTED: 'connected'
});

// How long to wait for an answer before calling it absent.
const DETECT_TIMEOUT_MS = 1200;

const readMarker = () => {
  const root = document.documentElement;
  const version = root?.getAttribute('data-noeis-extension');
  if (!version) return null;
  return {
    version: version === 'installed' ? '' : version,
    signedIn: root.getAttribute('data-noeis-extension-auth') === 'connected'
  };
};

const useExtensionPresence = ({ timeoutMs = DETECT_TIMEOUT_MS } = {}) => {
  const [state, setState] = useState(EXTENSION_STATE.UNKNOWN);
  const [version, setVersion] = useState('');
  const settledRef = useRef(false);

  const apply = useCallback((presence) => {
    settledRef.current = true;
    setVersion(presence.version || '');
    setState(presence.signedIn ? EXTENSION_STATE.CONNECTED : EXTENSION_STATE.INSTALLED_SIGNED_OUT);
  }, []);

  useEffect(() => {
    settledRef.current = false;
    let timer = null;

    const onMessage = (event) => {
      if (event.source !== window) return;
      if (event.data?.source !== 'noeis-extension') return;
      if (event.data?.type !== 'NOEIS_EXTENSION_PRESENCE') return;
      apply({ version: event.data.version, signedIn: Boolean(event.data.signedIn) });
    };
    window.addEventListener('message', onMessage);

    const existing = readMarker();
    if (existing) {
      apply(existing);
    } else {
      window.postMessage({ source: 'noeis-app', type: 'NOEIS_EXTENSION_PING' }, window.location.origin);
      timer = window.setTimeout(() => {
        // Re-read once more before declaring it absent: the script may have landed
        // between our ping and this timeout.
        const late = readMarker();
        if (late) {
          apply(late);
          return;
        }
        if (!settledRef.current) setState(EXTENSION_STATE.NOT_INSTALLED);
      }, timeoutMs);
    }

    return () => {
      window.removeEventListener('message', onMessage);
      if (timer) window.clearTimeout(timer);
    };
  }, [apply, timeoutMs]);

  return {
    state,
    version,
    isDetecting: state === EXTENSION_STATE.UNKNOWN,
    isInstalled: state === EXTENSION_STATE.CONNECTED || state === EXTENSION_STATE.INSTALLED_SIGNED_OUT,
    isConnected: state === EXTENSION_STATE.CONNECTED
  };
};

export default useExtensionPresence;
export { DETECT_TIMEOUT_MS };
