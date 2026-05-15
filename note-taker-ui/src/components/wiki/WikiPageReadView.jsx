import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../ui';
import {
  askWikiPage,
  getWikiBacklinks,
  getWikiPage,
  maintainWikiPage,
  promoteWikiDiscussion
} from '../../api/wiki';
import { trackWikiQaPromoted, trackWikiReadModePageView } from '../../utils/wikiAnalytics';
import ClaimCitationPopover from './ClaimCitationPopover';
import WikiAgentPresence from './WikiAgentPresence';
import WikiAskComposer from './WikiAskComposer';
import WikiAutolinkSuggestions from './WikiAutolinkSuggestions';
import WikiChangesSinceLastVisit from './WikiChangesSinceLastVisit';
import WikiDiscussions from './WikiDiscussions';
import renderTiptapDoc, { extractTocItems, firstParagraphText } from './renderTiptapDoc';
import {
  diffClaimLedgerSnapshots,
  diffClaimSnapshots,
  extractClaimTexts,
  getLastVisitState,
  recordVisit
} from './wikiVisitTracker';
import { SUPPORT_STATES } from './extensions/Claim';

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

const HEALTH_LABELS = {
  newItems: 'new source signals',
  unsupportedClaims: 'unsupported claims',
  missingCitations: 'missing citations',
  staleSections: 'stale sections',
  contradictions: 'contradictions'
};

const normalizeQualityIssueText = (issue = '') => {
  if (typeof issue === 'string') return issue.trim();
  if (!issue || typeof issue !== 'object') return '';
  return String(issue.text || issue.message || issue.summary || issue.title || issue.reason || '').trim();
};

const collectQualityIssues = (page = {}) => {
  const aiState = page?.aiState || {};
  const health = aiState.health || {};
  const healthIssues = Object.entries(HEALTH_LABELS).flatMap(([key, label]) => {
    const items = Array.isArray(health[key]) ? health[key] : [];
    return items.map((item) => ({
      key,
      label,
      text: normalizeQualityIssueText(item)
    }));
  });
  const explicitIssueSources = [
    page?.qualityIssues,
    page?.quality?.issues,
    page?.quality?.failures,
    page?.quality?.qualityIssues,
    aiState?.qualityIssues,
    aiState?.quality?.issues,
    aiState?.quality?.failures,
    aiState?.maintenanceQualityIssues
  ];
  const explicitIssues = explicitIssueSources
    .filter(Array.isArray)
    .flatMap(issues => issues.map((issue) => ({
      key: 'qualityIssues',
      label: 'quality issues',
      text: normalizeQualityIssueText(issue)
    })));
  return [...explicitIssues, ...healthIssues].filter(issue => issue.text || issue.label);
};

const buildQualityState = ({ page = {}, counts = {} }) => {
  const claims = Array.isArray(page?.claims) ? page.claims : [];
  const issues = collectQualityIssues(page);
  const qualityStatus = String(page?.aiState?.quality?.status || page?.quality?.status || '').toLowerCase();
  const explicitNeedsRebuild = ['needs_rebuild', 'fail', 'failed'].includes(qualityStatus);
  const weakClaimCount = (counts.partial || 0) + (counts.unsupported || 0) + (counts.conflicted || 0);
  const weakClaimRatio = claims.length ? weakClaimCount / claims.length : 0;
  const missingSourceEvidence = claims.length > 0 && !(page?.sourceRefs || []).length;
  const weakClaimHealth = weakClaimCount > 0 && (weakClaimRatio >= 0.34 || (counts.unsupported || 0) + (counts.conflicted || 0) > 0);
  if (!explicitNeedsRebuild && !issues.length && !weakClaimHealth && !missingSourceEvidence) return null;
  const severeIssue = explicitNeedsRebuild
    || missingSourceEvidence
    || issues.some(issue => /scaffold|placeholder|too thin|source dump|missing source/i.test(issue.text || issue.label || ''));
  const title = severeIssue ? 'Needs rebuild' : 'Needs review';
  const summary = severeIssue
    ? 'The page has structural or evidence problems that can make the article misleading.'
    : 'The article is usable, but new signals or weak claims should be reviewed.';
  const reasons = [
    ...issues.slice(0, 3).map(issue => issue.text || labelFor(issue.label)),
    missingSourceEvidence ? 'Claims have no attached sources.' : '',
    weakClaimHealth ? `${weakClaimCount} of ${claims.length} claim${claims.length === 1 ? '' : 's'} need stronger support.` : ''
  ].filter(Boolean);
  return {
    title,
    summary,
    severity: severeIssue ? 'rebuild' : 'review',
    reasons: Array.from(new Set(reasons)).slice(0, 4),
    issueCount: issues.length,
    weakClaimCount
  };
};

const sectionTitles = (body) => extractTocItems(body || emptyDoc)
  .filter(item => item.level === 2)
  .map(item => item.title)
  .slice(0, 3)
  .join(', ');

const buildInfoboxRows = ({ page = {}, sourceCount = 0, claimCount = 0, lastReviewed = 'Not reviewed' }) => {
  const value = page || {};
  const meta = pageMeta(value);
  const type = String(value.pageType || 'topic').toLowerCase();
  const firstSource = Array.isArray(value.sourceRefs) ? value.sourceRefs[0] || {} : {};
  const baseRows = [
    { label: 'Status', value: labelFor(value.status || 'draft') },
    { label: 'Sources', value: sourceCount },
    { label: 'Claims', value: claimCount },
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
              <Link to={`/wiki/${entry.pageId}`}>
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

const WikiPageReadView = ({ pageId, onEdit }) => {
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
  const previewTimerRef = useRef(null);
  const previewDismissTimerRef = useRef(null);
  const latestPageRef = useRef(null);
  const autoRebuildPageRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    setActiveTab('article');
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const loaded = await getWikiPage(pageId);
        if (cancelled) return;
        latestPageRef.current = loaded;
        setPage(loaded);
        setLastVisit(getLastVisitState(pageId));
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
  }, [onEdit]);

  const handleMaintain = useCallback(async () => {
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
  }, [pageId]);

  const handleAsk = async (question) => {
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
      if (createdPage?._id) navigate(`/wiki/${createdPage._id}`);
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

  const visitDiff = useMemo(() => {
    if (!lastVisit?.lastViewedAt) return { added: [], removed: [], changed: [] };
    return {
      ...diffClaimSnapshots(lastVisit.claimSnapshot, extractClaimTexts(page?.body)),
      changed: diffClaimLedgerSnapshots(lastVisit.ledgerSnapshot, page?.claims || [])
    };
  }, [lastVisit, page]);

  const handleMarkReviewed = useCallback(() => {
    if (!page) return;
    const next = recordVisit(pageId, page.body, page.claims || []);
    setLastVisit(next);
  }, [page, pageId]);

  const tocItems = useMemo(() => extractTocItems(page?.body || emptyDoc), [page?.body]);
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
  const bodyHasWikiLinks = useMemo(() => hasInlineWikiLinks(page?.body), [page?.body]);
  const healthCounts = useMemo(() => claimHealthCounts(page?.claims), [page?.claims]);
  const qualityState = useMemo(() => buildQualityState({ page, counts: healthCounts }), [page, healthCounts]);
  const infoboxRows = useMemo(() => buildInfoboxRows({
    page,
    sourceCount: (page?.sourceRefs || []).length,
    claimCount: (page?.claims || []).length,
    lastReviewed: formatDate(lastVisit?.lastViewedAt)
  }), [page, lastVisit?.lastViewedAt]);
  const activeLedgerClaim = activeClaim ? claimLedgerById.get(activeClaim.claimId) : null;
  const displayedActiveTocId = activeTocId || tocItems[0]?.id || '';
  const discussionCount = (page?.discussions || []).length;

  useEffect(() => {
    const qualityStatus = String(page?.aiState?.quality?.status || page?.quality?.status || '').toLowerCase();
    const pageKey = `${pageId}:${page?.updatedAt || page?.aiState?.quality?.checkedAt || ''}`;
    if (!page || !qualityState || maintaining || autoRebuildPageRef.current === pageKey) return;
    if (!['needs_rebuild', 'fail', 'failed'].includes(qualityStatus)) return;
    if (page?.aiState?.quality?.rebuiltAutomatically && qualityStatus !== 'needs_rebuild') return;
    autoRebuildPageRef.current = pageKey;
    handleMaintain();
  }, [handleMaintain, maintaining, page, pageId, qualityState]);

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
      <div className="wiki-read__topline">
        <Button type="button" variant="secondary" onClick={() => navigate('/wiki')}>Back to Wiki</Button>
        <Button type="button" variant="secondary" onClick={onEdit}>Edit</Button>
        {error ? <span className="wiki-editor__error" role="alert">{error}</span> : null}
      </div>
      <WikiChangesSinceLastVisit
        lastViewedAt={lastVisit?.lastViewedAt}
        added={visitDiff.added}
        removed={visitDiff.removed}
        changed={visitDiff.changed}
        onMarkReviewed={handleMarkReviewed}
      />
      <div className="wiki-read__layout">
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
        >
          <header className="wiki-read__header">
            <p className="wiki-read__eyebrow">{labelFor(page.pageType || 'topic')}</p>
            <h1>{page.title || 'Untitled Wiki Page'}</h1>
            <div className="wiki-read__facts" aria-label="Wiki page facts">
              <span>{labelFor(page.pageType || 'topic')}</span>
              <span>{(page.sourceRefs || []).length} source{(page.sourceRefs || []).length === 1 ? '' : 's'}</span>
              <span>{formatDate(lastVisit?.lastViewedAt)}</span>
              <span>{wordCount} words</span>
            </div>
            {qualityState ? (
              <aside className="wiki-read__quality" aria-label="Wiki page quality">
                <div>
                  <strong>{qualityState.title}</strong>
                  <span>{qualityState.summary}</span>
                </div>
                {qualityState.reasons.length ? (
                  <ul>
                    {qualityState.reasons.map(reason => <li key={reason}>{reason}</li>)}
                  </ul>
                ) : null}
              </aside>
            ) : null}
            <div className="wiki-read__tabs" role="tablist" aria-label="Wiki page views">
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
            </div>
          </header>
          {activeTab === 'article' ? (
            <section
              id="wiki-read-panel-article"
              role="tabpanel"
              aria-labelledby="wiki-read-tab-article"
            >
              <section className="wiki-read__body">
                {renderTiptapDoc(page.body || emptyDoc, { tocItems })}
              </section>
              <WikiMentionedInFooter pageId={pageId} pageTitle={page.title} />
            </section>
          ) : (
            <section
              id="wiki-read-panel-talk"
              role="tabpanel"
              aria-labelledby="wiki-read-tab-talk"
              className="wiki-read__talk"
            >
              <WikiDiscussions
                discussions={page.discussions || []}
                onPromote={handlePromoteDiscussion}
                promotingId={promotingDiscussionId}
              />
              <WikiAskComposer onAsk={handleAsk} busy={asking} />
            </section>
          )}
        </article>
        <aside className="wiki-read__rail" aria-label="Page context">
          <WikiAgentPresence page={page} isMaintaining={maintaining} onMaintain={handleMaintain} />
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
          {!bodyHasWikiLinks ? (
            <WikiAutolinkSuggestions pageId={pageId} pageTitle={page.title} />
          ) : null}
          <section className="wiki-read__infobox wiki-read__claim-health">
            <h2>Claim health</h2>
            <ul>
              <li>{healthCounts.supported} supported</li>
              <li>{healthCounts.partial} partial</li>
              <li>{healthCounts.unsupported} unsupported</li>
              <li>{healthCounts.conflicted} conflicted</li>
            </ul>
          </section>
          {(page.sourceRefs || []).length ? (
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
