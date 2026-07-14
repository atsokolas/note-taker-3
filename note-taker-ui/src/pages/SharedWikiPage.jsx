import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { adoptPublicWikiPage, getPublicWikiComparison, getPublicWikiPage } from '../api/wiki';
import renderTiptapDoc, { extractTocItems, firstParagraphText } from '../components/wiki/renderTiptapDoc';
import WikiRepoDossierBody from '../components/wiki/WikiRepoDossierBody';
import WikiRepoDossierOverview from '../components/wiki/WikiRepoDossierOverview';
import { countWikiClaims, countWikiPageWords, countWikiSources } from '../components/wiki/wikiPageMetrics';
import {
  applyRepoDossierSectionAnchors,
  buildRepoDossierComparisonHref,
  buildRepoDossierSectionNav,
  buildRepoSectionChangeBadges,
  displayWikiPageTitle,
  extractRepoDossierOverviewSummary,
  repoDossierSectionAnchorId,
  repoDossierShouldCollapseSections,
  repoSectionIdForHeading
} from '../components/wiki/wikiRepoDossierModel';
import { wikiPagePath } from '../utils/wikiFeatureFlags';
import { buildSharePreviewReceipt } from '../utils/connectionMagicMoment';
import useSeoMetadata from '../hooks/useSeoMetadata';
import { CANONICAL_HOST, SITE_NAME, buildCanonicalUrl } from '../seo/siteMetadata';
import { trackSharedWikiAdoptClicked, trackSharedWikiViewed } from '../utils/marketingAnalytics';
import MaintenanceProofStamp from '../components/public/MaintenanceProofStamp';
import {
  PUBLIC_PROOF_PRIVACY_STATEMENT,
  reviewedDateForPublicPage
} from '../utils/maintenanceProof';
import '../styles/maintenance-proof-stamp.css';

const reviewedDateFor = (page = {}) => reviewedDateForPublicPage(page);

const GITHUB_REPO_REF_PATTERN = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/|$)/i;
const TITLE_REPO_SLUG_PATTERN = /^([\w.-]+)\/([\w.-]+)(?:\s+repo\s+wiki)?$/i;

/** Public-page heuristic: only uses fields present on the public wiki envelope. */
export const isPublicRepoWikiPage = (page = {}) => {
  if (!page) return false;
  if (page?.githubRepo?.owner && page?.githubRepo?.repo) return true;
  if (page?.maintenanceProof?.clock?.type === 'github') return true;
  if (/repo\s*wiki/i.test(String(page.title || ''))) return true;
  if (String(page.pageType || '').toLowerCase() === 'repo') return true;
  return false;
};

/** Derive owner/repo from public maintenance proof or title — never externalWatches. */
export const publicRepoGitHubLabel = (page = {}) => {
  const explicit = String(page?.githubRepo?.fullName || '').trim();
  if (explicit) return explicit;
  const owner = String(page?.githubRepo?.owner || '').trim();
  const repo = String(page?.githubRepo?.repo || '').trim();
  if (owner && repo) return `${owner}/${repo}`;
  const ref = String(page?.maintenanceProof?.currentThrough?.ref || '').trim();
  const refMatch = ref.match(GITHUB_REPO_REF_PATTERN);
  if (refMatch) return `${refMatch[1]}/${refMatch[2]}`;

  const title = String(page?.title || '').trim();
  const titleMatch = title.match(TITLE_REPO_SLUG_PATTERN);
  if (titleMatch) return `${titleMatch[1]}/${titleMatch[2]}`;

  return '';
};

/** Minimal page view for shared dossier components — public envelope fields only. */
export const buildPublicDossierPageView = (page = {}) => {
  const repoSlug = publicRepoGitHubLabel(page);
  return {
    title: page?.title,
    slug: page?.slug,
    pageType: page?.pageType,
    plainText: page?.plainText,
    summary: page?.summary,
    description: page?.description,
    wordCount: page?.wordCount,
    maintenanceProof: page?.maintenanceProof,
    ...(repoSlug ? { metadata: { githubRepo: repoSlug } } : {})
  };
};

export const publicRepoPublishedHead = (page = {}) => {
  const explicit = String(page?.githubRepo?.publishedHeadSha || '').trim();
  if (explicit) return explicit.slice(0, 7);
  const label = String(page?.maintenanceProof?.currentThrough?.label || '').trim();
  if (!label) return '';
  const commitMatch = label.match(/^Commit\s+([a-f0-9]{7,40})$/i);
  return commitMatch ? commitMatch[1].slice(0, 7) : label;
};

export const publicRepoPublicationMessage = (page = {}) => {
  const head = publicRepoPublishedHead(page);
  return head ? `Page current through ${head}` : '';
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

const hasAuthToken = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem('token') || localStorage.getItem('authToken'));
};

const cleanText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const buildSharedWikiDescription = (page, intro = '') => {
  const fromIntro = cleanText(intro).slice(0, 220);
  if (fromIntro) return fromIntro;
  const title = cleanText(page?.title) || 'Shared wiki';
  return `${title} is a public Noeis wiki page with static references and private workspace context withheld.`;
};

export const buildSharedWikiSchema = ({
  page,
  canonicalPath = '/',
  description = '',
  wordCount = 0,
  sourceCount = 0,
  claimCount = 0
} = {}) => {
  const title = cleanText(page?.title) || 'Shared wiki page';
  const canonicalUrl = buildCanonicalUrl(canonicalPath);
  const citations = Array.isArray(page?.sourceRefs)
    ? page.sourceRefs
      .slice(0, 24)
      .map((source) => {
        const name = cleanText(source?.title || source?.url || source?.type || 'Source');
        if (!name) return null;
        return {
          '@type': 'CreativeWork',
          name,
          ...(source?.url ? { url: source.url } : {})
        };
      })
      .filter(Boolean)
    : [];

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    name: title,
    headline: title,
    description,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    isAccessibleForFree: true,
    inLanguage: 'en',
    datePublished: page?.createdAt || undefined,
    dateModified: page?.updatedAt || undefined,
    dateReviewed: reviewedDateFor(page) || undefined,
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
    ...(wordCount ? { wordCount } : {}),
    keywords: [
      'source-grounded research',
      'personal research wiki',
      ...(sourceCount ? ['public source references'] : []),
      ...(claimCount ? ['evidence-backed claims'] : [])
    ],
    about: [
      page?.pageType || 'research wiki',
      'maintained research dossier',
      'source-grounded knowledge work'
    ],
    ...(citations.length > 0 ? { citation: citations } : {})
  };
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
  const [comparisonAvailable, setComparisonAvailable] = useState(false);
  const [publicComparison, setPublicComparison] = useState(null);
  const autoAdoptAttemptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPage(null);
    setComparisonAvailable(false);
    setPublicComparison(null);
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

  useEffect(() => {
    let cancelled = false;
    if (!page || !isPublicRepoWikiPage(page) || !idOrSlug) {
      setComparisonAvailable(false);
      setPublicComparison(null);
      return undefined;
    }
    getPublicWikiComparison(idOrSlug)
      .then((payload) => {
        if (cancelled) return;
        setPublicComparison(payload?.comparison || null);
        setComparisonAvailable(Boolean(payload?.comparison));
      })
      .catch(() => {
        if (!cancelled) {
          setComparisonAvailable(false);
          setPublicComparison(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [idOrSlug, page]);

  const tocItems = useMemo(() => extractTocItems(page?.body), [page?.body]);
  const intro = useMemo(() => firstParagraphText(page?.body), [page?.body]);
  const repoDossierMode = Boolean(page && isPublicRepoWikiPage(page));
  const dossierPageView = useMemo(
    () => (repoDossierMode ? buildPublicDossierPageView(page) : page),
    [page, repoDossierMode]
  );
  const bodyTocItems = useMemo(() => extractTocItems(page?.body), [page?.body]);
  const displayBody = useMemo(() => {
    if (!repoDossierMode || !page?.body) return page?.body;
    return applyRepoDossierSectionAnchors(page.body, bodyTocItems);
  }, [bodyTocItems, page?.body, repoDossierMode]);
  const repoSectionNav = useMemo(
    () => (repoDossierMode ? buildRepoDossierSectionNav({ tocItems: bodyTocItems }) : []),
    [bodyTocItems, repoDossierMode]
  );
  const repoOverviewSummary = useMemo(
    () => (repoDossierMode ? extractRepoDossierOverviewSummary(displayBody, page) : ''),
    [displayBody, page, repoDossierMode]
  );
  const repoSectionBadges = useMemo(
    () => (repoDossierMode ? buildRepoSectionChangeBadges(publicComparison) : {}),
    [publicComparison, repoDossierMode]
  );
  const repoCollapseSections = useMemo(
    () => (repoDossierMode ? repoDossierShouldCollapseSections(page, bodyTocItems) : false),
    [bodyTocItems, page, repoDossierMode]
  );
  const repoComparisonHref = useMemo(
    () => buildRepoDossierComparisonHref({
      pageId: idOrSlug,
      page,
      shared: true,
      comparisonAvailable
    }),
    [comparisonAvailable, idOrSlug, page]
  );
  const mappedTocItems = useMemo(() => {
    if (!repoDossierMode) return tocItems;
    return bodyTocItems.map(item => {
      const sectionId = repoSectionIdForHeading(item.title);
      if (!sectionId) return item;
      return {
        ...item,
        id: repoDossierSectionAnchorId(sectionId)
      };
    });
  }, [bodyTocItems, repoDossierMode, tocItems]);
  const displayTitle = repoDossierMode
    ? displayWikiPageTitle(dossierPageView, page?.title || 'Untitled wiki page')
    : (page?.title || 'Untitled wiki page');
  const wordCount = countWikiPageWords(page || {});
  const sourceCount = countWikiSources(page || {});
  const claimCount = countWikiClaims(page || {});
  const maintenanceProof = page?.maintenanceProof || null;
  const stampProof = maintenanceProof || (page ? {
    ...(page.lastReviewedAt ? { lastReviewedAt: page.lastReviewedAt } : {}),
    ...(Number.isFinite(Number(page.sourceCount)) ? { sourceCount: Number(page.sourceCount) } : {}),
    ...(Number.isFinite(Number(page.claimCount)) ? { claimCount: Number(page.claimCount) } : {})
  } : null);
  const canonicalPath = location.pathname || `/share/wiki/${idOrSlug}`;
  const seoDescription = useMemo(
    () => buildSharedWikiDescription(page, intro),
    [intro, page]
  );
  const seoTitle = page?.title ? `${page.title} · Shared Wiki · Noeis` : 'Shared Wiki · Noeis';
  const seoSchema = useMemo(
    () => buildSharedWikiSchema({
      page,
      canonicalPath,
      description: seoDescription,
      wordCount,
      sourceCount,
      claimCount
    }),
    [canonicalPath, claimCount, page, seoDescription, sourceCount, wordCount]
  );
  const shouldAutoAdopt = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return params.get('adopt') === '1';
  }, [location.search]);
  usePublicShareScrollSurface();
  useSeoMetadata({
    title: seoTitle,
    description: seoDescription,
    canonicalPath,
    schema: page && !error ? seoSchema : null,
    ogType: 'article',
    robots: page && !error ? 'index,follow' : 'noindex,follow'
  });

  useEffect(() => {
    if (!page) return;
    trackSharedWikiViewed({
      page: canonicalPath,
      title: page.title || '',
      sourceCount,
      claimCount
    });
  }, [canonicalPath, claimCount, page, sourceCount]);

  const handleAdopt = useCallback(async () => {
    if (!idOrSlug || adopting) return;
    setAdoptionError('');
    trackSharedWikiAdoptClicked({
      page: canonicalPath,
      title: page?.title || '',
      sourceCount,
      claimCount
    });
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
        if (shouldAutoAdopt) {
          navigate(`/onboarding/wiki?adoptedPage=${encodeURIComponent(adoptedId)}&source=shared`, { replace: true });
          return;
        }
        navigate(wikiPagePath(adoptedId), { replace: true });
        return;
      }
      navigate('/wiki/workspace?view=list', { replace: true });
    } catch (err) {
      setAdoptionError(err?.response?.data?.error || err?.message || 'We could not finish adopting this wiki. Try again.');
    } finally {
      setAdopting(false);
    }
  }, [adopting, canonicalPath, claimCount, idOrSlug, location.hash, location.pathname, location.search, navigate, page?.title, shouldAutoAdopt, sourceCount]);

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
            <p className="shared-wiki-page__eyebrow">{repoDossierMode ? 'Shared repository dossier' : 'Shared wiki'}</p>
            <h1>{displayTitle}</h1>
            <section className="shared-wiki-page__adopt" aria-label="Adopt shared wiki">
              <div>
                <h2>This is a shared wiki.</h2>
                <p>Make it yours to edit, expand, and connect to your own thinking. Your copy joins your own background maintenance loop; the original owner keeps their version.</p>
              </div>
              <button
                type="button"
                className="shared-wiki-page__adopt-cta"
                onClick={handleAdopt}
                disabled={adopting}
              >
                {adopting ? 'Making a copy...' : 'Make this mine'}
              </button>
              {adoptionError ? <p className="shared-wiki-page__adopt-error" role="alert">{adoptionError}</p> : null}
            </section>
            <p className="shared-wiki-page__receipt" role="status">
              {buildSharePreviewReceipt()}
            </p>
            <MaintenanceProofStamp
              proof={stampProof}
              className="shared-wiki-page__maintenance-stamp maintenance-proof-stamp"
            />
            <p className="shared-wiki-page__privacy-note">
              {PUBLIC_PROOF_PRIVACY_STATEMENT}
            </p>
            {repoDossierMode ? (
              <WikiRepoDossierOverview
                page={dossierPageView}
                overviewSummary={repoOverviewSummary}
                sectionNav={repoSectionNav}
                sectionBadges={repoSectionBadges}
                publicationMessage={publicRepoPublicationMessage(page)}
                publishedHead={publicRepoPublishedHead(page)}
                buildStateLabel={page?.buildStateLabel || ''}
                comparisonHref={repoComparisonHref}
                collapseEnabled={repoCollapseSections}
              />
            ) : null}
            {!repoDossierMode && intro ? <p className="shared-wiki-page__intro">{intro}</p> : null}
            <div className="shared-wiki-page__metrics" aria-label="Wiki page metrics">
              <span>{wordCount} words</span>
              <span>{sourceCount} sources</span>
              <span>{claimCount} claims</span>
            </div>
          </header>

          <div className="shared-wiki-page__layout">
            {repoDossierMode && repoSectionNav.length ? (
              <aside className="shared-wiki-page__toc shared-wiki-page__toc--dossier" aria-label="Repository dossier contents">
                <nav className="wiki-read__repo-dossier-toc">
                  <span>Dossier</span>
                  <ol>
                    {repoSectionNav.map(item => (
                      <li
                        key={item.id}
                        className={`wiki-read__toc-item${item.available ? '' : ' is-missing'}`}
                      >
                        {item.available ? (
                          <a href={`#${item.anchorId}`}>{item.label}</a>
                        ) : (
                          <span aria-disabled="true">{item.label}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </nav>
              </aside>
            ) : null}
            {mappedTocItems.length > 0 ? (
              <aside className="shared-wiki-page__toc" aria-label="Contents">
                <span>{repoDossierMode ? 'All sections' : 'Contents'}</span>
                {mappedTocItems.map(item => (
                  <a key={item.id} href={`#${item.id}`} className={`is-level-${item.level}`}>
                    {item.title}
                  </a>
                ))}
              </aside>
            ) : null}

            <div className="shared-wiki-page__body wiki-read">
              {repoDossierMode ? (
                <WikiRepoDossierBody
                  doc={displayBody}
                  tocItems={mappedTocItems}
                  collapseSections={repoCollapseSections}
                  disableInternalWikiLinks
                />
              ) : (
                renderTiptapDoc(page.body, { tocItems, disableInternalWikiLinks: true })
              )}
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
