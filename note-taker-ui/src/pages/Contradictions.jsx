import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createWikiPage, listWikiContradictions, updateWikiPage } from '../api/wiki';
import { createJudgment } from './judgmentModel';
import { useAgentRailSurface } from '../agent/AgentRailContext';
import { takeFirstPaint } from '../motion/columnMotion';
import { wikiReadPath } from '../utils/wikiFeatureFlags';
import '../styles/contradictions.css';

// Where the library disagrees with itself.
//
// A contradiction used to be a colour on a citation and a heading inside one
// article — you had to already be reading the right page to find out that two
// things you read do not agree. That is a label, and a label is something you
// scroll past. Here the two passages are set against each other with their
// publications attached, which is the only form in which a disagreement is
// worth anything: you can read both and decide.
//
// Deciding is the exit. Every one of these carries into a judgment with the
// two sides already written into Why and Against.

const Side = ({ side, role }) => (
  <div className={`contradiction__side contradiction__side--${role}`}>
    {side.quote ? (
      <blockquote className="contradiction__quote">{side.quote}</blockquote>
    ) : (
      <p className="contradiction__quote contradiction__quote--absent">
        No passage was captured from this source.
      </p>
    )}
    <p className="contradiction__source">
      {side.url ? (
        <a href={side.url} target="_blank" rel="noreferrer">{side.title}</a>
      ) : side.title}
    </p>
  </div>
);

const Contradiction = ({ item, onDecide, deciding, error }) => (
  <article className="contradiction" aria-labelledby={`contradiction-${item.pageId}-${item.claimId}`}>
    <h2 className="contradiction__claim" id={`contradiction-${item.pageId}-${item.claimId}`}>
      {item.claimText}
    </h2>
    <p className="contradiction__where">
      <Link to={wikiReadPath(item.pageId)}>{item.pageTitle}</Link>
      {item.section ? <span> · {item.section}</span> : null}
    </p>

    <div className="contradiction__sides">
      <section aria-label="What supports it">
        <h3>Supports</h3>
        {item.supporting.length
          ? item.supporting.map(side => <Side key={`${side.title}:${side.quote}`} side={side} role="supports" />)
          : <p className="contradiction__quote contradiction__quote--absent">Nothing in your library supports this yet.</p>}
      </section>
      <section aria-label="What argues against it">
        <h3>Argues against</h3>
        {item.contradicting.map(side => <Side key={`${side.title}:${side.quote}`} side={side} role="contradicts" />)}
      </section>
    </div>

    <div className="contradiction__door">
      <button type="button" onClick={() => onDecide(item)} disabled={deciding}>
        {deciding ? 'Carrying it over…' : 'Decide this →'}
      </button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  </article>
);

const Contradictions = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [decidingId, setDecidingId] = useState('');
  const [decideError, setDecideError] = useState({});
  const navigate = useNavigate();
  const arriving = useMemo(() => takeFirstPaint('contradictions'), []);
  const step = (n) => (arriving ? `wfp-anim wfp-anim--${n}` : '');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await listWikiContradictions();
        if (!cancelled) setItems(found);
      } catch (loadError) {
        if (!cancelled) setError(loadError?.response?.data?.error || 'Could not read what disagrees.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useAgentRailSurface({
    id: 'contradictions',
    subject: 'Where your library disagrees with itself.',
    empty: 'Nothing to retrieve until you ask.'
  }, {});

  /* Both sides are already written; the judgment starts with them in it. */
  const decide = useCallback(async (item) => {
    const key = `${item.pageId}:${item.claimId}`;
    if (decidingId) return;
    setDecidingId(key);
    setDecideError(current => ({ ...current, [key]: '' }));
    try {
      const judgmentId = await createJudgment(item.claimText, {
        createPage: createWikiPage,
        updatePage: updateWikiPage
      });
      await updateWikiPage(judgmentId, {
        judgment: {
          currentJudgment: item.claimText,
          why: item.supporting.map(side => ({ text: side.quote || side.title, sourceLabel: side.title })),
          against: item.contradicting.map(side => ({ text: side.quote || side.title, sourceLabel: side.title }))
        }
      });
      navigate(`/judgment/${judgmentId}`);
    } catch (failure) {
      setDecideError(current => ({ ...current, [key]: failure?.message || 'This could not be carried into a judgment.' }));
    } finally {
      setDecidingId('');
    }
  }, [decidingId, navigate]);

  if (loading) {
    return (
      <main className="contradictions" aria-busy="true">
        <p className="contradictions__quiet" role="status">Reading what disagrees…</p>
      </main>
    );
  }

  return (
    <main className="contradictions" aria-labelledby="contradictions-title">
      <div className={`contradictions__head ${step(1)}`}>
        <Link className="contradictions__back" to="/wiki">← Wiki</Link>
        <h1 id="contradictions__title-h" className="contradictions__title">Where your reading disagrees</h1>
        <p className="contradictions__dek" id="contradictions-title">
          {items.length
            ? 'Two things you read, set against each other. Read both, then decide.'
            : 'Nothing in your library argues with itself yet.'}
        </p>
      </div>

      {error ? <p className="contradictions__error" role="alert">{error}</p> : null}

      <div className={step(2)}>
        {items.map(item => (
          <Contradiction
            key={`${item.pageId}:${item.claimId}`}
            item={item}
            onDecide={decide}
            deciding={decidingId === `${item.pageId}:${item.claimId}`}
            error={decideError[`${item.pageId}:${item.claimId}`]}
          />
        ))}
      </div>
    </main>
  );
};

export default Contradictions;
