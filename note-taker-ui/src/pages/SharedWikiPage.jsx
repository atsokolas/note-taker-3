import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { adoptPublicWikiPage, getPublicWikiPage } from '../api/wiki';
import renderTiptapDoc, { extractTocItems, firstParagraphText } from '../components/wiki/renderTiptapDoc';
import { countWikiClaims, countWikiPageWords, countWikiSources } from '../components/wiki/wikiPageMetrics';
import { wikiPagePath } from '../utils/wikiFeatureFlags';
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

const hasAuthToken = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem('token') || localStorage.getItem('authToken'));
};

const SharedWikiPage = () => {
  const { idOrSlug = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adopting, setAdopting] = useState(false);
  const [adoptionError, setAdoptionError] = useState('');
  const autoAdoptAttemptedRef = useRef(false);

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
  const shouldAutoAdopt = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return params.get('adopt') === '1';
  }, [location.search]);
  useDocumentTitle(page?.title ? `${page.title} · Noeis` : 'Shared wiki · Noeis');

  const handleAdopt = useCallback(async () => {
    if (!idOrSlug || adopting) return;
    setAdoptionError('');
    if (!hasAuthToken()) {
      try {
        const params = new URLSearchParams(location.search || '');
        params.set('adopt', '1');
        const returnTo = `${location.pathname}?${params.toString()}${location.hash || ''}`;
        sessionStorage.setItem('auth_return_to', returnTo);
        sessionStorage.setItem('auth_redirect_reason', 'auth');
      } catch (_error) {
        // Auth still works without preserving return state; the user can retry from the shared page.
      }
      navigate('/register');
      return;
    }
    setAdopting(true);
    try {
      const result = await adoptPublicWikiPage(idOrSlug);
      const adoptedPage = result?.page || {};
      const adoptedId = adoptedPage._id || adoptedPage.id;
      if (adoptedId) {
        navigate(wikiPagePath(adoptedId), { replace: true });
        return;
      }
      navigate('/wiki/workspace?view=list', { replace: true });
    } catch (err) {
      setAdoptionError(err?.response?.data?.error || err?.message || 'We could not finish adopting this wiki. Try again.');
    } finally {
      setAdopting(false);
    }
  }, [adopting, idOrSlug, location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!page || !shouldAutoAdopt || autoAdoptAttemptedRef.current || !hasAuthToken()) return;
    autoAdoptAttemptedRef.current = true;
    handleAdopt();
  }, [handleAdopt, page, shouldAutoAdopt]);

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
            <section className="shared-wiki-page__adopt" aria-label="Adopt shared wiki">
              <div>
                <h2>This is a shared wiki.</h2>
                <p>Make it yours to edit, expand, and connect to your own thinking. The original owner keeps their version.</p>
              </div>
              <button type="button" onClick={handleAdopt} disabled={adopting}>
                {adopting ? 'Making a copy...' : 'Make this mine'}
              </button>
              {adoptionError ? <p className="shared-wiki-page__adopt-error" role="alert">{adoptionError}</p> : null}
            </section>
            <p className="shared-wiki-page__receipt" role="status">
              {buildSharePreviewReceipt()}
            </p>
            <p className="shared-wiki-page__privacy-note">
              References are visible as a static citation list. Private backlinks, source notes, graph edges, and agent work are not exposed.
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
              {renderTiptapDoc(page.body, { tocItems, disableInternalWikiLinks: true })}
            </div>
          </div>

          {Array.isArray(page.sourceRefs) && page.sourceRefs.length > 0 ? (
            <section className="shared-wiki-page__sources" aria-label="References">
              <h2>References</h2>
              <p className="shared-wiki-page__sources-note">
                These are static references for the shared page. They do not open the private Noeis graph.
              </p>
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
