import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getEdition, listEditions } from '../api/editions';
import EditionInbox from '../components/editions/EditionInbox';
import EditionPowerThrough from '../components/editions/EditionPowerThrough';
import EditionReading from '../components/editions/EditionReading';
import EditionPanel from '../components/editions/EditionPanel';
import EditionShelfNav, { useNarrowShelf } from '../components/editions/EditionShelfNav';
import { readEditionLocal, writeEditionLocal } from '../components/editions/editionReadingState';
import { byPaper, datelineLine, issueLine } from './editionModel';
import '../styles/edition-reading.css';

export default function Editions() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [editions, setEditions] = useState(null);
  const [error, setError] = useState('');
  const [utility, setUtility] = useState(null);
  const [browse, setBrowse] = useState(null);
  const [focus, setFocus] = useState(false);
  const [remembered] = useState(() => readEditionLocal('last', 'place'));
  const narrow = useNarrowShelf();
  const requested = id || params.get('issue');
  const selectedId = requested || null;
  const power = params.get('power') === '1';

  const readProfileIssue = useCallback((profile) => readEditionLocal(profile, 'issue'), []);

  useEffect(() => {
    let active = true;
    listEditions({ limit: 500 })
      .then(async (rows) => {
        if (requested && !rows.some((row) => row._id === requested)) {
          rows = [...rows, await getEdition(requested)];
        }
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

  const rememberIssue = useCallback((issueId, profile) => {
    if (profile) writeEditionLocal(profile, 'issue', { issueId });
  }, []);

  useEffect(() => {
    if (issue?._id && paper?.profile) rememberIssue(issue._id, paper.profile);
  }, [issue?._id, paper?.profile, rememberIssue]);

  const choose = useCallback((issueId, profile) => {
    setUtility(null);
    setBrowse(null);
    if (profile) rememberIssue(issueId, profile);
    navigate(`/editions/${encodeURIComponent(issueId)}`);
  }, [navigate, rememberIssue]);

  const openUtility = (kind, event) => {
    setBrowse(null);
    setUtility({ kind, origin: event.currentTarget });
  };

  const openBrowse = (event) => setBrowse({ origin: event.currentTarget });
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

  const shelfProps = {
    papers,
    paper,
    selectedIssueId: issue?._id || selectedId || '',
    readProfileIssue,
    onOpenArrivals: (event) => openUtility('arrivals', event),
    onOpenArchive: (event) => openUtility('archive', event),
    onNavigate: choose
  };

  return (
    <div className={`edition-reading${focus ? ' is-focused' : ''}`} data-testid="editions-stand">
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
      <div className="edition-layout">
        <EditionShelfNav {...shelfProps} />
        <div className="edition-paper">
          {paper && issue ? (
            <EditionReading
              key={issue._id}
              issue={issue}
              paperTitle={paper.title}
              issueLabel={paper.issueLabel}
              onChoose={choose}
              focusItem={params.get('item') || ''}
              focus={focus}
              onFocus={setFocus}
              utilityOpen={Boolean(utility) || Boolean(browse)}
              onInspect={() => {
                setUtility(null);
                setBrowse(null);
              }}
              showBrowse={narrow}
              onBrowse={openBrowse}
            />
          ) : null}
          {editions && !paper && id ? (
            <EditionReading
              key={id}
              issue={{ _id: id }}
              onChoose={choose}
              focusItem={params.get('item') || ''}
              focus={focus}
              onFocus={setFocus}
              utilityOpen={Boolean(utility) || Boolean(browse)}
              onInspect={() => {
                setUtility(null);
                setBrowse(null);
              }}
              showBrowse={narrow}
              onBrowse={openBrowse}
            />
          ) : null}
        </div>
      </div>
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
                      <button type="button" onClick={() => choose(row._id, p.profile)}>
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
      {browse ? (
        <EditionPanel
          title="Editions"
          origin={browse.origin}
          onClose={() => setBrowse(null)}
        >
          <EditionShelfNav {...shelfProps} inSheet className="edition-shelf--sheet" />
        </EditionPanel>
      ) : null}
    </div>
  );
}
