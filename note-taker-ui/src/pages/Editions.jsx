import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getEdition, listEditions } from '../api/editions';
import EditionInbox from '../components/editions/EditionInbox';
import EditionPowerThrough from '../components/editions/EditionPowerThrough';
import EditionReading from '../components/editions/EditionReading';
import EditionPanel from '../components/editions/EditionPanel';
import { readEditionLocal } from '../components/editions/editionReadingState';
import { byPaper, datelineLine, issueLine } from './editionModel';
import '../styles/edition-reading.css';

export default function Editions() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [editions, setEditions] = useState(null);
  const [error, setError] = useState('');
  const [utility, setUtility] = useState(null);
  const [focus, setFocus] = useState(false);
  const [remembered] = useState(() => readEditionLocal('last', 'place'));
  const requested = id || params.get('issue');
  const selectedId = requested || null;
  const power = params.get('power') === '1';
  useEffect(() => {
    let active = true;
    listEditions({ limit: 500 })
      .then(async (rows) => {
        if (requested && !rows.some((row) => row._id === requested))
          rows = [...rows, await getEdition(requested)];
        if (active) setEditions(rows);
      })
      .catch(() => {
        if (active) setError('Your papers did not open. Please try again.');
      });
    return () => {
      active = false;
    };
  }, [requested]);
  const papers = useMemo(() => byPaper(editions || []), [editions]);
  const paper =
    papers.find((p) => p.issues.some((issue) => issue._id === selectedId)) ||
    papers.find((p) => p.profile === params.get('paper')) ||
    papers.find((p) => p.profile === remembered?.profile) ||
    papers[0];
  const issue = paper?.issues.find((row) => row._id === selectedId) || paper?.issues[paper.current];
  const choose = (issueId) => {
    setUtility(null);
    navigate(`/editions/${encodeURIComponent(issueId)}`);
  };
  const openUtility = (kind, event) => setUtility({ kind, origin: event.currentTarget });
  const closePower = useCallback(() => navigate('/editions'), [navigate]);

  useEffect(() => {
    if (power) return undefined;
    const openPower = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key.toLowerCase() !== 'o') return;
      event.preventDefault();
      navigate('/editions?power=1');
    };
    document.addEventListener('keydown', openPower);
    return () => document.removeEventListener('keydown', openPower);
  }, [navigate, power]);

  if (power) {
    return (
      <div className="edition-reading edition-reading--power" data-testid="editions-stand">
        <EditionPowerThrough onClose={closePower} />
      </div>
    );
  }

  return (
    <div className={`edition-reading${focus ? ' is-focused' : ''}`} data-testid="editions-stand">
      <div className="edition-utilities" aria-label="Editions utilities">
        <label className="edition-publication">
          {' '}
          <span className="sr-only">Publication</span>
          <select
            aria-label="Publication"
            value={paper?.profile || ''}
            onChange={(event) => {
              const next = papers.find((p) => p.profile === event.target.value);
              if (next) choose(next.issues[next.current]._id);
            }}
          >
            {!papers.length ? <option value="">Editions</option> : null}
            {papers.map((p) => (
              <option value={p.profile} key={p.profile}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Editions utilities">
          <button onClick={() => navigate('/editions?power=1')}>Power through</button>
          <button onClick={(event) => openUtility('arrivals', event)}>New arrivals</button>
          <Link to="/library?scope=later">Later</Link>
          <button onClick={(event) => openUtility('archive', event)}>Archive</button>
        </nav>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {!editions && !error ? <p role="status">Opening your papers…</p> : null}
      {editions?.length === 0 ? (
        <section className="editions__empty">
          <h1>No paper yet.</h1>
          <p>
            Ask an agent to keep one for you, from <Link to="/connections">Connections</Link>.
          </p>
        </section>
      ) : null}
      {paper ? (
        <>
          <header className="edition-nameplate">
            <h1>{paper.title}</h1>
          </header>
          <EditionReading
            key={issue._id}
            issue={issue}
            issues={paper.issues}
            onChoose={choose}
            focusItem={params.get('item') || ''}
            focus={focus}
            onFocus={setFocus}
            utilityOpen={Boolean(utility)}
            onInspect={() => setUtility(null)}
          />
        </>
      ) : null}
      {/* A direct issue can be older than the bounded stand listing. */}
      {editions && !paper && id ? (
        <EditionReading
          key={id}
          issue={{ _id: id }}
          issues={[]}
          onChoose={choose}
          focusItem={params.get('item') || ''}
          focus={focus}
          onFocus={setFocus}
          utilityOpen={Boolean(utility)}
          onInspect={() => setUtility(null)}
        />
      ) : null}
      {utility ? (
        <EditionPanel
          title={utility.kind === 'arrivals' ? 'New arrivals' : 'The archive'}
          origin={utility.origin}
          onClose={() => setUtility(null)}
        >
          {utility.kind === 'arrivals' ? (
            <EditionInbox />
          ) : (
            papers.map((p) => (
              <section key={p.profile} className="edition-archive">
                <h3>{p.title}</h3>
                <ul>
                  {[...p.issues].reverse().map((row) => (
                    <li key={row._id}>
                      <button onClick={() => choose(row._id)}>
                        {[issueLine(row), datelineLine(row)].filter(Boolean).join(' · ') ||
                          row.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </EditionPanel>
      ) : null}
    </div>
  );
}
