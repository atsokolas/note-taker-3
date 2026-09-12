import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getEdition, listEditions } from '../api/editions';
import EditionInbox from '../components/editions/EditionInbox';
import EditionShare from '../components/editions/EditionShare';
import {
  EditionSourcesJump,
  EditionSourcesList,
  useEditionSources
} from '../components/editions/EditionSources';
import {
  bylineFor, byPaper, closesLine, datelineLine, editionColumnStyle, folioLine,
  gapLine, issueLine, runLine, standLayout, stateOf, takenLine
} from './editionModel';

/**
 * The newsstand.
 *
 * Papers your agents maintain for you. Noeis writes none of them — whichever
 * agent you already use files them — and this is where they land so they are
 * something you read on a Sunday rather than something that scrolled past in
 * a chat window and was gone.
 *
 * Set as a broadsheet because the shape of the paper is the shape the agent
 * configured: one column per named section. An empty named column keeps its
 * head. No columns configured is silence — not evidence, counter-evidence, or
 * any other invented set. Headlines carry the front page; a story unfolds
 * where it stands rather than taking you somewhere else, because reading the
 * stand and reading a finding are the same act.
 */

/* A paper still being written checks itself while you are reading it. Slow
   enough to be a newsstand rather than a ticker. */
const REFRESH_MS = 60000;
const ARRIVAL_MS = 6000;

/* An issue with no number of its own is named by its window instead. */
const issueName = (edition) => issueLine(edition) || datelineLine(edition) || 'Issue';

/* A story: the headline, and the finding folded underneath it. */
const Story = ({ item }) => {
  const [open, setOpen] = useState(false);
  const source = [item.sourceLabel, item.sourceDate].filter(Boolean).join(' · ');
  return (
    <article className={`story${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="story__head"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <h4 className="story__title">{item.title}</h4>
        {source ? <span className="story__source">{source}</span> : null}
      </button>
      <div className="story__body">
        <div>
          <p className="story__finding">{item.finding}</p>
          {/* The required half. An item that could not say this was refused. */}
          <p className="story__boundary">
            <i>What would limit it</i>
            {item.boundary}
          </p>
          {item.note ? <p className="story__note">{item.note}</p> : null}
          <p className="story__doors">
            {item.savedArticleId ? (
              <Link to={`/articles/${item.savedArticleId}`}>In your library →</Link>
            ) : (
              <a href={item.url} target="_blank" rel="noopener noreferrer">Read the source →</a>
            )}
          </p>
        </div>
      </div>
    </article>
  );
};

/* A column: one section of the paper, with the byline of whoever filed it. */
const Column = ({ section, tense }) => {
  const byline = bylineFor(section.items);
  return (
    <section className="column">
      <h3 className="column__head noeis-caps">{section.label}</h3>
      {/* Two agents can keep one paper, so a section is entitled to its own
          byline rather than inheriting whichever wrote the issue last. */}
      {byline ? <p className="column__byline">{byline}</p> : null}
      {section.items.length ? (
        section.items.map(item => (
          <Story key={item.itemId} item={item} />
        ))
      ) : (
        /* Printed, not dropped. A named column nobody filled is saying
           something; hiding it is what a newsletter does. */
        <p className="column__empty">{tense === 'closed' ? 'Nothing that week.' : 'Nothing yet.'}</p>
      )}
    </section>
  );
};

/* One paper, showing one of its issues, with the run underneath. */
const FrontPage = ({ paper, children = null }) => {
  const [index, setIndex] = useState(paper.current);
  const [full, setFull] = useState({});
  const [turning, setTurning] = useState(false);
  const [arrival, setArrival] = useState('');
  const cache = useRef({});

  const issue = paper.issues[index];
  const opened = full[issue._id] || null;
  const tense = stateOf(issue);
  const promise = runLine(paper.issues);

  useEffect(() => {
    let cancelled = false;
    const id = issue._id;
    const open = () => getEdition(id)
      .then((found) => {
        if (cancelled || !found) return;
        const before = cache.current[id];
        cache.current[id] = found;
        setFull(held => ({ ...held, [id]: found }));
        /* Something arrived while the reader was standing here. */
        if (before && found.items?.length > (before.items?.length || 0)) {
          setArrival(found.writtenBy || '');
          window.setTimeout(() => setArrival(''), ARRIVAL_MS);
        }
      })
      .catch(() => { /* the masthead still stands; the columns simply wait */ });

    if (!cache.current[id]) open();

    /* Only the issue being written, and only while the reader can see it. */
    if (tense !== 'filling') return () => { cancelled = true; };
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') open();
    }, REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(tick); };
  }, [issue._id, tense]);

  /* Turning to another issue: the page lifts, the next one settles in. The
     nameplate never moves — it is the same paper. */
  const turn = useCallback((next) => {
    if (next === index) return;
    setTurning(true);
    window.setTimeout(() => {
      setIndex(next);
      setTurning(false);
    }, 200);
  }, [index]);

  const layout = standLayout(opened);
  const { columns, looseItems } = layout;
  const { sources, listId, listRef, jump } = useEditionSources(opened);

  return (
    <section className="front" aria-label={paper.title}>
      <header>
        <div className="nameplate">
          <p className="ear ear--left">
            {issue.writtenBy ? <>Kept by <b>{issue.writtenBy}</b>. </> : null}
            {promise || (paper.issues.length === 1 ? 'The first one.' : '')}
          </p>
          <h2 className="nameplate__title">{paper.title}</h2>
          <p className="ear ear--right">{takenLine(issue)}</p>
        </div>
        <p className="dateline noeis-caps">
          <span>{issueLine(issue)}</span>
          <span>{datelineLine(issue)}</span>
          <span className={tense === 'filling' ? 'is-live' : 'is-quiet'}>
            {tense === 'filling' ? `Filling · ${closesLine(issue).toLowerCase()}` : closesLine(issue)}
          </span>
        </p>
        <div className="front__actions">
          <EditionShare key={issue._id} editionId={issue._id} edition={opened} />
          {sources.length ? <EditionSourcesJump listId={listId} onJump={jump} /> : null}
        </div>
      </header>

      {children}

      {arrival ? (
        <p className="front__arrival" role="status">{arrival} filed one just now.</p>
      ) : null}

      <div className={`issue${turning ? ' is-turning' : ''}`}>
        {issue.standfirst ? <p className="standfirst">{issue.standfirst}</p> : null}

        {!layout.ready ? (
          <p className="editions__quiet" role="status">Setting the page…</p>
        ) : columns.length ? (
          <div
            className="columns"
            data-testid="edition-columns"
            data-columns={columns.length}
            style={editionColumnStyle(columns.length)}
          >
            {columns.map(section => (
              <Column
                key={section.key || section.label}
                section={section}
                tense={tense}
              />
            ))}
          </div>
        ) : looseItems.length ? (
          <div className="issue__loose" data-testid="edition-loose">
            {looseItems.map(item => (
              <Story key={item.itemId} item={item} />
            ))}
          </div>
        ) : (
          <p className="editions__quiet" data-testid="edition-columns-silence">
            No columns set.
          </p>
        )}

        {opened?.watchNext?.length ? (
          <aside className="watch">
            <p className="watch__head noeis-caps">What to watch next</p>
            <ul>{opened.watchNext.map(line => <li key={line}>{line}</li>)}</ul>
          </aside>
        ) : null}
      </div>

      <nav className="run" aria-label={`${paper.title}: back issues`}>
        <span className="run__label">The run</span>
        {paper.issues.map((row, i) => (
          <button
            key={row._id}
            type="button"
            className={`run__issue${i === index ? ' is-current' : ''}`}
            aria-current={i === index ? 'true' : 'false'}
            onClick={() => turn(i)}
          >
            {issueName(row)}
          </button>
        ))}
        <Link className="run__whole" to={`/editions/${issue._id}`}>Read the whole issue →</Link>
      </nav>

      {tense === 'closed' && gapLine(issue) ? <p className="front__gap">{gapLine(issue)}</p> : null}

      {sources.length ? (
        <EditionSourcesList sources={sources} listId={listId} listRef={listRef} />
      ) : null}
    </section>
  );
};

const Editions = () => {
  const [editions, setEditions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listEditions()
      .then((found) => { if (!cancelled) setEditions(found); })
      .catch((loadError) => {
        if (cancelled) return;
        setEditions([]);
        setError(loadError?.response?.data?.error || 'The newsstand did not answer.');
      });
    return () => { cancelled = true; };
  }, []);

  const papers = useMemo(() => byPaper(editions || []), [editions]);
  const inbox = editions?.length ? <EditionInbox /> : null;

  return (
    <div className="editions" data-testid="editions-stand">
      <header className="folio">
        <span>Editions · <em>{folioLine()}</em></span>
      </header>

      {error ? <p className="status-message error-message">{error}</p> : null}

      {/* Nothing on the stand yet is not the same as nothing loaded. */}
      {editions === null && !error ? (
        <p className="editions__quiet" role="status">Opening the stand…</p>
      ) : null}

      {editions?.length === 0 ? (
        <section className="editions__empty">
          <h2>No paper yet.</h2>
          <p>
            Ask an agent to keep one for you, from{' '}
            <Link to="/connections">Connections</Link>.
          </p>
        </section>
      ) : null}

      {papers.length
        ? papers.map((paper, index) => (
          <FrontPage key={paper.profile} paper={paper}>
            {index === 0 ? inbox : null}
          </FrontPage>
        ))
        : inbox}
    </div>
  );
};

export default Editions;
