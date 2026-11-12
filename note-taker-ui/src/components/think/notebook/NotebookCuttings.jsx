import React, { useEffect, useState } from 'react';
import { getNotebookCuttings } from '../../../api/notebook';
import { PageHeader } from '../../ui';
import { dayLabel } from './notebookStages';

const WHERE = { dimmed: 'Dimmed in', aside: 'In the scratchpad of' };

/* Cuttings: everything you dimmed or set aside, from every piece, so a cut
   line can be found again. Nothing here is moved or deleted; it is read from
   each note. */
const NotebookCuttings = ({ onOpen }) => {
  const [cuttings, setCuttings] = useState(null);
  const [said, setSaid] = useState('');
  useEffect(() => {
    let live = true;
    getNotebookCuttings()
      .then(rows => { if (live) setCuttings(rows); })
      .catch(() => { if (live) { setCuttings([]); setSaid('Your cuttings could not be gathered. Reload to try again.'); } });
    return () => { live = false; };
  }, []);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setSaid('Copied.');
    } catch (_error) {
      setSaid('That could not be copied. Select the words instead.');
    }
  };

  return (
    <section className="notebook-cuttings" aria-labelledby="notebook-cuttings-title">
      <PageHeader
        titleId="notebook-cuttings-title"
        title="Cuttings"
        lede={cuttings === null ? 'Gathering what you cut…'
          : 'Everything you dimmed or set aside, from every piece. Nothing here is lost.'}
      />
      <p className="notebook-cuttings__said" role="status">{said}</p>
      {cuttings?.length ? (
        <ol className="notebook-cuttings__list">
          {cuttings.map(item => (
            <li key={item.id}>
              <blockquote>{item.text}</blockquote>
              <p>
                {WHERE[item.kind]} <button type="button" onClick={() => onOpen(item.noteId)}>{item.noteTitle}</button>
                {item.createdAt ? ` · ${dayLabel(item.createdAt)}` : ''}
                <button type="button" onClick={() => copy(item.text)}>Copy</button>
              </p>
            </li>
          ))}
        </ol>
      ) : cuttings ? (
        <p className="notebook-cuttings__quiet">Nothing cut yet. Dim a sentence with Ctrl+. or set a paragraph aside with Ctrl+Shift+X, and it waits here.</p>
      ) : null}
    </section>
  );
};

export default NotebookCuttings;
