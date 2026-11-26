import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNotebookCuttings, quoteIntoNote } from '../../api/notebook';
import { readKept, readThread } from '../../api/home';
import { Outside } from '../home/Depths';
import { keptBeside, keptLabel, pathOf } from '../home/homeModel';
import { inkAge } from '../../utils/inkAge';
import { dayLabel } from './notebook/notebookStages';
import { whereYouStopped } from '../../pages/thinkNotesModel';

const DESK_LIMIT = 4;
const WHERE = { dimmed: 'Dimmed in', aside: 'Set aside in' };
const DAY = 24 * 60 * 60 * 1000;
const thisMonth = (value, now = new Date()) => {
  const at = new Date(value || 0);
  return at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth();
};
const aYearAgo = (value, now = Date.now()) => {
  const at = new Date(value || NaN);
  at.setFullYear(at.getFullYear() + 1);
  return Math.abs(now - at) <= 3 * DAY;
};

const DeskList = ({ title, items, view, onOpen, onView, sank = 0, detail = item => dayLabel(item.updatedAt) }) => items.length || sank ? (
  <section aria-label={title}>
    <h2>{title}</h2>
    <ul>
      {items.slice(0, DESK_LIMIT).map(item => {
        const metadata = detail(item);
        return (
          <li key={item.id} data-ink={inkAge(item.updatedAt)}>
            <button type="button" className="think-desk__row" onClick={() => onOpen(item)}>{item.title}</button>
            {metadata ? <small>{metadata}</small> : null}
          </li>
        );
      })}
    </ul>
    {items.length > DESK_LIMIT || sank ? (
      <button type="button" className="think-desk__more" onClick={() => onView(view)}>{sank ? `${sank} more sank underneath. See all` : 'See all'}</button>
    ) : null}
  </section>
) : null;

/* The desk opens on your own unfinished paragraph, ending where you stopped,
   and the line below it is where the next sentence goes. */
const WhereYouStopped = ({ lead, onOpen }) => {
  const { before, last } = whereYouStopped(lead.lastLine);
  const resumes = Boolean(last || lead.nextTimeLine);
  return <>
    <p className="think-desk__label">Where you stopped{lead.updatedAt ? `, ${dayLabel(lead.updatedAt)}` : ''}</p>
    <h2>{lead.title}</h2>
    {last ? <p className="think-desk__written">{before ? <>{before} </> : null}<span>{last}</span></p> : null}
    {lead.nextTimeLine ? <div className="think-desk__next"><span className="think-desk__label">You left yourself a note</span><p>{lead.nextTimeLine}</p></div> : null}
    <button type="button" className="think-desk__resume" data-line={resumes || undefined} onClick={() => onOpen(lead, { write: resumes })}>{resumes ? 'Write the next sentence' : 'Open draft'}</button>
  </>;
};

const ThinkDesk = ({ working, ideas, closed, questions = [], onOpen, onView, onStart, creating, children }) => {
  const [thought, setThought] = useState('');
  const [cutting, setCutting] = useState(null);
  const [kept, setKept] = useState([]);
  const [bringing, setBringing] = useState(false);
  const lead = working.find(item => item.nextTimeLine) || working[0];
  const otherWork = working.filter(item => item !== lead);
  const yearAgo = [...working, ...ideas, ...closed].find(item => aYearAgo(item.createdAt));
  // Beside the paragraph you stopped in: what you kept that bears on it, or else the latest you kept.
  const beside = lead ? keptBeside(kept, `${lead.title} ${lead.lastLine || ''}`) : [];
  const margin = beside.length ? beside : kept.slice(-DESK_LIMIT).reverse();
  const closedLately = closed.filter(item => thisMonth(item.board?.movedAt || item.board?.archivedAt));
  // Ideas are for now: left alone they fade, and once faded they sink off the desk. Keeping one at work keeps it.
  const afloat = ideas.filter(item => inkAge(item.updatedAt) !== 'faded');
  const threadBeside = beside.find(held => held.kind === 'thread');
  // A kept thread joins the note: each passage quoted in, in order, with its source.
  const bringIn = async () => {
    setBringing(true);
    try {
      const { marks } = await readThread(threadBeside.threadId);
      for (const mark of marks) await quoteIntoNote(lead.id, mark.highlightId);
      onOpen(lead);
    } finally {
      setBringing(false);
    }
  };

  useEffect(() => {
    let live = true;
    getNotebookCuttings()
      .then(rows => { if (live && rows.length) setCutting(rows[Math.floor(Date.now() / DAY) % rows.length]); })
      .catch(() => {});
    readKept().then(found => { if (live) setKept(found); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const start = async (event) => {
    event.preventDefault();
    const title = thought.trim();
    if (title && await onStart(title)) setThought('');
  };

  return (
    <section className="think-desk" aria-labelledby="think-desk-title">
      <header className="think-desk__head">
        <div><p className="think-desk__label">Your notebook</p><h1 id="think-desk-title">Think</h1></div>
        <form className="think-desk__start" onSubmit={start}>
          <label className="sr-only" htmlFor="think-desk-thought">New idea</label>
          <input id="think-desk-thought" value={thought} maxLength={200} placeholder="New idea" disabled={creating} onChange={event => setThought(event.target.value)} />
          <button type="submit" disabled={!thought.trim() || creating}>Keep</button>
        </form>
      </header>
      <div className="think-desk__spread">
        <section className="think-desk__lead" aria-label={lead ? 'Continue writing' : undefined}>
          {lead ? <WhereYouStopped lead={lead} onOpen={onOpen} /> : <>
            <h2>Nothing is underway.</h2>
            <p>Open an idea and choose Working to keep it on your desk.</p>
          </>}
        </section>
        {margin.length ? (
          <section className="think-desk__kept" aria-labelledby="think-desk-kept">
            <h2 id="think-desk-kept">{beside.length ? 'Kept, for this paragraph' : 'Kept'}</h2>
            <ul>
              {margin.map(held => (
                <li key={held.highlightId || held.threadId || held.articleId}>
                  <Link className="think-desk__row" to={pathOf(held)}>{keptLabel(held)}</Link>
                </li>
              ))}
            </ul>
            {threadBeside ? (
              <button type="button" className="think-desk__bring" disabled={bringing} onClick={bringIn}>
                {bringing ? 'Bringing it in…' : <>Bring in the thread “{threadBeside.title}”?</>}
              </button>
            ) : null}
            {beside.length ? <Outside about={lead.title}>from the world</Outside> : null}
            <Link className="think-desk__more" to="/">Everything you keep <span aria-hidden="true">↗</span></Link>
          </section>
        ) : null}
      </div>
      {children}
      <div className="think-desk__overview">
        <DeskList title="Working" items={otherWork} view="working" onOpen={onOpen} onView={onView} />
        <DeskList title="Open questions" items={questions} view="questions" onOpen={onOpen} onView={onView} />
        <DeskList title="Closed this month" items={closedLately} view="closed" onOpen={onOpen} onView={onView} detail={item => item.board?.became} />
        <DeskList title="Ideas" items={afloat} sank={ideas.length - afloat.length} view="ideas" onOpen={onOpen} onView={onView} />
      </div>
      {yearAgo || cutting ? (
        <div className="think-desk__lately">
          {yearAgo ? <p>A year ago this week you started <button type="button" onClick={() => onOpen(yearAgo)}>{yearAgo.title}</button>.</p> : null}
          {cutting ? <section aria-labelledby="think-desk-cutting">
            <h2 id="think-desk-cutting">A cutting you could use</h2>
            <blockquote>{cutting.text}</blockquote>
            <p>{WHERE[cutting.kind]} <button type="button" onClick={() => onOpen({ kind: 'note', id: cutting.noteId })}>{cutting.noteTitle}</button></p>
          </section> : null}
        </div>
      ) : null}
    </section>
  );
};

export default ThinkDesk;
