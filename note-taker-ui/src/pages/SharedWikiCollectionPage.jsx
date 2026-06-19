import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { adoptPublicWikiCollection, getPublicWikiCollection } from '../api/wiki';
import renderTiptapDoc, { firstParagraphText } from '../components/wiki/renderTiptapDoc';
import { countWikiClaims, countWikiPageWords, countWikiSources } from '../components/wiki/wikiPageMetrics';
import { wikiPagePath } from '../utils/wikiFeatureFlags';
import { buildSharePreviewReceipt } from '../utils/connectionMagicMoment';

const hasAuthToken = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem('token') || localStorage.getItem('authToken'));
};

const usePublicShareScrollSurface = () => {
  useEffect(() => {
    document.documentElement.classList.add('noeis-public-share');
    document.body.classList.add('noeis-public-share');
    return () => {
      document.body.classList.remove('noeis-public-share');
      document.documentElement.classList.remove('noeis-public-share');
    };
  }, []);
};

const pageIdFor = (page = {}) => page?._id || page?.id || '';

const SharedWikiCollectionPage = () => {
  const { idOrSlug = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [collection, setCollection] = useState(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adopting, setAdopting] = useState(false);
  const [adoptionError, setAdoptionError] = useState('');
  const autoAdoptAttemptedRef = useRef(false);

  const shouldAutoAdopt = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return params.get('adopt') === '1';
  }, [location.search]);
  usePublicShareScrollSurface();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getPublicWikiCollection(idOrSlug)
      .then((payload) => {
        if (cancelled) return;
        setCollection(payload?.collection || null);
        setPages(Array.isArray(payload?.collection?.pages) ? payload.collection.pages : []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.status === 404
          ? 'This shared wiki is private, archived, or no longer exists.'
          : err?.response?.data?.error || 'Failed to load shared wiki.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idOrSlug]);

  useEffect(() => {
    const title = collection?.name || collection?.title;
    if (!title) return undefined;
    const previous = document.title;
    document.title = `${title} · Noeis`;
    return () => {
      document.title = previous;
    };
  }, [collection?.name, collection?.title]);

  const handleAdopt = useCallback(async () => {
    if (!idOrSlug || adopting) return;
    setAdoptionError('');
    if (!hasAuthToken()) {
      try {
        const params = new URLSearchParams(location.search || '');
        params.set('adopt', '1');
        sessionStorage.setItem('auth_return_to', `${location.pathname}?${params.toString()}${location.hash || ''}`);
        sessionStorage.setItem('auth_redirect_reason', 'auth');
      } catch (_error) {
        // The shared page can still be adopted after a manual sign-in.
      }
      navigate('/register');
      return;
    }
    setAdopting(true);
    try {
      const result = await adoptPublicWikiCollection(idOrSlug);
      const adoptedPages = Array.isArray(result.pages) ? result.pages : [];
      const firstPage = adoptedPages[0] || result.page || {};
      const adoptedId = pageIdFor(firstPage);
      if (adoptedId && shouldAutoAdopt) {
        navigate(`/onboarding/wiki?adoptedPage=${encodeURIComponent(adoptedId)}&source=shared`, { replace: true });
        return;
      }
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
  }, [adopting, idOrSlug, location.hash, location.pathname, location.search, navigate, shouldAutoAdopt]);

  useEffect(() => {
    if (!collection || !shouldAutoAdopt || autoAdoptAttemptedRef.current || !hasAuthToken()) return;
    autoAdoptAttemptedRef.current = true;
    handleAdopt();
  }, [collection, handleAdopt, shouldAutoAdopt]);

  const title = collection?.name || collection?.title || 'Shared wiki';
  const description = collection?.description || 'A shared Noeis wiki you can copy into your own workspace.';
  const totalWords = pages.reduce((sum, page) => sum + countWikiPageWords(page), 0);
  const totalSources = pages.reduce((sum, page) => sum + countWikiSources(page), 0);
  const totalClaims = pages.reduce((sum, page) => sum + countWikiClaims(page), 0);

  return (
    <main className="shared-wiki-page shared-wiki-page--collection">
      <nav className="shared-wiki-page__topbar" aria-label="Shared wiki navigation">
        <Link to="/" className="shared-wiki-page__brand">Noeis</Link>
        <Link to="/" className="shared-wiki-page__home">Open Noeis</Link>
      </nav>

      {loading ? (
        <section className="shared-wiki-page__state" role="status">Loading shared wiki...</section>
      ) : error ? (
        <section className="shared-wiki-page__state">
          <h1>Shared wiki unavailable</h1>
          <p>{error}</p>
        </section>
      ) : collection ? (
        <article className="shared-wiki-page__article">
          <header className="shared-wiki-page__hero shared-wiki-page__hero--collection">
            <p className="shared-wiki-page__eyebrow">Shared wiki collection</p>
            <h1>{title}</h1>
            <section className="shared-wiki-page__adopt" aria-label="Adopt shared wiki">
              <div>
                <h2>Make this wiki yours.</h2>
                <p>The agent will copy these safe public pages into your workspace. Your copy joins your own background maintenance loop; the original owner keeps their private graph.</p>
              </div>
              <button type="button" onClick={handleAdopt} disabled={adopting}>
                {adopting ? 'Making a copy...' : 'Make this mine'}
              </button>
              {adoptionError ? <p className="shared-wiki-page__adopt-error" role="alert">{adoptionError}</p> : null}
            </section>
            <p className="shared-wiki-page__receipt" role="status">{buildSharePreviewReceipt()}</p>
            <p className="shared-wiki-page__privacy-note">
              Public pages and references are visible. Backlinks, highlights, source notes, and agent work stay private.
            </p>
            <p className="shared-wiki-page__intro">{description}</p>
            <div className="shared-wiki-page__metrics" aria-label="Shared wiki metrics">
              <span>{pages.length} pages</span>
              <span>{totalWords} words</span>
              <span>{totalSources} sources</span>
              <span>{totalClaims} claims</span>
            </div>
          </header>

          <section className="shared-wiki-collection__pages" aria-label="Shared wiki pages">
            {pages.map((page) => {
              const preview = firstParagraphText(page.body) || page.summary || page.description || '';
              return (
                <article className="shared-wiki-collection__page" key={pageIdFor(page) || page.title}>
                  <div className="shared-wiki-collection__page-header">
                    <h2>{page.title || 'Untitled page'}</h2>
                    <span>{countWikiSources(page)} sources</span>
                  </div>
                  {preview ? <p>{preview}</p> : null}
                  <div className="shared-wiki-collection__page-preview wiki-read">
                    {renderTiptapDoc(page.body, { disableInternalWikiLinks: true })}
                  </div>
                </article>
              );
            })}
          </section>
        </article>
      ) : null}
    </main>
  );
};

export default SharedWikiCollectionPage;
