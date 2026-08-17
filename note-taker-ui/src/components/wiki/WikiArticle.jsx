import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { askWikiPage, getWikiPage, updateWikiPage } from '../../api/wiki';
import renderTiptapDoc from './renderTiptapDoc';
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

const WikiArticle = () => {
  const { id: routeId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const pageId = routeId || searchParams.get('page') || '';
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settled, setSettled] = useState('');
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

      <div className={`wiki-article__body ${step(4)}`}>
        {renderTiptapDoc(page.body)}
      </div>

      {/* The sentence the human just accepted is the only thing that moves. */}
      {settled ? (
        <p className="wiki-article__settled" role="status">Added: {settled}</p>
      ) : null}

      {error ? <p className="wiki-article__error" role="alert">{error}</p> : null}
    </main>
  );
};

export default WikiArticle;
