import React, { useState } from 'react';
import { evergreenToggleLabel } from '../pages/evergreenModel';
import '../styles/evergreen.css';

/*
 * Keep this.
 *
 * One control, three surfaces — a source, a wiki page, a belief — because
 * keeping something for life is the same decision whichever room you are
 * standing in. It is the only flag in Noeis that no agent may set.
 *
 * It states the current state rather than the pending action once kept, the
 * way the rest of the product does: "Kept" is a fact about the thing, and
 * pressing it again lets it go.
 */
const EvergreenToggle = ({ evergreen = false, onChange, label = '', className = '' }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onChange(!evergreen);
    } catch (toggleError) {
      setError(toggleError?.response?.data?.error || 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`evergreen-toggle${evergreen ? ' is-kept' : ''} ${className}`.trim()}
        aria-pressed={evergreen}
        title={evergreen ? 'Kept for good. Press to let it go.' : 'Keep this for good.'}
        disabled={busy}
        onClick={toggle}
      >
        {busy ? 'Saving…' : (label || evergreenToggleLabel(evergreen))}
      </button>
      {error ? <span className="evergreen-toggle__error" role="alert">{error}</span> : null}
    </>
  );
};

export default EvergreenToggle;
