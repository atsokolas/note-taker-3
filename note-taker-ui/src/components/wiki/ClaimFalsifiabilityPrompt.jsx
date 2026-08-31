import React, { useState } from 'react';

const toDay = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

/**
 * Optional. Never required. The same question at write time and at check-in:
 * what would change your mind — and by when?
 */
const ClaimFalsifiabilityPrompt = ({
  criteria = '',
  horizon = '',
  busy = false,
  onKeep
}) => {
  const [text, setText] = useState(criteria);
  const [when, setWhen] = useState(toDay(horizon));
  const [saved, setSaved] = useState(false);

  const keep = async () => {
    if (busy || !onKeep) return;
    await onKeep({
      resolutionCriteria: text,
      horizon: when || null
    });
    setSaved(true);
  };

  return (
    <details className="claim-falsifiability">
      <summary>What would change your mind — and by when?</summary>
      <div className="claim-falsifiability__fields">
        <label>
          <span className="sr-only">What would change your mind</span>
          <textarea
            value={text}
            onChange={(event) => { setText(event.target.value); setSaved(false); }}
            placeholder="The test, in a sentence."
            rows={2}
            disabled={busy}
          />
        </label>
        <label className="claim-falsifiability__when">
          <span>By when</span>
          <input
            type="date"
            value={when}
            onChange={(event) => { setWhen(event.target.value); setSaved(false); }}
            disabled={busy}
          />
        </label>
        <button type="button" disabled={busy} onClick={keep}>
          Keep
        </button>
        {saved ? <p className="claim-falsifiability__kept">Noted.</p> : null}
      </div>
    </details>
  );
};

export default ClaimFalsifiabilityPrompt;
