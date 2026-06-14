import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicWikiPage } from '../api/wiki';
import renderTiptapDoc, { extractTocItems, firstParagraphText } from '../components/wiki/renderTiptapDoc';
import { countWikiClaims, countWikiPageWords, countWikiSources } from '../components/wiki/wikiPageMetrics';
import { buildSharePreviewReceipt } from '../utils/connectionMagicMoment';

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (_error) {
    return '';
  }
};

const useDocumentTitle = (title) => {
  useEffect(() => {
    if (!title) return undefined;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
};

const SharedWikiPage = () => {
  const { idOrSlug = '' } = useParams();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPage(null);
    getPublicWikiPage(idOrSlug)
      .then((payload) => {
        if (cancelled) return;
        setPage(payload?.page || null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.status === 404
          ? 'This wiki page is private, archived, or no longer exists.'
          : err?.response?.data?.error || 'Failed to load shared wiki page.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idOrSlug]);

  const tocItems = useMemo(() => extractTocItems(page?.body), [page?.body]);
  const intro = useMemo(() => firstParagraphText(page?.body), [page?.body]);
  const wordCount = countWikiPageWords(page || {});
  const sourceCount = countWikiSources(page || {});
  const claimCount = countWikiClaims(page || {});
  const updatedAt = formatDate(page?.updatedAt);
  useDocumentTitle(page?.title ? `${page.title} · Noeis` : 'Shared wiki · Noeis');

  return (
    <main className="shared-wiki-page">
      <nav className="shared-wiki-page__topbar" aria-label="Shared wiki navigation">
        <Link to="/" className="shared-wiki-page__brand">Noeis</Link>
        <Link to="/" className="shared-wiki-page__home">Open Noeis</Link>
      </nav>

      {loading ? (
        <section className="shared-wiki-page__state" role="status">Loading shared wiki page...</section>
      ) : error ? (
        <section className="shared-wiki-page__state">
          <h1>Shared page unavailable</h1>
          <p>{error}</p>
        </section>
      ) : page ? (
        <article className="shared-wiki-page__article">
          <header className="shared-wiki-page__hero">
            <p className="shared-wiki-page__eyebrow">Shared wiki</p>
            <h1>{page.title || 'Untitled wiki page'}</h1>
            <p className="shared-wiki-page__receipt" role="status">
              {buildSharePreviewReceipt()}
            </p>
            {intro ? <p className="shared-wiki-page__intro">{intro}</p> : null}
            <div className="shared-wiki-page__metrics" aria-label="Wiki page metrics">
              <span>{wordCount} words</span>
              <span>{sourceCount} sources</span>
              <span>{claimCount} claims</span>
              {updatedAt ? <span>Updated {updatedAt}</span> : null}
            </div>
          </header>

          <div className="shared-wiki-page__layout">
            {tocItems.length > 0 ? (
              <aside className="shared-wiki-page__toc" aria-label="Contents">
                <span>Contents</span>
                {tocItems.map(item => (
                  <a key={item.id} href={`#${item.id}`} className={`is-level-${item.level}`}>
                    {item.title}
                  </a>
                ))}
              </aside>
            ) : null}

            <div className="shared-wiki-page__body wiki-read">
              {renderTiptapDoc(page.body, { tocItems })}
            </div>
          </div>

          {Array.isArray(page.sourceRefs) && page.sourceRefs.length > 0 ? (
            <section className="shared-wiki-page__sources" aria-label="Sources">
              <h2>Sources</h2>
              <ol>
                {page.sourceRefs.slice(0, 24).map((source, index) => (
                  <li key={source._id || source.id || index}>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        {source.title || source.url}
                      </a>
                    ) : (
                      <span>{source.title || source.type || 'Source'}</span>
                    )}
                    {source.snippet ? <p>{source.snippet}</p> : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </article>
      ) : null}
    </main>
  );
};

export default SharedWikiPage;
