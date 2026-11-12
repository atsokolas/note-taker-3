import React, { useState } from 'react';
import { STAGES, stageOf } from './notebookStages';

/* Where this piece stands, as three words on the page. Closing asks one
   line: what did it become? */
const NoteStage = ({ board, onMove }) => {
  const stage = stageOf(board);
  const [closing, setClosing] = useState(false);
  const [became, setBecame] = useState('');

  const close = (event) => {
    event.preventDefault();
    onMove('done', became.trim());
    setClosing(false);
    setBecame('');
  };

  return (
    <div className="note-stage">
      <div role="group" aria-label="Where this piece stands" className="note-stage__words">
        {STAGES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={stage === key}
            onClick={() => (key === 'done' ? setClosing(stage !== 'done') : onMove(key))}
          >{label}</button>
        ))}
      </div>
      {closing ? (
        <form className="note-stage__closing" onSubmit={close}>
          <input
            autoFocus
            aria-label="What did it become?"
            placeholder="What did it become? Sent to Sam, posted, folded into a page, let go…"
            maxLength={200}
            value={became}
            onChange={event => setBecame(event.target.value)}
            onKeyDown={event => { if (event.key === 'Escape') setClosing(false); }}
          />
          <button type="submit">Close it</button>
        </form>
      ) : stage === 'done' && board?.became ? <p className="note-stage__became">Became: {board.became}</p> : null}
    </div>
  );
};

export default NoteStage;
