import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../ui';
import {
  askWikiPage,
  getWikiBacklinks,
  getWikiPage,
  getWikiPageMarkdown,
  maintainWikiPage,
  promoteWikiDiscussion
} from '../../api/wiki';
import { trackWikiQaPromoted, trackWikiReadModePageView } from '../../utils/wikiAnalytics';
import { wikiPagePath } from '../../utils/wikiFeatureFlags';
import ClaimCitationPopover from './ClaimCitationPopover';
import renderTiptapDoc, { citationAnchorId, extractTocItems, firstParagraphText } from './renderTiptapDoc';
import { buildQualityState } from './wikiQuality';
import {
  diffClaimLedgerSnapshots,
  diffClaimSnapshots,
  extractClaimTexts,
  getLastVisitState,
  recordVisit
} from './wikiVisitTracker';
import { SUPPORT_STATES } from './extensions/Claim';

const WikiAskComposer = lazy(() => import('./WikiAskComposer'));
const WikiAutolinkSuggestions = lazy(() => import('./WikiAutolinkSuggestions'));
const WikiBuildPageComposer = lazy(() => import('./WikiBuildPageComposer'));
const WikiChangesSinceLastVisit = lazy(() => import('./WikiChangesSinceLastVisit'));
const WikiDiscussions = lazy(() => import('./WikiDiscussions'));

const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

const labelFor = (value = '') => String(value || '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, char => char.toUpperCase());

const normalizeId = (value) => String(value || '').trim();
const idsMatch = (a, b) => normalizeId(a) && normalizeId(a) === normalizeId(b);

const sourceIdsForCitationIds = ({ citationIds = [], citations = [] } = {}) => (
  (citations || [])
    .filter(citation => (citationIds || []).some(id => idsMatch(id, citation._id || citation.id)))
    .map(citation => citation.sourceRefId || citation.sourceId)
    .filter(Boolean)
);

const claimContradictsSource = ({ claim, source, citations = [] }) => {
  if (!claim || !source) return false;
  const sourceId = source._id || source.id;
  const contradictionCitationIds = Array.isArray(claim.contradictedByCitationIds)
    ? claim.contradictedByCitationIds
    : [];
  return sourceIdsForCitationIds({ citationIds: contradictionCitationIds, citations })
    .some(id => idsMatch(id, sourceId));
};

const claimMatchesSource = ({ claim, source, citations = [] }) => {
  if (!claim || !source) return false;
  const sourceId = source._id || source.id;
  if ((claim.sourceRefIds || []).some(id => idsMatch(id, sourceId))) return true;
  const supportingSourceIds = sourceIdsForCitationIds({ citationIds: claim.citationIds || [], citations });
  if (supportingSourceIds.some(id => idsMatch(id, sourceId))) return true;
  return claimContradictsSource({ claim, source, citations });
};

const parseIndexAttribute = (value = '') => (
  String(value || '')
    .split(',')
    .map(token => Number(token.trim()))
    .filter(Number.isFinite)
    .filter(index => index >= 1)
);

const scrollOptions = () => (
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    ? { block: 'start' }
    : { behavior: 'smooth', block: 'start' }
);

const scrollToElementId = (id = '') => {
  const element = id ? document.getElementById(id) : null;
  if (!element) return false;
  element.scrollIntoView?.(scrollOptions());
  element.focus?.({ preventScroll: true });
  return true;
};

const scheduleAfterFirstPaint = (callback) => {
  let frame = 0;
  let idle = 0;
  let timeout = 0;
  const run = () => {
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(callback, { timeout: 250 });
      return;
    }
    timeout = window.setTimeout(callback, 0);
  };
  if (typeof window.requestAnimationFrame === 'function') frame = window.requestAnimationFrame(run);
  else timeout = window.setTimeout(callback, 0);
  return () => {
    if (frame && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame);
    if (idle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
    if (timeout) window.clearTimeout(timeout);
  };
};

const collectFootnoteCitations = (node, fallbackPrefix = 'body') => {
  const matches = [];
  const walk = (value, path = fallbackPrefix) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((child, index) => walk(child, `${path}-${index}`));
      return;
    }
    if (typeof value !== 'object') return;
    if (value.type === 'text' && Array.isArray(value.marks)) {
      const claimMark = value.marks.find(mark => mark?.type === 'claim');
      const attrs = claimMark?.attrs || {};
      const indexes = Array.isArray(attrs.citationIndexes) && attrs.citationIndexes.length
        ? attrs.citationIndexes
        : attrs.contradictionIndexes;
      (Array.isArray(indexes) ? indexes : [])
        .map(index => Number(index))
        .filter(index => Number.isFinite(index) && index >= 1)
        .forEach(index => {
          matches.push({
            index,
            claimId: attrs.claimId || '',
            anchorId: citationAnchorId({ claimId: attrs.claimId, citationIndex: index, fallback: path })
          });
        });
    }
    walk(value.content, path);
  };
  walk(node);
  return matches;
};

const collectText = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (typeof node !== 'object') return '';
  return [node.text || '', collectText(node.content)].filter(Boolean).join(' ');
};

const hasInlineWikiLinks = (node) => {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(hasInlineWikiLinks);
  if (typeof node !== 'object') return false;
  if (Array.isArray(node.marks) && node.marks.some(mark => mark?.type === 'wikiLink' && mark?.attrs?.pageId)) return true;
  return hasInlineWikiLinks(node.content);
};

const pickFirst = (...values) => values
  .map(value => (value == null ? '' : String(value).trim()))
  .find(Boolean) || '';

const pageMeta = (page = {}) => {
  const value = page || {};
  return (
    value.infobox && typeof value.infobox === 'object' ? value.infobox :
      value.metadata && typeof value.metadata === 'object' ? value.metadata :
        value.meta && typeof value.meta === 'object' ? value.meta :
        {}
  );
};

const listValue = (value, limit = 3) => {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean).slice(0, limit).join(', ');
  return String(value || '').trim();
};

const formatDate = (value) => {
  if (!value) return 'Not reviewed';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not reviewed';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatOptionalDate = (value, fallback = '') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const claimHealthCounts = (claims = []) => (
  (Array.isArray(claims) ? claims : []).reduce((counts, claim) => {
    const support = String(claim?.support || 'unsupported').trim() || 'unsupported';
    if (support === 'supported') counts.supported += 1;
    else if (support === 'partial') counts.partial += 1;
    else if (support === 'conflicted' || support === 'contradicted') counts.conflicted += 1;
    else counts.unsupported += 1;
    return counts;
  }, { supported: 0, partial: 0, unsupported: 0, conflicted: 0 })
);

const keyClaimText = (claims = []) => (
  (Array.isArray(claims) ? claims : [])
    .map(claim => claim?.text || claim?.claim || '')
    .find(Boolean) || ''
);

const contradictionCount = (claims = []) => (
  (Array.isArray(claims) ? claims : [])
    .filter(claim => ['conflicted', 'contradicted'].includes(String(claim?.support || '').toLowerCase()))
    .length
);

const cleanSourceText = (value = '') => String(value || '')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/<\/(p|div|li|br)>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim();

const conciseText = (value = '', limit = 180) => {
  const text = cleanSourceText(value);
  if (text.length <= limit) return text;
  const truncated = text.slice(0, limit).replace(/\s+\S*$/, '').trim();
  return `${truncated || text.slice(0, limit).trim()}...`;
};

const sourceExcerpt = (source = {}) => (
  cleanSourceText(source.excerpt || source.snippet || source.summary || source.description || source.text || '')
);

const citationMatchesSource = (citation = {}, source = {}) => {
  const sourceId = source?._id || source?.id;
  return [
    citation.sourceRefId,
    citation.sourceId,
    citation.sourceRef?._id,
    citation.sourceRef?.id
  ].some(id => idsMatch(id, sourceId));
};

const sourceEvidenceCounts = ({ source = {}, claims = [], citations = [] }) => {
  const explicitCitationCount = Number(source.citationCount ?? source.citationsCount);
  const explicitClaimCount = Number(source.claimCount ?? source.claimsCount);
  const citationCount = (Array.isArray(citations) ? citations : [])
    .filter(citation => citationMatchesSource(citation, source))
    .length;
  const claimCount = (Array.isArray(claims) ? claims : [])
    .filter(claim => claimMatchesSource({ claim, source, citations }))
    .length;
  return {
    citationCount: Number.isFinite(explicitCitationCount) ? Math.max(citationCount, explicitCitationCount) : citationCount,
    claimCount: Number.isFinite(explicitClaimCount) ? Math.max(claimCount, explicitClaimCount) : claimCount
  };
};

const formatSourceCounts = ({ citationCount = 0, claimCount = 0 }) => {
  const parts = [];
  if (citationCount > 0) parts.push(`${citationCount} citation${citationCount === 1 ? '' : 's'}`);
  if (claimCount > 0) parts.push(`${claimCount} claim${claimCount === 1 ? '' : 's'}`);
  return parts.join(' / ');
};

const sectionTitles = (body) => extractTocItems(body || emptyDoc)
  .filter(item => item.level === 2)
  .map(item => item.title)
  .slice(0, 3)
  .join(', ');

const buildInfoboxRows = ({ page = {}, sourceCount = 0, claimCount = 0, wordCount = 0, lastReviewed = 'Not reviewed' }) => {
  const value = page || {};
  const meta = pageMeta(value);
  const type = String(value.pageType || 'topic').toLowerCase();
  const firstSource = Array.isArray(value.sourceRefs) ? value.sourceRefs[0] || {} : {};
  // Word count moved here from the now-stripped page-header "facts row" so
  // the number survives but stops competing with the title for attention.
  const baseRows = [
    { label: 'Status', value: labelFor(value.status || 'draft') },
    { label: 'Sources', value: sourceCount },
    { label: 'Claims', value: claimCount },
    { label: 'Words', value: wordCount || 0 },
    { label: 'Last reviewed', value: lastReviewed }
  ];

  if (type === 'entity') {
    return [
      { label: 'Role', value: pickFirst(meta.role, meta.description, firstParagraphText(value.body)) },
      { label: 'Born', value: pickFirst(formatOptionalDate(meta.born), meta.founded, meta.created) },
      { label: 'Key claim', value: pickFirst(keyClaimText(value.claims), meta.keyClaim) },
      ...baseRows
    ];
  }

  if (type === 'concept') {
    return [
      { label: 'Definition', value: pickFirst(meta.definition, firstParagraphText(value.body)) },
      { label: 'First seen', value: pickFirst(formatOptionalDate(meta.firstSeenAt || meta.firstSeen), formatOptionalDate(value.createdAt)) },
      { label: 'Contradictions', value: pickFirst(meta.contradictions, contradictionCount(value.claims)) },
      ...baseRows
    ];
  }

  if (type === 'source') {
    return [
      { label: 'Author', value: pickFirst(meta.author, firstSource.author, firstSource.byline) },
      { label: 'Date', value: pickFirst(formatOptionalDate(meta.date || meta.publishedAt || firstSource.publishedAt), formatOptionalDate(firstSource.createdAt)) },
      { label: 'URL', value: pickFirst(meta.url, firstSource.url, firstSource.href) },
      { label: 'Takeaways', value: pickFirst(listValue(meta.takeaways), keyClaimText(value.claims), firstParagraphText(value.body)) },
      ...baseRows
    ];
  }

  if (type === 'question') {
    return [
      { label: 'Question', value: pickFirst(meta.question, value.title) },
      { label: 'Answered', value: (value.discussions || []).length ? `${value.discussions.length} discussion${value.discussions.length === 1 ? '' : 's'}` : 'No discussions yet' },
      { label: 'Best current answer', value: pickFirst(meta.answer, firstParagraphText(value.body)) },
      ...baseRows
    ];
  }

  if (type === 'overview') {
    return [
      { label: 'Scope', value: pickFirst(meta.scope, firstParagraphText(value.body)) },
      { label: 'Sections', value: pickFirst(sectionTitles(value.body), 'No sections yet') },
      { label: 'Open threads', value: `${(value.discussions || []).length} discussion${(value.discussions || []).length === 1 ? '' : 's'}` },
      ...baseRows
    ];
  }

  return [
    { label: 'Kind', value: labelFor(value.pageType || 'topic') },
    { label: 'Summary', value: pickFirst(meta.summary, firstParagraphText(value.body)) },
    { label: 'Sections', value: pickFirst(sectionTitles(value.body), 'No sections yet') },
    ...baseRows
  ];
};

const WIKI_LINK_PREVIEW_SHOW_DELAY_MS = 250;
const WIKI_LINK_PREVIEW_DISMISS_GRACE_MS = 100;

const WikiLinkPreview = ({ preview, onMouseEnter, onMouseLeave }) => {
  if (!preview?.page) return null;
  const sourceCount = Array.isArray(preview.page.sourceRefs) ? preview.page.sourceRefs.length : 0;
  return (
    <aside
      className="wiki-read-link-preview"
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        top: preview.anchorRect ? `${preview.anchorRect.bottom + window.scrollY + 8}px` : undefined,
        left: preview.anchorRect ? `${Math.min(preview.anchorRect.left + window.scrollX, window.innerWidth - 340)}px` : undefined
      }}
    >
      <h3>{preview.page.title || 'Untitled wiki page'}</h3>
      <p>{firstParagraphText(preview.page.body) || 'No summary yet.'}</p>
      <span>{sourceCount} source{sourceCount === 1 ? '' : 's'}</span>
    </aside>
  );
};

const WikiMentionedInFooter = ({ pageId, pageTitle }) => {
  const [state, setState] = useState({ backlinks: [], loading: true, error: false });

  useEffect(() => {
    if (!pageId) return undefined;
    let cancelled = false;
    setState(current => ({ ...current, loading: true, error: false }));
    getWikiBacklinks(pageId)
      .then((data) => {
        if (cancelled) return;
        setState({
          backlinks: Array.isArray(data?.backlinks) ? data.backlinks : [],
          loading: false,
          error: false
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ backlinks: [], loading: false, error: true });
      });
    return () => { cancelled = true; };
  }, [pageId, pageTitle]);

  if (state.error || (!state.loading && state.backlinks.length === 0)) return null;
  return (
    <footer className="wiki-read-mentioned" aria-label="Mentioned in">
      <h2>Mentioned in</h2>
      {state.loading ? <p>Loading backlinks...</p> : (
        <ul>
          {state.backlinks.map(entry => (
            <li key={entry.pageId}>
              <Link to={wikiPagePath(entry.pageId)}>
                <span>{entry.title || 'Untitled wiki page'}</span>
                <small>{entry.mentionCount} mention{entry.mentionCount === 1 ? '' : 's'}</small>
                {entry.snippet ? <p>{entry.snippet}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </footer>
  );
};

const WikiReadReferences = ({ sources = [], citations = [], highlightedRef, onJumpBack }) => {
  if (!sources.length) return null;
  const firstCitationByIndex = citations.reduce((map, citation) => {
    if (!map.has(citation.index)) map.set(citation.index, citation);
    return map;
  }, new Map());
  return (
    <section className="wiki-read__references" aria-labelledby="wiki-read-references-title">
      <h2 id="wiki-read-references-title">References</h2>
      <ol>
        {sources.map((source, index) => {
          const citationIndex = index + 1;
          const citation = firstCitationByIndex.get(citationIndex);
          const refId = `wiki-ref-${citationIndex}`;
          const excerpt = sourceExcerpt(source);
          return (
            <li
              key={source._id || source.id || `${source.title}-${index}`}
              id={refId}
              tabIndex="-1"
              className={highlightedRef === refId ? 'is-highlighted' : ''}
            >
              <div className="wiki-read__reference-head">
                <span className="wiki-read__reference-index">[{citationIndex}]</span>
                {citation?.anchorId ? (
                  <a
                    href={`#${citation.anchorId}`}
                    className="wiki-read__reference-backlink"
                    aria-label={`Jump back to citation ${citationIndex}`}
                    onClick={(event) => {
                      event.preventDefault();
                      onJumpBack?.(citation.anchorId);
                    }}
                  >
                    ^
                  </a>
                ) : null}
                <span className="wiki-read__reference-title">{source.title || 'Untitled source'}</span>
              </div>
              {excerpt ? <p>{conciseText(excerpt, 240)}</p> : null}
              {source.url ? (
                <a className="wiki-read__reference-source" href={source.url} target="_blank" rel="noreferrer">
                  Open source
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

const WikiPageReadView = ({ pageId, onEdit, workspaceMode = false }) => {
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [maintaining, setMaintaining] = useState(false);
  const [asking, setAsking] = useState(false);
  const [promotingDiscussionId, setPromotingDiscussionId] = useState('');
  const [error, setError] = useState('');
  const [activeClaim, setActiveClaim] = useState(null);
  const [preview, setPreview] = useState(null);
  const [lastVisit, setLastVisit] = useState(null);
  const [activeTab, setActiveTab] = useState('article');
  const [markdownStatus, setMarkdownStatus] = useState('');
  const [highlightedRef, setHighlightedRef] = useState('');
  const [nonCriticalReady, setNonCriticalReady] = useState(false);
  // AT-22 (Bucket 2): rail is collapsible-by-default. Persisted across pages
  // so once a reader opens context they keep it open until they hide it again.
  // Wikipedia / Tolkien Gateway reading shape — body owns the canvas.
  const [railCollapsed, setRailCollapsed] = useState(() => {
    try {
      const raw = window.localStorage?.getItem('noeis.wiki.read.rail_collapsed');
      // Default: collapsed. Anything explicitly set to '0' or 'false' opens it.
      if (raw === '0' || raw === 'false') return false;
      return true;
    } catch (_e) {
      return true;
    }
  });
  useEffect(() => {
    try {
      window.localStorage?.setItem('noeis.wiki.read.rail_collapsed', railCollapsed ? '1' : '0');
    } catch (_e) { /* ignore quota / private mode */ }
  }, [railCollapsed]);
  const previewTimerRef = useRef(null);
  const previewDismissTimerRef = useRef(null);
  const latestPageRef = useRef(null);
  const autoRebuildPageRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    setActiveTab('article');
    setNonCriticalReady(false);
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const loaded = await getWikiPage(pageId);
        if (cancelled) return;
        latestPageRef.current = loaded;
        setPage(loaded);
        trackWikiReadModePageView({
          pageId,
          pageType: loaded.pageType || '',
          sourceCount: Array.isArray(loaded.sourceRefs) ? loaded.sourceRefs.length : 0,
          claimCount: Array.isArray(loaded.claims) ? loaded.claims.length : 0
        });
      } catch (_error) {
        if (!cancelled) setError('Failed to load Wiki page.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (previewDismissTimerRef.current) clearTimeout(previewDismissTimerRef.current);
    };
  }, [pageId]);

  useEffect(() => {
    if (!page) {
      setNonCriticalReady(false);
      setLastVisit(null);
      return undefined;
    }
    let cancelled = false;
    const cancelScheduled = scheduleAfterFirstPaint(() => {
      if (cancelled) return;
      setLastVisit(getLastVisitState(pageId));
      setNonCriticalReady(true);
    });
    return () => {
      cancelled = true;
      cancelScheduled?.();
    };
  }, [page, pageId]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const tag = target?.tagName || '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || target?.isContentEditable) return;
      if (event.key.toLowerCase() === 'e' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        onEdit?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEdit, workspaceMode]);

  const handleMaintain = useCallback(async () => {
    if (workspaceMode) return;
    setMaintaining(true);
    setError('');
    try {
      const maintained = await maintainWikiPage(pageId);
      latestPageRef.current = maintained;
      setPage(maintained);
    } catch (_error) {
      setError('Failed to maintain Wiki page.');
    } finally {
      setMaintaining(false);
    }
  }, [pageId, workspaceMode]);

  const handleAsk = async (question) => {
    if (workspaceMode) return;
    setAsking(true);
    setError('');
    try {
      const updated = await askWikiPage(pageId, question);
      latestPageRef.current = updated;
      setPage(updated);
    } catch (_error) {
      setError('Failed to ask this Wiki page.');
    } finally {
      setAsking(false);
    }
  };

  const handlePromoteDiscussion = async (discussion, title) => {
    if (workspaceMode) return;
    const discussionId = discussion?._id || '';
    if (!discussionId) return;
    setPromotingDiscussionId(discussionId);
    setError('');
    try {
      const result = await promoteWikiDiscussion(pageId, discussionId, { title });
      const createdPage = result?.page || result;
      trackWikiQaPromoted({
        sourcePageId: pageId,
        promotedPageId: createdPage?._id || '',
        discussionId
      });
      if (createdPage?._id) navigate(wikiPagePath(createdPage._id));
    } catch (_error) {
      setError('Failed to create Wiki page from discussion.');
    } finally {
      setPromotingDiscussionId('');
    }
  };

  const handleClaimHover = useCallback((event) => {
    const target = event.target.closest?.('.wiki-claim-citation');
    if (!target) return;
    const claimId = target.getAttribute('data-claim-id') || '';
    const support = target.getAttribute('data-support') || 'supported';
    setActiveClaim({
      claimId,
      support: SUPPORT_STATES.has(support) ? support : 'supported',
      citationIndexes: parseIndexAttribute(target.getAttribute('data-citation-indexes')),
      contradictionIndexes: parseIndexAttribute(target.getAttribute('data-contradiction-indexes')),
      anchorRect: target.getBoundingClientRect()
    });
  }, []);

  const highlightReference = useCallback((refId = '') => {
    setHighlightedRef(refId);
    window.setTimeout(() => {
      setHighlightedRef(current => (current === refId ? '' : current));
    }, 1600);
  }, []);

  const handleCitationClick = useCallback((event) => {
    const target = event.target.closest?.('.wiki-claim-citation');
    if (!target) return;
    const refId = target.getAttribute('data-footnote-target') || '';
    if (!refId) return;
    event.preventDefault();
    if (scrollToElementId(refId)) highlightReference(refId);
  }, [highlightReference]);

  const handleReferenceBacklink = useCallback((citationId = '') => {
    scrollToElementId(citationId);
  }, []);

  const handleClaimLeave = useCallback((event) => {
    const next = event.relatedTarget;
    if (next && (
      next.closest?.('.wiki-claim-popover') ||
      next.closest?.('.wiki-claim-citation') ||
      next.closest?.('span.wiki-claim')
    )) return;
    setActiveClaim(null);
  }, []);

  const handleLinkEnter = useCallback((event) => {
    const target = event.target.closest?.('.wiki-internal-link');
    const targetPageId = target?.getAttribute?.('data-wiki-page-id');
    if (!targetPageId) return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (previewDismissTimerRef.current) clearTimeout(previewDismissTimerRef.current);
    const anchorRect = target.getBoundingClientRect();
    previewTimerRef.current = window.setTimeout(async () => {
      try {
        const loaded = await getWikiPage(targetPageId);
        setPreview({ page: loaded, anchorRect });
      } catch (_error) {
        setPreview(null);
      }
    }, WIKI_LINK_PREVIEW_SHOW_DELAY_MS);
  }, []);

  const dismissPreviewWithGrace = useCallback(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (previewDismissTimerRef.current) clearTimeout(previewDismissTimerRef.current);
    previewDismissTimerRef.current = window.setTimeout(() => setPreview(null), WIKI_LINK_PREVIEW_DISMISS_GRACE_MS);
  }, []);

  const handleLinkLeave = useCallback((event) => {
    const next = event.relatedTarget;
    if (next && (
      next.closest?.('.wiki-read-link-preview') ||
      next.closest?.('.wiki-internal-link')
    )) return;
    dismissPreviewWithGrace();
  }, [dismissPreviewWithGrace]);

  const handlePreviewEnter = useCallback(() => {
    if (previewDismissTimerRef.current) clearTimeout(previewDismissTimerRef.current);
  }, []);

  const handlePreviewLeave = useCallback(() => {
    dismissPreviewWithGrace();
  }, [dismissPreviewWithGrace]);

  const claimLedgerById = useMemo(() => {
    const map = new Map();
    (page?.claims || []).forEach((claim) => {
      if (claim?.claimId) map.set(claim.claimId, claim);
    });
    return map;
  }, [page?.claims]);

  const resolvedActiveSources = useMemo(() => {
    if (!activeClaim || !page?.sourceRefs?.length) return [];
    const ledgerClaim = claimLedgerById.get(activeClaim.claimId);
    if (ledgerClaim) {
      const ledgerSources = page.sourceRefs
        .map((source, index) => ({ ...source, citationIndex: index + 1 }))
        .filter(source => claimMatchesSource({ claim: ledgerClaim, source, citations: page.citations || [] }))
        .map(source => ({
          ...source,
          evidenceRole: claimContradictsSource({ claim: ledgerClaim, source, citations: page.citations || [] })
            ? 'contradicts'
            : 'supports'
        }));
      if (ledgerSources.length) return ledgerSources;
    }
    const contradictionIndexSet = new Set(activeClaim.contradictionIndexes || []);
    const supportingFallbackSources = (activeClaim.citationIndexes || [])
      .filter(index => !contradictionIndexSet.has(index))
      .map((index) => {
        const source = page.sourceRefs[index - 1];
        return source ? { ...source, citationIndex: index, evidenceRole: 'supports' } : null;
      })
      .filter(Boolean);
    const contradictionFallbackSources = (activeClaim.contradictionIndexes || [])
      .map((index) => {
        const source = page.sourceRefs[index - 1];
        return source ? { ...source, citationIndex: index, evidenceRole: 'contradicts' } : null;
      })
      .filter(Boolean);
    return [...supportingFallbackSources, ...contradictionFallbackSources];
  }, [activeClaim, claimLedgerById, page]);

  const currentClaimTexts = useMemo(() => (
    nonCriticalReady && lastVisit?.lastViewedAt ? extractClaimTexts(page?.body) : []
  ), [lastVisit?.lastViewedAt, nonCriticalReady, page?.body]);
  const claimLedgerDiff = useMemo(() => (
    nonCriticalReady && lastVisit?.lastViewedAt
      ? diffClaimLedgerSnapshots(lastVisit.ledgerSnapshot, page?.claims || [])
      : []
  ), [lastVisit?.lastViewedAt, lastVisit?.ledgerSnapshot, nonCriticalReady, page?.claims]);
  const visitDiff = useMemo(() => {
    if (!nonCriticalReady || !lastVisit?.lastViewedAt) return { added: [], removed: [], changed: [] };
    return {
      ...diffClaimSnapshots(lastVisit.claimSnapshot, currentClaimTexts),
      changed: claimLedgerDiff
    };
  }, [claimLedgerDiff, currentClaimTexts, lastVisit?.claimSnapshot, lastVisit?.lastViewedAt, nonCriticalReady]);

  const handleMarkReviewed = useCallback(() => {
    if (!page) return;
    const next = recordVisit(pageId, page.body, page.claims || []);
    setLastVisit(next);
  }, [page, pageId]);

  const loadMarkdown = useCallback(async () => {
    setMarkdownStatus('');
    try {
      return await getWikiPageMarkdown(pageId);
    } catch (_error) {
      setMarkdownStatus('Markdown export failed.');
      return '';
    }
  }, [pageId]);

  const handleCopyMarkdown = useCallback(async () => {
    const markdown = await loadMarkdown();
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setMarkdownStatus('Markdown copied.');
    } catch (_error) {
      setMarkdownStatus('Clipboard permission blocked copy.');
    }
  }, [loadMarkdown]);

  const handleDownloadMarkdown = useCallback(async () => {
    const markdown = await loadMarkdown();
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const slug = String(page?.slug || page?.title || 'wiki-page')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 90) || 'wiki-page';
    anchor.href = url;
    anchor.download = `${slug}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMarkdownStatus('Markdown downloaded.');
  }, [loadMarkdown, page?.slug, page?.title]);

  const tocItems = useMemo(() => extractTocItems(page?.body || emptyDoc), [page?.body]);
  const footnoteCitations = useMemo(() => collectFootnoteCitations(page?.body || emptyDoc), [page?.body]);
  const [activeTocId, setActiveTocId] = useState('');

  useEffect(() => {
    if (!tocItems.length) {
      setActiveTocId('');
      return undefined;
    }
    setActiveTocId(current => current || tocItems[0].id);
    let animationFrame = 0;
    const handleScroll = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const activationLine = Math.max(160, Math.min(window.innerHeight * 0.35, 320));
        const headingPositions = tocItems
          .map((item) => {
            const element = document.getElementById(item.id);
            const top = element?.getBoundingClientRect?.().top;
            return Number.isFinite(top) ? { ...item, top } : null;
          })
          .filter(Boolean);
        const hasMeasuredLayout = headingPositions.some(item => item.top !== 0);
        if (!hasMeasuredLayout) return;

        const previousHeading = headingPositions
          .filter(item => item.top <= activationLine)
          .sort((a, b) => b.top - a.top)[0];
        if (previousHeading) {
          setActiveTocId(previousHeading.id);
          return;
        }

        const nextHeading = headingPositions
          .filter(item => item.top > activationLine)
          .sort((a, b) => a.top - b.top)[0];
        if (nextHeading) setActiveTocId(nextHeading.id);
      });
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [tocItems]);

  const wordCount = useMemo(() => collectText(page?.body).split(/\s+/).filter(Boolean).length, [page?.body]);
  const bodyHasWikiLinks = useMemo(
    () => (nonCriticalReady ? hasInlineWikiLinks(page?.body) : true),
    [nonCriticalReady, page?.body]
  );
  const healthCounts = useMemo(
    () => (nonCriticalReady ? claimHealthCounts(page?.claims) : { supported: 0, partial: 0, unsupported: 0, conflicted: 0 }),
    [nonCriticalReady, page?.claims]
  );
  const qualityState = useMemo(
    () => (nonCriticalReady ? buildQualityState({ page, counts: healthCounts }) : null),
    [healthCounts, nonCriticalReady, page]
  );
  const infoboxRows = useMemo(() => buildInfoboxRows({
    page,
    sourceCount: (page?.sourceRefs || []).length,
    claimCount: (page?.claims || []).length,
    wordCount,
    lastReviewed: formatDate(lastVisit?.lastViewedAt)
  }), [page, wordCount, lastVisit?.lastViewedAt]);
  const activeLedgerClaim = activeClaim ? claimLedgerById.get(activeClaim.claimId) : null;
  const displayedActiveTocId = activeTocId || tocItems[0]?.id || '';
  const discussionCount = (page?.discussions || []).length;
  const showPageTalk = false;
  const showUtilityRail = false;

  useEffect(() => {
    const qualityStatus = String(page?.aiState?.quality?.status || page?.quality?.status || '').toLowerCase();
    const pageKey = `${pageId}:${page?.updatedAt || page?.aiState?.quality?.checkedAt || ''}`;
    if (workspaceMode || !page || !qualityState || maintaining || autoRebuildPageRef.current === pageKey) return;
    if (!['needs_rebuild', 'fail', 'failed'].includes(qualityStatus)) return;
    if (page?.aiState?.quality?.rebuiltAutomatically && qualityStatus !== 'needs_rebuild') return;
    autoRebuildPageRef.current = pageKey;
    handleMaintain();
  }, [handleMaintain, maintaining, page, pageId, qualityState, workspaceMode]);

  if (loading) return <main className="wiki-page"><p className="wiki-index__status">Loading Wiki page...</p></main>;
  if (!page) {
    return (
      <main className="wiki-page">
        <div className="wiki-index__error" role="alert">{error || 'Wiki page not found.'}</div>
      </main>
    );
  }
  return (
    <main className="wiki-page wiki-read">
      {(!workspaceMode || error) ? (
        <div className="wiki-read__topline">
          {!workspaceMode ? (
            <>
              <Button type="button" variant="secondary" onClick={() => navigate('/wiki')}>Back to Wiki</Button>
              <Button type="button" variant="secondary" onClick={onEdit}>Edit</Button>
            </>
          ) : null}
          {error ? <span className="wiki-editor__error" role="alert">{error}</span> : null}
        </div>
      ) : null}
      {nonCriticalReady ? (
        <Suspense fallback={null}>
          {!workspaceMode ? (
            <>
              <WikiChangesSinceLastVisit
                lastViewedAt={lastVisit?.lastViewedAt}
                added={visitDiff.added}
                removed={visitDiff.removed}
                changed={visitDiff.changed}
                onMarkReviewed={handleMarkReviewed}
              />
              <WikiBuildPageComposer compact className="wiki-read__build-page" />
            </>
          ) : null}
        </Suspense>
      ) : null}
      <div className={`wiki-read__layout${railCollapsed ? ' wiki-read__layout--rail-collapsed' : ''}`}>
        <aside className="wiki-read__toc">
          {tocItems.length ? (
            <nav aria-label="Page sections">
              <h2>Contents</h2>
              <ol>
                {tocItems.map(item => (
                  <li key={item.id} className={`wiki-read__toc-item wiki-read__toc-item--level-${item.level}`}>
                    <a
                      className={displayedActiveTocId === item.id ? 'is-active' : ''}
                      href={`#${item.id}`}
                      aria-current={displayedActiveTocId === item.id ? 'true' : undefined}
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
        </aside>
        <article
          className="wiki-read__article"
          onMouseOver={(event) => {
            handleClaimHover(event);
            handleLinkEnter(event);
          }}
          onMouseOut={(event) => {
            handleClaimLeave(event);
            handleLinkLeave(event);
          }}
          onFocus={handleClaimHover}
          onClick={handleCitationClick}
        >
          <header className="wiki-read__header">
            {/* AT-21 (Bucket 2 UI rework): the page header used to render an
                uppercase eyebrow, a 4-chip facts row, and a quality state
                card stacked above the title. All three duplicated what the
                right-rail infobox already surfaces, and together they were
                the loudest part of the page. The reader's eye should land
                on the title and run straight into the body — Wikipedia /
                Tolkien Gateway shape. Quality issues, page type, source
                count, and "last reviewed" all live in the rail infobox now.
                In workspace mode the agent will surface quality problems
                via chat notification (AT-26). */}
            <h1>{page.title || 'Untitled Wiki Page'}</h1>
            {!workspaceMode ? (
              <div className="wiki-read__exports" aria-label="Markdown export">
                <button type="button" onClick={handleCopyMarkdown}>Copy markdown</button>
                <button type="button" onClick={handleDownloadMarkdown}>Download .md</button>
                {markdownStatus ? <span role="status">{markdownStatus}</span> : null}
              </div>
            ) : null}
            {showPageTalk ? <div className="wiki-read__tabs" role="tablist" aria-label="Wiki page views">
              <button
                type="button"
                role="tab"
                id="wiki-read-tab-article"
                aria-selected={activeTab === 'article'}
                aria-controls="wiki-read-panel-article"
                className={activeTab === 'article' ? 'is-active' : ''}
                onClick={() => setActiveTab('article')}
              >
                Article
              </button>
              <button
                type="button"
                role="tab"
                id="wiki-read-tab-talk"
                aria-selected={activeTab === 'talk'}
                aria-controls="wiki-read-panel-talk"
                className={activeTab === 'talk' ? 'is-active' : ''}
                onClick={() => setActiveTab('talk')}
              >
                Talk
                {discussionCount ? <span>{discussionCount}</span> : null}
              </button>
            </div> : null}
          </header>
          {!showPageTalk || activeTab === 'article' ? (
            <section
              id="wiki-read-panel-article"
              role="tabpanel"
              aria-labelledby="wiki-read-tab-article"
            >
              <section className="wiki-read__body">
                {renderTiptapDoc(page.body || emptyDoc, { tocItems })}
              </section>
              <WikiReadReferences
                sources={page.sourceRefs || []}
                citations={footnoteCitations}
                highlightedRef={highlightedRef}
                onJumpBack={handleReferenceBacklink}
              />
              {showUtilityRail ? <WikiMentionedInFooter pageId={pageId} pageTitle={page.title} /> : null}
            </section>
          ) : (
            <section
              id="wiki-read-panel-talk"
              role="tabpanel"
              aria-labelledby="wiki-read-tab-talk"
              className="wiki-read__talk"
            >
              <Suspense fallback={null}>
                <WikiDiscussions
                  discussions={page.discussions || []}
                  onPromote={handlePromoteDiscussion}
                  promotingId={promotingDiscussionId}
                />
                <WikiAskComposer onAsk={handleAsk} busy={asking} />
              </Suspense>
            </section>
          )}
        </article>
        <aside
          className={`wiki-read__rail${railCollapsed ? ' wiki-read__rail--collapsed' : ''}`}
          aria-label="Page context"
        >
          {railCollapsed || !nonCriticalReady ? (
            <button
              type="button"
              className="wiki-read__rail-toggle wiki-read__rail-toggle--show"
              onClick={() => setRailCollapsed(false)}
              aria-expanded="false"
              aria-controls="wiki-read-rail-content"
              title="Show context"
            >
              <span aria-hidden="true">›</span>
              <span className="wiki-read__rail-toggle-label">Show context</span>
            </button>
          ) : (
            <div id="wiki-read-rail-content" className="wiki-read__rail-content">
              <Suspense fallback={null}>
                <button
                  type="button"
                  className="wiki-read__rail-toggle wiki-read__rail-toggle--hide"
                  onClick={() => setRailCollapsed(true)}
                  aria-expanded="true"
                  aria-controls="wiki-read-rail-content"
                  title="Hide context"
                >
                  <span aria-hidden="true">‹</span>
                  <span className="wiki-read__rail-toggle-label">Hide</span>
                </button>
                <section className="wiki-read__infobox wiki-read__infobox--structured">
                  <h2>{labelFor(page.pageType || 'topic')}</h2>
                  <dl>
                    {infoboxRows.map(row => (
                      <div key={row.label}>
                        <dt>{row.label}</dt>
                        <dd>{row.value || 'Unknown'}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
                {showUtilityRail && !bodyHasWikiLinks ? (
                  <WikiAutolinkSuggestions pageId={pageId} pageTitle={page.title} />
                ) : null}
                {showUtilityRail ? <section className="wiki-read__infobox wiki-read__claim-health">
                  <h2>Claim health</h2>
                  <ul>
                    <li>{healthCounts.supported} supported</li>
                    <li>{healthCounts.partial} partial</li>
                    <li>{healthCounts.unsupported} unsupported</li>
                    <li>{healthCounts.conflicted} conflicted</li>
                  </ul>
                </section> : null}
                {showUtilityRail && (page.sourceRefs || []).length ? (
                  <section className="wiki-read__infobox wiki-read__source-list">
                    <h2>Sources</h2>
                    <ol>
                      {(page.sourceRefs || []).slice(0, 8).map((source, index) => {
                        const excerpt = sourceExcerpt(source);
                        const counts = sourceEvidenceCounts({
                          source,
                          claims: page.claims || [],
                          citations: page.citations || []
                        });
                        const countLabel = formatSourceCounts(counts);
                        const isLong = excerpt.length > 180;
                        return (
                          <li key={source._id || source.id || `${source.title}-${index}`}>
                            <span>{source.title || 'Untitled source'}</span>
                            {excerpt ? <p>{conciseText(excerpt)}</p> : null}
                            {countLabel ? <small>{countLabel}</small> : null}
                            {isLong ? (
                              <details>
                                <summary>More</summary>
                                <p>{excerpt}</p>
                              </details>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ) : null}
              </Suspense>
            </div>
          )}
        </aside>
      </div>
      {activeClaim ? (
        <ClaimCitationPopover
          anchorRect={activeClaim.anchorRect}
          support={activeLedgerClaim?.support || activeClaim.support}
          claim={activeLedgerClaim}
          sources={resolvedActiveSources}
          onClose={() => setActiveClaim(null)}
        />
      ) : null}
      <WikiLinkPreview
        preview={preview}
        onMouseEnter={handlePreviewEnter}
        onMouseLeave={handlePreviewLeave}
      />
    </main>
  );
};

export default WikiPageReadView;
