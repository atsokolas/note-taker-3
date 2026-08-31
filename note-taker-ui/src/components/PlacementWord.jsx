import React, { useState } from 'react';
import { placementWordLabel } from '../pages/placementModel';
import '../styles/evergreen.css';

/*
 * Later or Set aside — the same kind of word as Keep: a fact with a rule
 * under it, not a toolbar icon. Pressing the active word sends the source
 * home to the stream.
 */
const PlacementWord = ({
  placement,
  active = false,
  onChange,
  className = ''
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filing, setFiling] = useState(false);
  const label = placementWordLabel(placement);

  const press = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const next = !active;
    if (next) setFiling(true);
    try {
      await onChange(next ? placement : 'stream');
    } catch (pressError) {
      setError(pressError?.response?.data?.error || 'That did not save.');
      setFiling(false);
    } finally {
      setBusy(false);
      if (next) {
        window.setTimeout(() => setFiling(false), 520);
      }
    }
  };

  return (
    <>
      <button
        type="button"
        className={`source-decision source-decision--${placement}${active ? ' is-active' : ''}${filing ? ' is-filing' : ''} ${className}`.trim()}
        aria-pressed={active}
        title={active ? `${label}. Press to return it home.` : label}
        disabled={busy}
        onClick={press}
      >
        {busy ? 'Saving…' : label}
      </button>
      {error ? <span className="source-decision__error" role="alert">{error}</span> : null}
    </>
  );
};

export default PlacementWord;
