import React, { useEffect, useState } from 'react';

/* Hemingway stopped mid-sentence so the next day began itself. At the foot of
   the page: where the next sentence goes. Saved on Enter or on leaving the
   field, at the place your caret last was; empty clears it. */
const NextSentence = ({ line = '', onSave }) => {
  const [draft, setDraft] = useState(line);
  useEffect(() => { setDraft(line); }, [line]);
  const save = () => { if (draft.trim() !== line.trim()) onSave(draft); };

  return (
    <label className="next-sentence">
      <span>Where does the next sentence go?</span>
      <input
        value={draft}
        maxLength={500}
        placeholder="Leave yourself the start of it."
        onChange={event => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === 'Escape') setDraft(line);
        }}
      />
    </label>
  );
};

export default NextSentence;
