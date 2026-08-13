import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import ExtensionCaptureCard from './ExtensionCaptureCard';

const mockFireTourSignal = jest.fn();
jest.mock('../tour/useTourSignal', () => ({
  __esModule: true,
  default: () => mockFireTourSignal
}));

/** Stand in for the extension's content script announcing itself. */
const announceExtension = ({ signedIn, version = '1.3' }) => {
  document.documentElement.setAttribute('data-noeis-extension', version);
  document.documentElement.setAttribute('data-noeis-extension-auth', signedIn ? 'connected' : 'signed_out');
};

describe('ExtensionCaptureCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.documentElement.removeAttribute('data-noeis-extension');
    document.documentElement.removeAttribute('data-noeis-extension-auth');
  });

  it('asks for the install when no extension answers', async () => {
    render(<ExtensionCaptureCard />);

    // Absence of a reply is not proof of absence until detection times out.
    expect(screen.getByText(/Checking for the browser extension/)).toBeInTheDocument();

    expect(await screen.findByText('I can only read what reaches me.', {}, { timeout: 3000 }))
      .toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Add the extension' });
    expect(cta).toHaveAttribute('href', expect.stringContaining('chromewebstore.google.com'));
    expect(mockFireTourSignal).not.toHaveBeenCalled();
  });

  it('distinguishes installed-but-signed-out from connected', async () => {
    announceExtension({ signedIn: false });
    render(<ExtensionCaptureCard />);

    expect(await screen.findByText('The extension is installed, but not signed in.')).toBeInTheDocument();
    // Nothing to install — do not show an install button to someone who has it.
    expect(screen.queryByRole('link', { name: 'Add the extension' })).not.toBeInTheDocument();
    expect(mockFireTourSignal).not.toHaveBeenCalled();
  });

  it('stops asking and records the connection once capture works', async () => {
    announceExtension({ signedIn: true });
    render(<ExtensionCaptureCard />);

    expect(await screen.findByText('Capture is set up.')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    // This is the signal that previously only fired if the user opened the popup.
    await waitFor(() => expect(mockFireTourSignal).toHaveBeenCalledWith(
      'extension_connected',
      expect.objectContaining({ via: 'presence_detection' })
    ));
  });

  it('answers a late presence message from the content script', async () => {
    render(<ExtensionCaptureCard />);
    expect(screen.getByText(/Checking for the browser extension/)).toBeInTheDocument();

    // The content script posts from the page's own window, so event.source is
    // window. jsdom's postMessage leaves source null, hence the explicit event.
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        data: {
          source: 'noeis-extension',
          type: 'NOEIS_EXTENSION_PRESENCE',
          version: '1.3',
          signedIn: true
        }
      }));
    });

    expect(await screen.findByText('Capture is set up.')).toBeInTheDocument();
  });

  it('carries the tour anchor the install step targets', async () => {
    announceExtension({ signedIn: true });
    const { container } = render(<ExtensionCaptureCard />);
    await screen.findByText('Capture is set up.');
    expect(container.querySelector('[data-tour-anchor="install-extension"]')).not.toBeNull();
    expect(container.querySelector('#capture')).not.toBeNull();
  });
});
