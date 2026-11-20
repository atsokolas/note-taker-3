import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { adoptPublicWikiCollection, getPublicWikiCollection } from '../api/wiki';
import renderTiptapDoc, { firstParagraphText } from '../components/wiki/renderTiptapDoc';
import PublicWikiReferences, { usePublicCitationReturn } from '../components/wiki/PublicWikiReferences';
import { countWikiClaims, countWikiPageWords, countWikiSources } from '../components/wiki/wikiPageMetrics';
import { wikiPagePath } from '../utils/wikiFeatureFlags';
import useSeoMetadata from '../hooks/useSeoMetadata';
import { CANONICAL_HOST, SITE_NAME, buildCanonicalUrl } from '../seo/siteMetadata';
import { normalizeSpaces } from '../utils/editorialText';
import { tookPath } from './welcomeModel';

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

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
};

const reviewedDateFor = (page = {}) => page?.lastReviewedAt || page?.updatedAt || page?.createdAt || '';

const newestReviewedDate = (pages = []) => {
  const timestamps = (Array.isArray(pages) ? pages : [])
    .map(reviewedDateFor)
    .map(value => new Date(value || 0).getTime())
    .filter(value => Number.isFinite(value) && value > 0);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : '';
};

export const buildSharedWikiCollectionSchema = ({
  collection = {},
  pages = [],
  canonicalPath = '/',
  description = ''
} = {}) => {
  const title = normalizeSpaces(collection?.name || collection?.title) || 'Shared wiki collection';
  const canonicalUrl = buildCanonicalUrl(canonicalPath);
  const itemList = (Array.isArray(pages) ? pages : []).slice(0, 24).map((page, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: normalizeSpaces(page?.title) || `Wiki page ${index + 1}`
  }));

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    headline: title,
    description,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    isAccessibleForFree: true,
    inLanguage: 'en',
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: CANONICAL_HOST
    },
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: CANONICAL_HOST
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: itemList.length,
      itemListElement: itemList
    },
    keywords: [
      'source-grounded research',
      'personal research wiki',
      'public wiki collection'
    ]
  };
};

const CollectionEntryBody = ({ page, className = '' }) => {
  const citation = usePublicCitationReturn();
  return (
    <div className={className} onClick={citation.openCitation}>
      <div className="shared-wiki-page__body wiki-read">
        {renderTiptapDoc(page.body, { disableInternalWikiLinks: true })}
      </div>
      <PublicWikiReferences sources={page.sourceRefs} citation={citation} />
    </div>
  );
};

const SharedWikiCollectionPage = () => {
  const { idOrSlug = '', entryId = '' } = useParams();
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
    if (entryId) window.scrollTo(0, 0);
  }, [entryId]);

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
        navigate(tookPath(adoptedId, result.library), { replace: true });
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

  const collectionPath = `/share/wiki/collection/${encodeURIComponent(idOrSlug)}`;
  const entryPath = (page) => `${collectionPath}/${encodeURIComponent(pageIdFor(page) || page.slug)}`;
  const entry = entryId ? pages.find(page => String(pageIdFor(page)) === entryId || page.slug === entryId) : null;
  const entryMissing = Boolean(entryId && !loading && !error && !entry);
  const title = collection?.name || collection?.title || 'Shared wiki';
  const description = collection?.description || 'A shared Noeis wiki you can copy into your own workspace.';
  const totalWords = pages.reduce((sum, page) => sum + countWikiPageWords(page), 0);
  const totalSources = pages.reduce((sum, page) => sum + countWikiSources(page), 0);
  const totalClaims = pages.reduce((sum, page) => sum + countWikiClaims(page), 0);
  const reviewedAt = formatDate(newestReviewedDate(pages));
  const canonicalPath = location.pathname || `/share/wiki/collection/${idOrSlug}`;
  const seoTitle = entry ? `${entry.title} · ${title} · Noeis` : collection ? `${title} · Shared Wiki Collection · Noeis` : 'Shared Wiki Collection · Noeis';
  const seoDescription = normalizeSpaces(description).slice(0, 220) || 'A shared Noeis wiki you can copy into your own workspace.';
  const seoSchema = useMemo(
    () => buildSharedWikiCollectionSchema({
      collection,
      pages,
      canonicalPath,
      description: seoDescription
    }),
    [canonicalPath, collection, pages, seoDescription]
  );

  useSeoMetadata({
    title: seoTitle,
    description: seoDescription,
    canonicalPath,
    schema: collection && !error && !entryId ? seoSchema : null,
    ogType: 'article',
    robots: collection && !error && !entryMissing ? 'index,follow' : 'noindex,follow'
  });

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
      ) : entryMissing ? (
        <section className="shared-wiki-page__state">
          <h1>Shared page unavailable</h1>
          <p>This page is not in this public collection.</p>
          <Link to={collectionPath}>Back to {title}</Link>
        </section>
      ) : entry ? (
        <article className="shared-wiki-page__article">
          <header className="shared-wiki-page__hero">
            <Link to={collectionPath}>Back to {title}</Link>
            <p className="shared-wiki-page__eyebrow">Shared wiki</p>
            <h1>{entry.title || 'Untitled page'}</h1>
          </header>
          <CollectionEntryBody key={entryId} page={entry} />
        </article>
      ) : collection ? (
        <article className="shared-wiki-page__article">
          <header className="shared-wiki-page__hero shared-wiki-page__hero--collection">
            <p className="shared-wiki-page__eyebrow">Shared wiki collection</p>
            <h1>{title}</h1>
            <p className="shared-wiki-collection__intro">{description}</p>
            <div className="shared-wiki-collection__metadata" aria-label="Shared wiki metrics">
              <span>{pages.length} pages</span>
              <span>{totalSources} sources</span>
              {reviewedAt ? <span>Reviewed {reviewedAt}</span> : null}
            </div>
            <section className="shared-wiki-collection__adopt" aria-label="Adopt shared wiki">
              <button className="shared-wiki-collection__adopt-button" type="button" onClick={handleAdopt} disabled={adopting}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M12 5.5C9 3.5 5.5 3.5 2 5v15c3.5-1.5 7-1.5 10 .5 3-2 6.5-2 10-.5V5c-3.5-1.5-7-1.5-10 .5Zm0 0v15" />
                </svg>
                {adopting ? 'Adding…' : 'Add to my library'}
              </button>
              <p>Copy {pages.length} {pages.length === 1 ? 'page' : 'pages'} into your Wiki, with their public sources in your Library. Private reading stays with the owner.</p>
              {adoptionError ? <p className="shared-wiki-page__adopt-error" role="alert">{adoptionError}</p> : null}
            </section>
            <details className="shared-wiki-collection__sharing">
              <summary>Public sharing details</summary>
              <p>Maintained by the owner&apos;s agent.</p>
              <p>Public pages and references are visible. Backlinks, highlights, source notes, and agent work stay private.</p>
              <p>The pages come into your Wiki and every public source they cite comes into your Library, ready to read. The original stays as it is.</p>
              <p>{totalWords} words · {totalClaims} claims</p>
            </details>
          </header>

          <section className="shared-wiki-collection__pages" aria-label="Shared wiki pages">
            {pages.map((page) => {
              const preview = firstParagraphText(page.body) || page.summary || page.description || '';
              return (
                <article className="shared-wiki-collection__page" key={pageIdFor(page) || page.title}>
                  <div className="shared-wiki-collection__page-header">
                    <h2><Link to={entryPath(page)}>{page.title || 'Untitled page'}</Link></h2>
                    <span>{countWikiSources(page)} sources</span>
                  </div>
                  {preview ? <p>{preview}</p> : null}
                  <CollectionEntryBody page={page} className="shared-wiki-collection__page-preview" />
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
