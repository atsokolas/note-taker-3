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

const cssEscape = (value = '') => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return String(value || '').replace(/["\\]/g, '\\$&');
};

const scheduleAfterFirstPaint = (callback) => {
  let frame = 0;
  let idle = 0;
  let timeout = 0;
  let fallback = 0;
  let didRun = false;
  const runCallback = () => {
    if (didRun) return;
    didRun = true;
    if (fallback) window.clearTimeout(fallback);
    callback();
  };
  const run = () => {
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(runCallback, { timeout: 250 });
      return;
    }
    timeout = window.setTimeout(runCallback, 0);
  };
  if (typeof window.requestAnimationFrame === 'function') frame = window.requestAnimationFrame(run);
  else timeout = window.setTimeout(runCallback, 0);
  fallback = window.setTimeout(runCallback, 3000);
  return () => {
    if (frame && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame);
    if (idle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
    if (timeout) window.clearTimeout(timeout);
    if (fallback) window.clearTimeout(fallback);
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

const normalizeHeadingText = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[\s\p{Punctuation}]+/gu, ' ')
  .trim();

const stripLeadingDuplicateTitleHeading = (body = emptyDoc, title = '') => {
  const normalizedTitle = normalizeHeadingText(title);
  if (!body || !Array.isArray(body.content) || !normalizedTitle) return body || emptyDoc;
  const first = body.content[0];
  if (first?.type !== 'heading') return body;
  const headingText = normalizeHeadingText(collectText(first));
  if (headingText !== normalizedTitle) return body;
  return { ...body, content: body.content.slice(1) };
};

const splitTitleAccent = (title = '') => {
  const text = String(title || '').trim() || 'Untitled Wiki Page';
  const explicitMatch = text.match(/^(.*?)\*([^*]+)\*(.*)$/);
  if (explicitMatch?.[2]?.trim()) {
    return {
      before: explicitMatch[1].trim(),
      accent: explicitMatch[2].trim(),
      after: explicitMatch[3].trim()
    };
  }
  const words = text.match(/\S+/g) || [];
  if (words.length < 2) return { before: '', accent: text, after: '' };
  const stopWords = new Set([
    'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with'
  ]);
  const accentIndex = words.reduce((selected, word, index) => {
    const cleaned = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleaned.length < 4 || stopWords.has(cleaned)) return selected;
    return index;
  }, words.length - 1);
  return {
    before: words.slice(0, accentIndex).join(' '),
    accent: words[accentIndex],
    after: words.slice(accentIndex + 1).join(' ')
  };
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

const countClaimMarks = (node, out = new Set()) => {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach(child => countClaimMarks(child, out));
    return out;
  }
  if (typeof node !== 'object') return out;
  (node.marks || []).forEach((mark) => {
    if (mark?.type !== 'claim') return;
    const attrs = mark.attrs || {};
    if (attrs.claimId) out.add(String(attrs.claimId));
    else out.add(`${collectText(node).slice(0, 120)}:${out.size}`);
  });
  if (Array.isArray(node.content)) countClaimMarks(node.content, out);
  return out;
};

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

const conciseInfoboxText = (value = '', { maxChars = 140, maxWords = 12 } = {}) => {
  const text = cleanSourceText(value);
  if (!text) return '';
  const words = text.split(/\s+/).filter(Boolean);
  const wordLimited = words.length > maxWords
    ? `${words.slice(0, maxWords).join(' ')}...`
    : text;
  if (wordLimited.length <= maxChars) return wordLimited;
  const truncated = wordLimited.slice(0, maxChars).replace(/\s+\S*$/, '').trim();
  return `${truncated || wordLimited.slice(0, maxChars).trim()}...`;
};

const conciseScopeText = (value = '') => conciseInfoboxText(value, { maxChars: 140, maxWords: 12 });

const autoInfoboxSummary = (body) => conciseInfoboxText(firstParagraphText(body), { maxChars: 140, maxWords: 12 });

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

const countPageSources = (page = {}) => {
  const value = page || {};
  const explicit = Number(value.sourceCount ?? value.sourcesCount);
  const sourceRefs = Array.isArray(value.sourceRefs) ? value.sourceRefs.length : 0;
  const sources = Array.isArray(value.sources) ? value.sources.length : 0;
  const citations = Array.isArray(value.citations)
    ? new Set(value.citations.map(citation => citation.sourceRefId || citation.sourceId).filter(Boolean)).size
    : 0;
  return Math.max(
    Number.isFinite(explicit) ? explicit : 0,
    sourceRefs,
    sources,
    citations
  );
};

const countPageClaims = (page = {}) => {
  const value = page || {};
  const explicit = Number(value.claimCount ?? value.claimsCount);
  const claims = Array.isArray(value.claims) ? value.claims.length : 0;
  const citationsWithClaims = Array.isArray(value.citations)
    ? new Set(value.citations.map(citation => citation.claimId).filter(Boolean)).size
    : 0;
  const markedClaims = countClaimMarks(value.body).size;
  return Math.max(
    Number.isFinite(explicit) ? explicit : 0,
    claims,
    citationsWithClaims,
    markedClaims
  );
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
  const summaryText = conciseInfoboxText(meta.summary || meta.scope || '') || autoInfoboxSummary(value.body);
  const sectionText = sectionTitles(value.body);
  const scopeText = conciseScopeText(meta.scope || meta.summary || '')
    || (sectionText ? `Covers ${sectionText}.` : 'No explicit scope yet.');
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
      { label: 'Scope', value: scopeText },
      { label: 'Sections', value: pickFirst(sectionTitles(value.body), 'No sections yet') },
      { label: 'Discussions', value: `${(value.discussions || []).length} discussion${(value.discussions || []).length === 1 ? '' : 's'}` },
      ...baseRows
    ];
  }

  return [
    { label: 'Kind', value: labelFor(value.pageType || 'topic') },
    { label: 'Summary', value: summaryText },
    { label: 'Sections', value: pickFirst(sectionTitles(value.body), 'No sections yet') },
    ...baseRows
  ];
};

const WIKI_LINK_PREVIEW_SHOW_DELAY_MS = 250;
const WIKI_LINK_PREVIEW_DISMISS_GRACE_MS = 100;
const NUMERIC_TWEEN_DURATION_MS = 800;
const PAGE_TRANSITION_DURATION_MS = 200;

const useReducedMotion = () => {
  const getReducedMotion = () => (
    typeof window !== 'undefined'
      ? Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
      : false
  );
  const [reducedMotion, setReducedMotion] = useState(getReducedMotion);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const handleChange = () => setReducedMotion(Boolean(query.matches));
    query.addEventListener?.('change', handleChange);
    query.addListener?.(handleChange);
    return () => {
      query.removeEventListener?.('change', handleChange);
      query.removeListener?.(handleChange);
    };
  }, []);

  return reducedMotion;
};

const useRafTweenedNumber = (targetValue, { duration = NUMERIC_TWEEN_DURATION_MS, resetKey = '' } = {}) => {
  const target = Number.isFinite(Number(targetValue)) ? Number(targetValue) : 0;
  const reducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(() => (reducedMotion ? target : 0));
  const displayRef = useRef(displayValue);
  const previousResetKeyRef = useRef(resetKey);

  useEffect(() => {
    displayRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    if (reducedMotion) {
      setDisplayValue(target);
      displayRef.current = target;
      return undefined;
    }

    const startValue = previousResetKeyRef.current === resetKey ? displayRef.current : 0;
    previousResetKeyRef.current = resetKey;
    if (startValue === target) {
      setDisplayValue(target);
      displayRef.current = target;
      return undefined;
    }

    let frame = 0;
    let startTime = 0;
    const requestFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(() => callback(Date.now()), 16));
    const cancelFrame = window.cancelAnimationFrame || window.clearTimeout;
    const animate = (time) => {
      if (!startTime) startTime = time;
      const progress = Math.min(1, (time - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = startValue + ((target - startValue) * eased);
      displayRef.current = nextValue;
      setDisplayValue(nextValue);
      if (progress < 1) frame = requestFrame(animate);
      else {
        displayRef.current = target;
        setDisplayValue(target);
      }
    };

    frame = requestFrame(animate);
    return () => {
      if (frame) cancelFrame(frame);
    };
  }, [duration, reducedMotion, resetKey, target]);

  return Math.round(displayValue);
};

const AnimatedNumber = ({ value, className = '', resetKey = '' }) => {
  const displayValue = useRafTweenedNumber(value, { resetKey });
  return (
    <span className={`wiki-numeric-value${className ? ` ${className}` : ''}`}>
      {displayValue.toLocaleString()}
    </span>
  );
};

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
      <span className="wiki-read-link-preview__meta">{sourceCount} source{sourceCount === 1 ? '' : 's'}</span>
    </aside>
  );
};

const InfoboxValue = ({ value, pageId, label }) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return <AnimatedNumber value={value} resetKey={`${pageId}:${label}`} />;
  }
  return value === null || value === undefined || value === '' ? 'Unknown' : value;
};

const InfoboxRow = ({ row, pageId }) => {
  const previousValueRef = useRef(row.value);
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    if (previousValueRef.current === row.value) return undefined;
    previousValueRef.current = row.value;
    setUpdated(true);
    const timeout = window.setTimeout(() => setUpdated(false), 900);
    return () => window.clearTimeout(timeout);
  }, [row.value]);

  return (
    <div
      data-infobox-row={String(row.label).toLowerCase().replace(/\s+/g, '-')}
      className={updated ? 'wiki-read__infobox-row is-updated' : 'wiki-read__infobox-row'}
    >
      <dt>{row.label}</dt>
      <dd><InfoboxValue value={row.value} pageId={pageId} label={row.label} /></dd>
    </div>
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

const WikiReadTitle = ({ title = '' }) => {
  const parts = splitTitleAccent(title);
  return (
    <h1>
      {parts.before ? <>{parts.before} </> : null}
      <em>{parts.accent}</em>
      {parts.after ? <> {parts.after}</> : null}
    </h1>
  );
};

const MARGINALIA_COLLAPSED_LIMIT = 4;

const WikiReadMarginalia = ({ sources = [], citations = [], onJumpToReference }) => {
  const [expanded, setExpanded] = useState(false);
  if (!sources.length || !citations.length) return null;
  const seen = new Set();
  const items = citations
    .filter((citation) => {
      if (!citation?.index || seen.has(citation.index)) return false;
      seen.add(citation.index);
      return Boolean(sources[citation.index - 1]);
    })
    .map(citation => ({
      citation,
      source: sources[citation.index - 1]
    }));
  if (!items.length) return null;
  const hiddenCount = Math.max(items.length - MARGINALIA_COLLAPSED_LIMIT, 0);
  const visibleItems = expanded ? items : items.slice(0, MARGINALIA_COLLAPSED_LIMIT);
  return (
    <aside className={`wiki-read__marginalia${expanded ? ' is-expanded' : ' is-collapsed'}`} aria-label="Citation previews">
      {visibleItems.map(({ citation, source }) => {
        const refId = `wiki-ref-${citation.index}`;
        const excerpt = sourceExcerpt(source);
        return (
          <a
            key={`${refId}-${source._id || source.id || source.title || 'source'}`}
            className="wiki-read__margin-note"
            href={`#${refId}`}
            onClick={(event) => {
              event.preventDefault();
              onJumpToReference?.(refId);
            }}
          >
            <span className="wiki-read__margin-note-index">[{citation.index}]</span>
            <strong>{source.title || 'Untitled source'}</strong>
            {excerpt ? <span>{conciseText(excerpt, 120)}</span> : null}
          </a>
        );
      })}
      {hiddenCount ? (
        <button
          type="button"
          className="wiki-read__margin-note-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(current => !current)}
        >
          {expanded ? 'Show fewer citation previews' : `Show ${hiddenCount} more citation preview${hiddenCount === 1 ? '' : 's'}`}
        </button>
      ) : null}
    </aside>
  );
};

const WikiPageReadView = ({ pageId, onEdit, workspaceMode = false, refreshNonce = 0, liveUpdate = null }) => {
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
  const [recentParagraphAnchors, setRecentParagraphAnchors] = useState(() => new Set());
  const [recentTocIds, setRecentTocIds] = useState(() => new Set());
  const [liveUpdateToast, setLiveUpdateToast] = useState(null);
  const [nonCriticalReady, setNonCriticalReady] = useState(false);
  const [pageTransitionState, setPageTransitionState] = useState('idle');
  const reducedMotion = useReducedMotion();
  const [showMarginalia, setShowMarginalia] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(min-width: 1280px)').matches;
  });
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
  const lastRefreshNonceRef = useRef(0);
  const articleRef = useRef(null);
  const recentParagraphTimersRef = useRef(new Map());
  const pageTransitionTimerRef = useRef(null);
  const reducedMotionRef = useRef(reducedMotion);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    let cancelled = false;
    const recentParagraphTimers = recentParagraphTimersRef.current;
    const hasMountedPage = Boolean(latestPageRef.current);
    const prefersReducedMotion = reducedMotionRef.current;
    setActiveTab('article');
    setNonCriticalReady(false);
    if (pageTransitionTimerRef.current) {
      clearTimeout(pageTransitionTimerRef.current);
      pageTransitionTimerRef.current = null;
    }
    setPageTransitionState(hasMountedPage && !prefersReducedMotion ? 'exiting' : 'idle');
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const loaded = await getWikiPage(pageId);
        if (cancelled) return;
        latestPageRef.current = loaded;
        setPage(loaded);
        if (hasMountedPage && !prefersReducedMotion) {
          setPageTransitionState('entering');
          pageTransitionTimerRef.current = window.setTimeout(() => {
            pageTransitionTimerRef.current = null;
            setPageTransitionState('idle');
          }, PAGE_TRANSITION_DURATION_MS);
        } else {
          setPageTransitionState('idle');
        }
        trackWikiReadModePageView({
          pageId,
          pageType: loaded.pageType || '',
          sourceCount: Array.isArray(loaded.sourceRefs) ? loaded.sourceRefs.length : 0,
          claimCount: Array.isArray(loaded.claims) ? loaded.claims.length : 0
        });
      } catch (_error) {
        if (!cancelled) {
          setError('Failed to load Wiki page.');
          setPageTransitionState('idle');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (previewDismissTimerRef.current) clearTimeout(previewDismissTimerRef.current);
      recentParagraphTimers.forEach(timer => clearTimeout(timer));
      recentParagraphTimers.clear();
      if (pageTransitionTimerRef.current) {
        clearTimeout(pageTransitionTimerRef.current);
        pageTransitionTimerRef.current = null;
      }
    };
  }, [pageId]);

  useEffect(() => {
    if (!latestPageRef.current || !refreshNonce || lastRefreshNonceRef.current === refreshNonce) return undefined;
    lastRefreshNonceRef.current = refreshNonce;
    let cancelled = false;
    getWikiPage(pageId)
      .then((loaded) => {
        if (cancelled) return;
        latestPageRef.current = loaded;
        setPage(loaded);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to refresh Wiki page.');
      });
    return () => { cancelled = true; };
  }, [pageId, refreshNonce]);

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

  // AT-288: wikilinks render as raw <a href="/wiki/:id"> (see renderTiptapDoc).
  // Intercept plain left-clicks so concept-to-concept navigation stays in-app
  // and rides the page-switch View Transition instead of doing a full reload.
  // Modifier-clicks (open-in-new-tab) and non-primary buttons fall through to
  // the browser's native behavior.
  const handleInternalLinkClick = useCallback((event) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target.closest?.('.wiki-internal-link');
    const targetPageId = target?.getAttribute?.('data-wiki-page-id');
    if (!targetPageId) return;
    event.preventDefault();
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    setPreview(null);
    const go = () => navigate(wikiPagePath(targetPageId));
    if (typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
      document.startViewTransition(go);
    } else {
      go();
    }
  }, [navigate]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(min-width: 1280px)');
    const update = () => setShowMarginalia(Boolean(query.matches));
    update();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    if (typeof query.addListener === 'function') {
      query.addListener(update);
      return () => query.removeListener(update);
    }
    return undefined;
  }, []);

  const handleReferenceBacklink = useCallback((citationId = '') => {
    scrollToElementId(citationId);
  }, []);

  const handleLiveUpdateJump = useCallback((anchorId = '') => {
    if (!anchorId) return;
    if (scrollToElementId(anchorId)) setLiveUpdateToast(null);
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

  const displayBody = useMemo(
    () => stripLeadingDuplicateTitleHeading(page?.body || emptyDoc, page?.title || ''),
    [page?.body, page?.title]
  );
  const bodyTocItems = useMemo(() => extractTocItems(displayBody), [displayBody]);
  const tocItems = useMemo(() => {
    const hasReferences = Array.isArray(page?.sourceRefs) && page.sourceRefs.length > 0;
    if (!hasReferences || bodyTocItems.some(item => item.id === 'wiki-read-references-title')) {
      return bodyTocItems;
    }
    return [
      ...bodyTocItems,
      {
        id: 'wiki-read-references-title',
        title: 'References',
        level: 2,
        blockIndex: Number.MAX_SAFE_INTEGER
      }
    ];
  }, [bodyTocItems, page?.sourceRefs]);
  const footnoteCitations = useMemo(() => collectFootnoteCitations(displayBody), [displayBody]);
  const [activeTocId, setActiveTocId] = useState('');

  useEffect(() => {
    if (!tocItems.length) {
      setActiveTocId('');
      return undefined;
    }
    setActiveTocId(current => current || tocItems[0].id);
    let animationFrame = 0;
    let scrollRoot = window;
    const rootMetrics = () => {
      if (!scrollRoot || scrollRoot === window) {
        return { top: 0, height: window.innerHeight || 900 };
      }
      const rect = scrollRoot.getBoundingClientRect?.();
      return {
        top: Number.isFinite(rect?.top) ? rect.top : 0,
        height: Number.isFinite(rect?.height) && rect.height > 0 ? rect.height : window.innerHeight || 900
      };
    };
    const handleScroll = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const root = rootMetrics();
        const activationLine = root.top + Math.max(120, Math.min(root.height * 0.3, 260));
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
    const scrollTargets = [window];
    const firstHeading = document.getElementById(tocItems[0]?.id);
    let scrollParent = firstHeading?.parentElement || null;
    while (scrollParent && scrollParent !== document.body && scrollParent !== document.documentElement) {
      const style = window.getComputedStyle(scrollParent);
      const canScroll = scrollParent.scrollHeight > scrollParent.clientHeight;
      if (canScroll && /(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`)) {
        scrollTargets.push(scrollParent);
        scrollRoot = scrollParent;
        break;
      }
      scrollParent = scrollParent.parentElement;
    }
    const workspacePane = articleRef.current?.closest?.('.wiki-workspace__right-pane');
    if (workspacePane && !scrollTargets.includes(workspacePane)) {
      scrollTargets.push(workspacePane);
      scrollRoot = workspacePane;
    }
    handleScroll();
    scrollTargets.forEach(target => target.addEventListener('scroll', handleScroll, { passive: true }));
    window.addEventListener('resize', handleScroll);
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      scrollTargets.forEach(target => target.removeEventListener('scroll', handleScroll));
      window.removeEventListener('resize', handleScroll);
    };
  }, [tocItems]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return undefined;

    let animationFrame = 0;
    const updateProgress = () => {
      if (animationFrame) return;
      const run = () => {
        animationFrame = 0;
        const rect = article.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
        const distance = Math.max(1, rect.height - viewportHeight + 120);
        const progress = Math.min(1, Math.max(0, (0 - rect.top) / distance));
        article.style.setProperty('--wiki-reading-progress', progress.toFixed(4));
      };
      animationFrame = window.requestAnimationFrame
        ? window.requestAnimationFrame(run)
        : window.setTimeout(run, 0);
    };

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true, capture: true });
    window.addEventListener('resize', updateProgress);
    return () => {
      if (animationFrame) {
        if (window.cancelAnimationFrame) window.cancelAnimationFrame(animationFrame);
        else window.clearTimeout(animationFrame);
      }
      window.removeEventListener('scroll', updateProgress, true);
      window.removeEventListener('resize', updateProgress);
    };
  }, [displayBody, pageId]);

  const wordCount = useMemo(() => collectText(displayBody).split(/\s+/).filter(Boolean).length, [displayBody]);
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
    sourceCount: countPageSources(page),
    claimCount: countPageClaims(page),
    wordCount,
    lastReviewed: formatDate(
      page?.aiState?.lastReviewedAt
      || page?.aiState?.lastDraftedAt
      || page?.lastReviewedAt
      || page?.updatedAt
    )
  }), [page, wordCount]);
  const activeLedgerClaim = activeClaim ? claimLedgerById.get(activeClaim.claimId) : null;
  const displayedActiveTocId = activeTocId || tocItems[0]?.id || '';
  const discussionCount = (page?.discussions || []).length;
  const showPageTalk = false;
  const showUtilityRail = false;

  const clearRecentTocId = useCallback((tocId = '') => {
    if (!tocId) return;
    setRecentTocIds(current => {
      if (!current.has(tocId)) return current;
      const next = new Set(current);
      next.delete(tocId);
      return next;
    });
  }, []);

  const handleTocClick = useCallback((event, tocId = '') => {
    clearRecentTocId(tocId);
    if (liveUpdateToast?.tocId === tocId) setLiveUpdateToast(null);
  }, [clearRecentTocId, liveUpdateToast?.tocId]);

  useEffect(() => {
    const anchorId = normalizeId(liveUpdate?.anchorId);
    if (!anchorId || (liveUpdate?.pageId && normalizeId(liveUpdate.pageId) !== normalizeId(pageId))) return undefined;

    setRecentParagraphAnchors(current => {
      const next = new Set(current);
      next.add(anchorId);
      return next;
    });
    const previousTimer = recentParagraphTimersRef.current.get(anchorId);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = window.setTimeout(() => {
      recentParagraphTimersRef.current.delete(anchorId);
      setRecentParagraphAnchors(current => {
        if (!current.has(anchorId)) return current;
        const next = new Set(current);
        next.delete(anchorId);
        return next;
      });
    }, 2000);
    recentParagraphTimersRef.current.set(anchorId, timer);

    const run = () => {
      const element = document.getElementById(anchorId) || articleRef.current?.querySelector?.(`[data-wiki-block-anchor="${cssEscape(anchorId)}"]`);
      if (!element) return;
      const headingSelector = 'h2[id], h3[id]';
      let tocId = element.matches?.(headingSelector) ? element.id : '';
      let sibling = element.previousElementSibling;
      while (!tocId && sibling) {
        if (sibling.matches?.(headingSelector)) tocId = sibling.id;
        sibling = sibling.previousElementSibling;
      }
      tocId = tocId || tocItems[0]?.id || '';
      if (tocId) {
        setRecentTocIds(current => {
          const next = new Set(current);
          next.add(tocId);
          return next;
        });
      }

      const rect = element.getBoundingClientRect?.();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const outsideViewport = rect && (rect.bottom < 0 || rect.top > viewportHeight);
      if (outsideViewport) {
        const tocItem = tocItems.find(item => item.id === tocId);
        setLiveUpdateToast({
          anchorId,
          tocId,
          title: tocItem?.title || 'Updated section'
        });
      }
    };
    const usedAnimationFrame = Boolean(window.requestAnimationFrame);
    const frame = usedAnimationFrame ? window.requestAnimationFrame(run) : window.setTimeout(run, 0);
    return () => {
      if (usedAnimationFrame && window.cancelAnimationFrame) window.cancelAnimationFrame(frame);
      else window.clearTimeout(frame);
    };
  }, [liveUpdate, pageId, tocItems]);

  useEffect(() => {
    const qualityStatus = String(page?.aiState?.quality?.status || page?.quality?.status || '').toLowerCase();
    const pageKey = `${pageId}:${page?.updatedAt || page?.aiState?.quality?.checkedAt || ''}`;
    if (workspaceMode || !page || !qualityState || maintaining || autoRebuildPageRef.current === pageKey) return;
    if (!['needs_rebuild', 'fail', 'failed'].includes(qualityStatus)) return;
    if (page?.aiState?.quality?.rebuiltAutomatically && qualityStatus !== 'needs_rebuild') return;
    autoRebuildPageRef.current = pageKey;
    handleMaintain();
  }, [handleMaintain, maintaining, page, pageId, qualityState, workspaceMode]);

  if (loading && !page) return <main className="wiki-page"><p className="wiki-index__status">Loading Wiki page...</p></main>;
  if (!page) {
    return (
      <main className="wiki-page">
        <div className="wiki-index__error" role="alert">{error || 'Wiki page not found.'}</div>
      </main>
    );
  }
  const readPageType = String(page.pageType || 'topic').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const bodyTransitionClass = pageTransitionState !== 'idle' ? ' wiki-read__body--transitioning' : '';
  return (
    <main
      className={`wiki-page wiki-read wiki-read--type-${readPageType}`}
      data-state={pageTransitionState}
      data-page-transition-state={pageTransitionState}
    >
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
                      onClick={(event) => handleTocClick(event, item.id)}
                    >
                      {recentTocIds.has(item.id) ? <span className="wiki-read__toc-update-dot" aria-label="Recently updated" /> : null}
                      {item.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
        </aside>
        <article
          ref={articleRef}
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
          onClick={(event) => {
            handleCitationClick(event);
            handleInternalLinkClick(event);
          }}
        >
          <div className="wiki-read__progress" aria-hidden="true">
            <span />
          </div>
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
            <WikiReadTitle title={page.title || 'Untitled Wiki Page'} />
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
              <section className="wiki-read__article-panel">
              <section
                className={`wiki-read__body${bodyTransitionClass}`}
                data-state={pageTransitionState}
                data-page-transition-state={pageTransitionState}
              >
                {renderTiptapDoc(displayBody, { tocItems, recentAnchorIds: recentParagraphAnchors })}
              </section>
                {showMarginalia ? (
                  <WikiReadMarginalia
                    sources={page.sourceRefs || []}
                    citations={footnoteCitations}
                    onJumpToReference={(refId) => {
                      if (scrollToElementId(refId)) highlightReference(refId);
                    }}
                  />
                ) : null}
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
          {railCollapsed ? (
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
          ) : !nonCriticalReady ? (
            <div
              id="wiki-read-rail-content"
              className="wiki-read__rail-content wiki-read__rail-content--loading"
              role="status"
              aria-live="polite"
            >
              Loading context...
            </div>
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
                  <span aria-hidden="true">›</span>
                  <span className="wiki-read__rail-toggle-label">Hide</span>
                </button>
                <section className="wiki-read__infobox wiki-read__infobox--structured">
                  <h2>{labelFor(page.pageType || 'topic')}</h2>
                  <dl>
                    {infoboxRows.map(row => (
                      <InfoboxRow key={row.label} row={row} pageId={pageId} />
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
        {liveUpdateToast ? (
          <div className="wiki-read-live-toast" role="status" aria-live="polite">
            <button type="button" className="wiki-read-live-toast__dismiss" onClick={() => setLiveUpdateToast(null)} aria-label="Dismiss update notice">×</button>
            <span>{liveUpdateToast.title} updated</span>
            <button type="button" onClick={() => handleLiveUpdateJump(liveUpdateToast.anchorId)}>Jump</button>
          </div>
        ) : null}
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
