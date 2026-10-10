import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getEdition, listEditions } from '../api/editions';
import EditionPowerThrough from '../components/editions/EditionPowerThrough';
import EditionReading from '../components/editions/EditionReading';
import EditionRun from '../components/editions/EditionRun';
import EditionStand from '../components/editions/EditionStand';
import EditionZoom from '../components/editions/EditionZoom';
import { readEditionLocal, readingPosition } from '../components/editions/editionReadingState';
import { byPaper, issueLine, newCountOf } from './editionModel';
import '../styles/edition-reading.css';

/* A path with only the parameters that say something. */
const at = (path, params = {}) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString();
  return query ? `${path}?${query}` : path;
};

/* Every paper you keep, fresh while you read: each visible minute, and on
   return to the tab. A direct link to an issue older than the stand still
   resolves. */
const useStand = (issueId) => {
  const [editions, setEditions] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const rows = await listEditions({ limit: 500 });
    return issueId && !rows.some(row => row._id === issueId) ? [...rows, await getEdition(issueId)] : rows;
  }, [issueId]);

  useEffect(() => {
    let active = true;
    const refresh = async ({ first = false } = {}) => {
      if (!first && document.visibilityState !== 'visible') return;
      try {
        const rows = await load();
        if (active) setEditions(rows);
      } catch (_error) {
        /* A failed refresh keeps the paper readable; only a first load says so. */
        if (active && first) setError('Your papers did not open. Please try again.');
      }
    };
    refresh({ first: true });
    const interval = window.setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  return { editions, error };
};

/**
 * Editions, as one continuous zoom.
 *
 *   Your papers  /editions                      every paper you keep
 *   A paper      /editions?paper=…              one paper's run
 *   An issue     /editions/:id                  an issue
 *   A finding    /editions/:id?item=…           one finding, on its own
 *   The source   /editions/:id?item=…&source=1  the source it rests on
 *
 * ?by= narrows an issue to one agent's hand; ?power=1 reads what is new, one
 * finding at a time. With one paper, the stand is that paper's run.
 */
export default function Editions() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { editions, error } = useStand(id);
  const papers = useMemo(() => byPaper(editions || []), [editions]);
  const [resume] = useState(() => readEditionLocal('last', 'place'));

  const item = params.get('item') || '';
  const by = params.get('by') || '';
  const scope = params.get('paper') || '';
  const powering = params.get('power') === '1';
  const paper = id
    ? papers.find(row => row.issues.some(issue => issue._id === id))
    : papers.find(row => row.profile === scope) || (papers.length === 1 && !powering ? papers[0] : null);
  const issue = id ? paper?.issues.find(row => row._id === id) || { _id: id } : null;
  const level = id ? (item ? (params.get('source') ? 0 : 1) : 2) : paper ? 3 : 4;
  const stand = papers.length > 1 ? '/editions' : null;

  const issuePath = id ? `/editions/${encodeURIComponent(id)}` : '';
  const paperPath = paper ? at('/editions', { paper: paper.profile }) : '/editions';
  const news = newCountOf(paper ? paper.issues : papers.flatMap(row => row.issues));
  const powerPath = news ? at('/editions', { power: '1', paper: paper?.profile, by }) : '';

  const rungs = [
    { label: 'Your papers', to: stand },
    { label: paper?.title || 'A paper', to: paper ? paperPath : null },
    { label: (id && issueLine({ ...issue, issueLabel: paper?.issueLabel })) || 'An issue', to: id ? at(issuePath, { by }) : null },
    { label: 'A finding', to: item ? at(issuePath, { item, by }) : null },
    { label: 'The source', to: null }
  ];

  /* Closer, from an issue, is the finding you are reading. */
  const intoReading = () => {
    const finding = readingPosition(document.querySelector('[data-testid="edition-read"]'));
    if (finding) navigate(at(issuePath, { item: finding.dataset.readingItem, by }));
  };
  const firstPaper = papers.find(row => newCountOf(row.issues)) || papers[0];
  const zoom = {
    4: { out: null, into: firstPaper ? at('/editions', { paper: firstPaper.profile }) : null },
    3: { out: stand, into: paper ? `/editions/${encodeURIComponent(paper.issues[paper.current]._id)}` : null },
    2: { out: paperPath, into: intoReading },
    1: { out: at(issuePath, { by }), into: at(issuePath, { item, by, source: '1' }) },
    0: { out: at(issuePath, { item, by }), into: null }
  }[level];

  if (powering) {
    const back = scope ? at('/editions', { paper: scope }) : '/editions';
    return (
      <div className="edition-reading edition-reading--power" data-testid="editions-stand">
        <EditionZoom rungs={[{ label: 'Your papers', to: '/editions' }, { label: 'Power through' }]} at={1} out={back} />
        <EditionPowerThrough
          key={`${scope}:${by}`}
          papers={papers}
          paper={scope}
          by={by}
          onScope={next => navigate(at('/editions', { power: '1', paper: scope, by, ...next }), { replace: true })}
          onClose={() => navigate(back)}
        />
      </div>
    );
  }

  return (
    <div className="edition-reading" data-testid="editions-stand">
      <EditionZoom rungs={rungs} at={4 - level} power={powerPath} {...zoom} />
      <div className="edition-reading__page">
        {error ? <p role="alert">{error}</p> : null}
        {!editions && !error ? <p role="status">Opening your papers…</p> : null}
        {level === 4 && editions?.length === 0 ? (
          <section className="editions__empty">
            <h1>No paper yet.</h1>
            <p>
              Ask an agent to keep one for you, from <Link to="/connections">Connections</Link>.
            </p>
          </section>
        ) : null}
        {level === 4 && papers.length ? <EditionStand papers={papers} resume={resume} /> : null}
        {level === 3 ? <EditionRun paper={paper} /> : null}
        {issue && editions ? (
          <EditionReading
            key={issue._id}
            issue={issue}
            paper={paper}
            focusItem={item}
            focusSection={params.get('section') || ''}
            source={level === 0}
            by={by}
            onItem={(itemId, extra, how) => navigate(at(issuePath, { item: itemId, by, ...extra }), how)}
            onBy={hand => navigate(at(issuePath, { item, by: hand }), { replace: true })}
          />
        ) : null}
      </div>
    </div>
  );
}
