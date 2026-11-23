import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNotebookCuttings } from '../../api/notebook';
import { getLibraryCollection } from '../../api/libraryCollection';
import { buildCanonicalArticlePath } from '../../utils/sourceRoutes';
import { sourceTitle } from '../../utils/sourceDisplayText';
import { inkAge } from '../../utils/inkAge';
import { sourceLabel } from '../library/libraryColumnModel';
import { dayLabel } from './notebook/notebookStages';

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

const DeskList = ({ title, items, view, onOpen, onView, detail = item => dayLabel(item.updatedAt) }) => items.length ? (
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
    {items.length > DESK_LIMIT ? <button type="button" className="think-desk__more" onClick={() => onView(view)}>See all</button> : null}
  </section>
) : null;

const ThinkDesk = ({ working, ideas, closed, questions = [], onOpen, onView, onStart, creating, children }) => {
  const [thought, setThought] = useState('');
  const [cutting, setCutting] = useState(null);
  const [evergreen, setEvergreen] = useState([]);
  const lead = working.find(item => item.nextTimeLine) || working[0];
  const otherWork = working.filter(item => item !== lead);
  const yearAgo = [...working, ...ideas, ...closed].find(item => aYearAgo(item.createdAt));
  const closedLately = closed.filter(item => thisMonth(item.board?.movedAt || item.board?.archivedAt));

  useEffect(() => {
    let live = true;
    getNotebookCuttings()
      .then(rows => { if (live && rows.length) setCutting(rows[Math.floor(Date.now() / DAY) % rows.length]); })
      .catch(() => {});
    getLibraryCollection({ scope: 'kept', limit: DESK_LIMIT })
      .then(({ items }) => { if (live) setEvergreen(items.filter(item => item._id)); })
      .catch(() => {});
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
          {lead ? <>
            <p className="think-desk__label">Continue writing</p>
            <h2>{lead.title}</h2>
            {lead.nextTimeLine ? <div className="think-desk__next"><span className="think-desk__label">Next time</span><p>{lead.nextTimeLine}</p></div> : null}
            <button type="button" className="think-desk__resume" onClick={() => onOpen(lead, { write: Boolean(lead.nextTimeLine) })}>{lead.nextTimeLine ? 'Write the next sentence' : 'Open draft'}</button>
          </> : <>
            <h2>Nothing is underway.</h2>
            <p>Open an idea and choose Working to keep it on your desk.</p>
          </>}
        </section>
        {evergreen.length ? (
          <section className="think-desk__evergreen" aria-labelledby="think-desk-evergreen">
            <h2 id="think-desk-evergreen">Evergreen</h2>
            <ul>
              {evergreen.map(item => (
                <li key={item._id}>
                  <Link className="think-desk__row" to={buildCanonicalArticlePath(item._id)}>{sourceTitle(item)}</Link>
                  {sourceLabel(item) ? <small>{sourceLabel(item)}</small> : null}
                </li>
              ))}
            </ul>
            <Link className="think-desk__more" to="/library?scope=kept">Browse keepers <span aria-hidden="true">↗</span></Link>
          </section>
        ) : null}
      </div>
      {children}
      <div className="think-desk__overview">
        <DeskList title="Working" items={otherWork} view="working" onOpen={onOpen} onView={onView} />
        <DeskList title="Open questions" items={questions} view="questions" onOpen={onOpen} onView={onView} />
        <DeskList title="Closed this month" items={closedLately} view="closed" onOpen={onOpen} onView={onView} detail={item => item.board?.became} />
        <DeskList title="Ideas" items={ideas} view="ideas" onOpen={onOpen} onView={onView} />
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
