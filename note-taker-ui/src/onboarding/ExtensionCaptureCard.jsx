import React, { useEffect } from 'react';
import useExtensionPresence, { EXTENSION_STATE } from './useExtensionPresence';
import useTourSignal from '../tour/useTourSignal';
import { TOUR_EXTENSION_URL } from '../tour/tourConfig';

/**
 * ExtensionCaptureCard — the one place in the product that asks for the browser
 * extension and can tell you whether you already have it.
 *
 * Written as the agent asking for something it needs, with the payoff stated,
 * rather than as a settings row. Copy changes with real detected state so it
 * stops asking once capture actually works.
 */
const ExtensionCaptureCard = ({ compact = false, heading = '' }) => {
  const { state, isConnected } = useExtensionPresence();
  const fireTourSignal = useTourSignal();

  useEffect(() => {
    // Detection is a real connection signal. Previously this only fired when the
    // user happened to open the extension popup while signed in.
    if (isConnected) fireTourSignal('extension_connected', { via: 'presence_detection' });
  }, [fireTourSignal, isConnected]);

  const body = (() => {
    switch (state) {
      case EXTENSION_STATE.CONNECTED:
        return {
          title: 'Capture is set up.',
          detail: 'Highlight anything on the web and it lands in your library.',
          action: null
        };
      case EXTENSION_STATE.INSTALLED_SIGNED_OUT:
        return {
          title: 'The extension is installed, but not signed in.',
          detail: 'Open it from your browser toolbar and sign in — then highlights start reaching Noeis.',
          action: null
        };
      case EXTENSION_STATE.NOT_INSTALLED:
        return {
          title: 'I can only read what reaches me.',
          detail: 'Add the browser extension and save or highlight from any article in one click.',
          action: { label: 'Add the extension', href: TOUR_EXTENSION_URL }
        };
      default:
        return {
          title: 'Checking for the browser extension…',
          detail: 'One moment.',
          action: null
        };
    }
  })();

  return (
    <section
      id="capture"
      className={`extension-capture-card${compact ? ' is-compact' : ''}${isConnected ? ' is-connected' : ''}`}
      data-tour-anchor="install-extension"
      data-extension-state={state}
      aria-label="Browser capture setup"
    >
      <div className="extension-capture-card__copy">
        {heading ? <p className="muted-label">{heading}</p> : null}
        <strong>{body.title}</strong>
        <p className="muted">{body.detail}</p>
      </div>
      {body.action ? (
        <a
          className="extension-capture-card__cta"
          href={body.action.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {body.action.label}
        </a>
      ) : null}
      {isConnected ? <span className="extension-capture-card__badge" aria-hidden="true">Connected</span> : null}
    </section>
  );
};

export default ExtensionCaptureCard;
