import { useEffect, useState } from 'react';
import { onOwnMuseum, readOwnMuseum } from '../../api/museum';

const UNREAD = Object.freeze({ museum: null, kept: [] });

/** Your museum and the kept things not yet on it, kept current as pieces are hung anywhere. */
export default function useOwnMuseum() {
  const [state, setState] = useState(null);
  useEffect(() => {
    let live = true;
    const show = data => { if (live) setState(data); };
    readOwnMuseum().then(show).catch(() => show(UNREAD));
    const stop = onOwnMuseum(show);
    return () => { live = false; stop(); };
  }, []);
  return state;
}
