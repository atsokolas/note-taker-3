import React, { useState } from 'react';
import { keepPassage } from '../../api/home';
import EvergreenToggle from '../EvergreenToggle';

/* Keep this one passage for good, beside it, wherever you are reading:
   the same word as keeping a whole source, and it goes to Kept on Home. */
export default function KeepPassage({ articleId, highlight, label = '' }) {
  const [keptAt, setKeptAt] = useState(highlight?.keptAt || null);
  const highlightId = highlight?._id || highlight?.id;
  if (!articleId || !highlightId) return null;
  const keep = async next => setKeptAt((await keepPassage({ articleId, highlightId }, next)).keptAt);
  return <EvergreenToggle evergreen={Boolean(keptAt)} onChange={keep} label={keptAt ? '' : label} className="keep-passage" />;
}
