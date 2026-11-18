import React, { useEffect, useState } from 'react';
import { usedIn } from '../../api/citations';

const day = at => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/* Where agents put this to work, as they said: the reader sees which of
   their thinking is pulling weight. Nothing is shown until an agent says. */
const UsedIn = ({ id }) => {
  const [uses, setUses] = useState([]);
  useEffect(() => {
    let live = true;
    setUses([]);
    if (id) usedIn(id).then(found => live && setUses(found)).catch(() => {});
    return () => { live = false; };
  }, [id]);
  if (!uses.length) return null;
  return (
    <p className="pencil-line">
      Put to work: {uses.map(use => `${use.where} (${use.agent}, ${day(use.at)})`).join('; ')}.
    </p>
  );
};

export default UsedIn;
