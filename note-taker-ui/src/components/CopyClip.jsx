import React, { useEffect, useState } from 'react';

export default function CopyClip({ clip, idleLabel }) {
  const [receipt, setReceipt] = useState(null);
  const status = receipt?.clip === clip ? receipt?.status : '';

  useEffect(() => {
    if (status !== 'copied') return undefined;
    const timer = window.setTimeout(() => setReceipt(null), 1600);
    return () => window.clearTimeout(timer);
  }, [receipt, status]);

  if (!clip) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(clip);
      setReceipt({ clip, status: 'copied' });
    } catch {
      setReceipt({ clip, status: 'manual' });
    }
  };

  return <>
    <button type="button" onClick={copy}>{status === 'copied' ? 'Copied.' : idleLabel}</button>
    <span className="sr-only" role="status">
      {status === 'copied' ? 'Copied to clipboard.' : status === 'manual' ? 'Clipboard unavailable. Copy the text manually.' : ''}
    </span>
    {status === 'manual' ? (
      <label className="copy-clip__manual">
        Copy the text manually
        <textarea rows={5} readOnly value={clip} onFocus={event => {
          const field = event.currentTarget;
          requestAnimationFrame(() => { if (document.activeElement === field) field.select(); });
        }} />
      </label>
    ) : null}
  </>;
}
