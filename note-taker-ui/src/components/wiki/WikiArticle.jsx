import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { askWikiPage, createWikiPage, getWikiPage, updateWikiPage } from '../../api/wiki';
import renderTiptapDoc from './renderTiptapDoc';
import ClaimCitationPopover from './ClaimCitationPopover';
import { SUPPORT_STATES } from './extensions/Claim';
import { carryTensionToJudgment, isTension, tensionSeed } from './carryTension';
import { useAgentRailSurface } from '../../agent/AgentRailContext';
import { takeFirstPaint } from '../../motion/columnMotion';
import { docText, oneSentence } from '../../pages/judgmentModel';
import { wikiPageEditPath, wikiPagePath } from '../../utils/wikiFeatureFlags';
import '../../styles/wiki-article.css';

// A wiki page, read as an article.
//
// The whole column is the article: title, dek, body. The operational chrome —
// the chat pane, the activity rail, the split judgment panel — is not here.
// What the agent drafted overnight is a line in the rail, not a banner across
// the reading, and it only reaches the page when the human accepts it.

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const parseIndexAttribute = (value = '') => String(value || '')
  .split(',')
  .map(token => Number(token.trim()))
  .filter(Number.isFinite);

/* The sources behind one citation, in the order the page numbers them. The
   ledger knows which sources a claim actually rests on; when it does not, the
   marker's own indexes are the fallback, because a citation that cannot say
   what it points at is the thing we are fixing. */
const sourcesForClaim = (page, active) => {
  const refs = Array.isArray(page?.sourceRefs) ? page.sourceRefs : [];
  if (!active || !refs.length) return [];
  const contradicting = new Set(active.contradictionIndexes || []);
  const pick = (index, evidenceRole) => {
    const source = refs[index - 1];
    return source ? { ...source, citationIndex: index, evidenceRole } : null;
  };
  return [
    ...(active.citationIndexes || []).filter(index => !contradicting.has(index)).map(index => pick(index, 'supports')),
    ...(active.contradictionIndexes || []).map(index => pick(index, 'contradicts'))
  ].filter(Boolean);
};

const WikiArticle = () => {
  const { id: routeId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const pageId = routeId || searchParams.get('page') || '';
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settled, setSettled] = useState('');
  /* Which citation the reader opened. Evidence that cannot be reached is only
     asserted, and this page's whole claim is that it is grounded. */
  const [activeClaim, setActiveClaim] = useState(null);
  const [carrying, setCarrying] = useState(false);
  const [carryError, setCarryError] = useState('');
  const navigate = useNavigate();
  const arriving = useMemo(() => takeFirstPaint(`wiki-article:${pageId}`), [pageId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const loaded = await getWikiPage(pageId);
        if (!cancelled) setPage(loaded);
      } catch (loadError) {
        if (!cancelled) setError(loadError?.response?.data?.error || 'Could not open this page.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pageId]);

  const title = clean(page?.title);
  const dek = clean(page?.summary || page?.description);

  /* An accepted edit appends a sentence to the page and marks it so the column
     can crossfade the line that changed, rather than re-animating the article. */
  const acceptEdit = useCallback(async (proposal) => {
    if (!page?._id) return;
    const body = page.body && typeof page.body === 'object' ? page.body : { type: 'doc', content: [] };
    const next = {
      ...body,
      content: [
        ...(Array.isArray(body.content) ? body.content : []),
        { type: 'paragraph', content: [{ type: 'text', text: proposal.body }] }
      ]
    };
    const saved = await updateWikiPage(page._id, { body: next });
    setPage(saved);
    setSettled(proposal.body);
    window.setTimeout(() => setSettled(''), 900);
  }, [page]);

  useAgentRailSurface(
    {
      id: `wiki-article:${pageId}`,
      subject: title,
      // The overnight draft is a line the rail offers, not a banner the page wears.
      lines: page?.aiState?.draftStatus === 'ready'
        ? [{ id: 'overnight-draft', text: 'Overnight, the agent drafted a tighter version of this article.' }]
        : [],
      empty: 'Nothing to retrieve until you ask.'
    },
    {
      onAsk: async (question) => {
        const answered = await askWikiPage(pageId, question);
        const discussions = Array.isArray(answered?.discussions) ? answered.discussions : [];
        const sentence = oneSentence(docText(discussions[discussions.length - 1]?.answer));
        if (!sentence) return null;
        return {
          id: `wiki-ask:${discussions.length}:${sentence.slice(0, 24)}`,
          sentence,
          body: sentence,
          origin: 'Asked of this article',
          fields: ['edit']
        };
      },
      onAccept: acceptEdit
    }
  );

  const activeClaimRecord = useMemo(
    () => (page?.claims || []).find(claim => claim.claimId === activeClaim?.claimId) || null,
    [page, activeClaim]
  );
  const activeSources = useMemo(() => sourcesForClaim(page, activeClaim), [page, activeClaim]);

  /* A tension carried out of the article: the claim becomes a judgment, and the
     sources on both sides of it arrive as the first lines of Why and Against.
     Nothing is invented on the way — each line is what a source already said. */
  const carryTension = useCallback(async () => {
    if (carrying) return;
    const seed = tensionSeed({
      claim: activeClaimRecord,
      sources: activeSources,
      fallbackSentence: title
    });
    if (!seed) return;
    setCarrying(true);
    setCarryError('');
    try {
      const judgmentId = await carryTensionToJudgment(seed, {
        createPage: createWikiPage,
        updatePage: updateWikiPage
      });
      setActiveClaim(null);
      navigate(`/judgment/${judgmentId}`);
    } catch (failure) {
      setCarryError(failure?.message || 'This could not be carried into a judgment.');
    } finally {
      setCarrying(false);
    }
  }, [activeClaimRecord, activeSources, carrying, navigate, title]);

  const step = (n) => (arriving ? `wfp-anim wfp-anim--${n}` : 'wiki-article__return');

  if (loading) {
    return (
      <main className="wiki-article" aria-busy="true">
        <p className="wiki-article__quiet" role="status">Opening the page…</p>
      </main>
    );
  }

  if (!page) {
    return (
      <main className="wiki-article">
        <Link className="wiki-article__back" to="/wiki">← Morning paper</Link>
        <p className="wiki-article__quiet">{error || 'That page is not here.'}</p>
      </main>
    );
  }

  return (
    <main className="wiki-article" aria-labelledby="wiki-article-title">
      <div className={`wiki-article__meta ${step(1)}`}>
        <Link className="wiki-article__back" to="/wiki">← Morning paper</Link>
        <span className="wiki-article__rights">
          {page.visibility === 'public' ? 'Public' : 'Private'}
          <span aria-hidden="true"> · </span>
          <Link to={wikiPageEditPath(page._id)}>Edit</Link>
          <span aria-hidden="true"> · </span>
          {/* The way in to everything the reader deliberately leaves out:
              sources, claims, review state, discussions, and the agent that
              drafts and lints. Reading is the default; maintaining is a click. */}
          <Link to={wikiPagePath(page._id)}>Workspace</Link>
        </span>
      </div>

      <h1 className={`wiki-article__title ${step(2)}`} id="wiki-article-title">{title}</h1>
      {dek ? <p className={`wiki-article__dek ${step(2)}`}>{dek}</p> : null}

      <p className={`wiki-article__custody ${step(3)}`}>
        Maintained by the agent<span aria-hidden="true"> · </span>you accept edits
      </p>

      {/* A citation opens what it points at: the source, the passage, and the
          way to the original. It used to be a button with an aria-label and no
          handler — labelled "Backlink to source 1" and bound to nothing. */}
      <div
        className={`wiki-article__body ${step(4)}`}
        onClick={(event) => {
          const marker = event.target.closest?.('.wiki-claim-citation');
          if (!marker) return;
          event.preventDefault();
          const support = marker.getAttribute('data-support') || 'supported';
          setActiveClaim({
            claimId: marker.getAttribute('data-claim-id') || '',
            support: SUPPORT_STATES.has(support) ? support : 'supported',
            citationIndexes: parseIndexAttribute(marker.getAttribute('data-citation-indexes')),
            contradictionIndexes: parseIndexAttribute(marker.getAttribute('data-contradiction-indexes')),
            anchorRect: marker.getBoundingClientRect()
          });
        }}
      >
        {renderTiptapDoc(page.body)}
      </div>

      {/* The sentence the human just accepted is the only thing that moves. */}
      {settled ? (
        <p className="wiki-article__settled" role="status">Added: {settled}</p>
      ) : null}

      {error ? <p className="wiki-article__error" role="alert">{error}</p> : null}

      {activeClaim ? (
        <ClaimCitationPopover
          anchorRect={activeClaim.anchorRect}
          support={activeClaim.support}
          claim={activeClaimRecord}
          sources={activeSources}
          onClose={() => setActiveClaim(null)}
          onCarry={isTension(activeSources) ? carryTension : null}
          carrying={carrying}
          carryError={carryError}
        />
      ) : null}
    </main>
  );
};

export default WikiArticle;
