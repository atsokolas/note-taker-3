import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function useEvidenceReturnFocus(ready) {
  const { key, state } = useLocation();
  const id = state?.evidenceFocusId;
  useEffect(() => {
    if (!ready || !id) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const source = document.getElementById(id);
      source?.focus({ preventScroll: true });
      source?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [id, key, ready]);
}
