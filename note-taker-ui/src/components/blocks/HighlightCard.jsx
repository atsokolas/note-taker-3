import React, { useEffect, useMemo, useState } from 'react';
import { Button, QuietButton } from '../ui';
import HighlightBlock from './HighlightBlock';
import ReturnLaterControl from '../return-queue/ReturnLaterControl';
import ConnectionBuilder from '../connections/ConnectionBuilder';
import {
  getHighlightClaimEvidence,
  organizeHighlightItem,
  searchHighlightClaims
} from '../../api/organize';

const ITEM_TYPES = [
  { value: 'note', label: 'Note' },
  { value: 'claim', label: 'Claim' },
  { value: 'evidence', label: 'Evidence' }
];

const summarize = (text, max = 170) => {
  const raw = String(text || '');
  const firstLine = raw.split('\n').find(line => line.trim()) || '';
  const clean = firstLine.replace(/\s+/g, ' ').trim();
  if (!clean) return 'No text';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trim()}…`;
};

const formatTypeLabel = (value = 'note') => {
  const normalized = String(value || 'note').toLowerCase();
  if (normalized === 'claim') return 'Claim';
  if (normalized === 'evidence') return 'Evidence';
  return 'Note';
};

const formatDateLabel = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString();
};

const HighlightCard = ({
  highlight,
  compact = false,
  onAddNotebook,
  onAddConcept,
  onAddQuestion,
  organizable = false,
  onOrganized,
  onDumpToWorkingMemory,
  forceExpandedState,
  forceExpandedVersion = 0
}) => {
  const highlightId = highlight?._id || highlight?.id;
  const [expanded, setExpanded] = useState(false);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [itemType, setItemType] = useState(highlight?.type || 'note');
  const [itemTags, setItemTags] = useState(highlight?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [claimId, setClaimId] = useState(highlight?.claimId ? String(highlight.claimId) : '');
  const [claimQuery, setClaimQuery] = useState('');
  const [claimOptions, setClaimOptions] = useState([]);
  const [claimOptionsLoading, setClaimOptionsLoading] = useState(false);
  const [claimEvidenceOpen, setClaimEvidenceOpen] = useState(false);
  const [claimEvidenceItems, setClaimEvidenceItems] = useState([]);
  const [claimEvidenceLoading, setClaimEvidenceLoading] = useState(false);
  const [organizeSaving, setOrganizeSaving] = useState(false);
  const [organizeError, setOrganizeError] = useState('');

  const tagSummary = useMemo(() => {
    const tags = Array.isArray(itemTags) ? itemTags : [];
    return {
      visible: tags.slice(0, 2),
      hiddenCount: Math.max(0, tags.length - 2)
    };
  }, [itemTags]);

  useEffect(() => {
    setExpanded(false);
    setItemType(highlight?.type || 'note');
    setItemTags(Array.isArray(highlight?.tags) ? highlight.tags : []);
    setClaimId(highlight?.claimId ? String(highlight.claimId) : '');
    setOrganizeOpen(false);
    setOrganizeError('');
    setClaimEvidenceOpen(false);
    setClaimEvidenceItems([]);
  }, [highlight?._id, highlight?.type, highlight?.claimId, highlight?.tags]);

  useEffect(() => {
    if (typeof forceExpandedState === 'boolean') {
      setExpanded(forceExpandedState);
      if (!forceExpandedState) {
        setOrganizeOpen(false);
      }
    }
  }, [forceExpandedState, forceExpandedVersion]);

  useEffect(() => {
    let cancelled = false;
    if (!organizeOpen || itemType !== 'evidence') {
      setClaimOptions([]);
      setClaimOptionsLoading(false);
      return;
    }
    const loadClaims = async () => {
      setClaimOptionsLoading(true);
      try {
        const claims = await searchHighlightClaims(claimQuery);
        if (cancelled) return;
        setClaimOptions(claims.filter(item => String(item._id) !== String(highlightId)));
      } catch (err) {
        if (!cancelled) {
          setOrganizeError(err.response?.data?.error || 'Failed to load claim options.');
        }
      } finally {
        if (!cancelled) setClaimOptionsLoading(false);
      }
    };
    loadClaims();
    return () => {
      cancelled = true;
    };
  }, [organizeOpen, itemType, claimQuery, highlightId]);

  useEffect(() => {
    let cancelled = false;
    if (!organizeOpen || !claimEvidenceOpen || itemType !== 'claim' || !highlightId || highlight?.type !== 'claim') {
      setClaimEvidenceItems([]);
      setClaimEvidenceLoading(false);
      return;
    }
    const loadEvidence = async () => {
      setClaimEvidenceLoading(true);
      try {
        const data = await getHighlightClaimEvidence(highlightId);
        if (!cancelled) {
          setClaimEvidenceItems(Array.isArray(data?.evidence) ? data.evidence : []);
        }
      } catch (err) {
        if (!cancelled) {
          setOrganizeError(err.response?.data?.error || 'Failed to load evidence.');
        }
      } finally {
        if (!cancelled) setClaimEvidenceLoading(false);
      }
    };
    loadEvidence();
    return () => {
      cancelled = true;
    };
  }, [organizeOpen, claimEvidenceOpen, itemType, highlightId, highlight?.type]);

  const addTag = () => {
    const nextTag = tagInput.trim();
    if (!nextTag) return;
    if (itemTags.some(tag => tag.toLowerCase() === nextTag.toLowerCase())) {
      setTagInput('');
      return;
    }
    setItemTags(prev => [...prev, nextTag]);
    setTagInput('');
  };

  const removeTag = (tagValue) => {
    setItemTags(prev => prev.filter(tag => tag !== tagValue));
  };

  const saveOrganize = async () => {
    if (!highlightId) return;
    setOrganizeSaving(true);
    setOrganizeError('');
    try {
      const updated = await organizeHighlightItem(highlightId, {
        type: itemType,
        tags: itemTags,
        claimId: itemType === 'evidence' ? (claimId || null) : null
      });
      setItemType(updated?.type || itemType);
      setItemTags(updated?.tags || itemTags);
      setClaimId(updated?.claimId ? String(updated.claimId) : '');
      onOrganized?.(updated);
    } catch (err) {
      setOrganizeError(err.response?.data?.error || 'Failed to save organization.');
    } finally {
      setOrganizeSaving(false);
    }
  };

  return (
    <div className="highlight-card">
      <div className="highlight-card-collapsed">
        <div className="highlight-card-collapsed-main">
          <div className="highlight-card-collapsed-title">
            {highlight?.articleTitle || 'Highlight'}
          </div>
          <div className="highlight-card-collapsed-text">
            {summarize(highlight?.text)}
          </div>
          <div className="highlight-card-collapsed-meta">
            <span className={`item-type-badge item-type-${String(itemType || 'note').toLowerCase()}`}>
              {formatTypeLabel(itemType)}
            </span>
            {tagSummary.visible.map(tag => (
              <span key={`${highlightId}-${tag}`} className="item-tag-summary">{tag}</span>
            ))}
            {tagSummary.hiddenCount > 0 && (
              <span className="item-tag-summary">+{tagSummary.hiddenCount}</span>
            )}
            {highlight?.createdAt && (
              <span className="item-timestamp">{formatDateLabel(highlight.createdAt)}</span>
            )}
          </div>
        </div>
        <QuietButton onClick={() => setExpanded(prev => !prev)}>
          {expanded ? 'Collapse' : 'Expand'}
        </QuietButton>
      </div>

      {expanded && (
        <div className="highlight-card-expanded">
          <HighlightBlock highlight={{ ...highlight, tags: itemTags }} compact={compact} />
          <div className="highlight-card-actions">
            {organizable && (
              <QuietButton onClick={() => setOrganizeOpen(prev => !prev)}>
                {organizeOpen ? 'Close Edit/Tag/Link' : 'Edit / Tag / Link'}
              </QuietButton>
            )}
            {onAddNotebook && (
              <QuietButton onClick={() => onAddNotebook(highlight)}>Add to Notebook</QuietButton>
            )}
            {onAddConcept && (
              <QuietButton onClick={() => onAddConcept(highlight)}>Add to Concept</QuietButton>
            )}
            {onAddQuestion && (
              <QuietButton onClick={() => onAddQuestion(highlight)}>Add to Question</QuietButton>
            )}
            {highlight?.articleId && (
              <QuietButton onClick={() => { window.location.href = `/articles/${highlight.articleId}`; }}>
                Link to Source
              </QuietButton>
            )}
            <ReturnLaterControl
              itemType="highlight"
              itemId={highlightId}
              defaultReason={summarize(highlight?.text, 120)}
            />
            <ConnectionBuilder itemType="highlight" itemId={highlightId} />
            {onDumpToWorkingMemory && (
              <QuietButton onClick={() => onDumpToWorkingMemory(highlight)}>
                Dump to Working Memory
              </QuietButton>
            )}
          </div>
          {organizable && organizeOpen && (
            <div className="highlight-organize-panel">
              <div className="highlight-organize-row">
                <label htmlFor={`highlight-type-${highlightId}`} className="highlight-organize-label">Type</label>
                <select
                  id={`highlight-type-${highlightId}`}
                  className="highlight-organize-select"
                  value={itemType}
                  onChange={(event) => {
                    const next = event.target.value;
                    setItemType(next);
                    if (next !== 'evidence') setClaimId('');
                  }}
                >
                  {ITEM_TYPES.map(option => (
                    <option key={`${highlightId}-${option.value}`} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="highlight-organize-row">
                <span className="highlight-organize-label">Tags</span>
                <div className="highlight-organize-tags">
                  {itemTags.map(tag => (
                    <button
                      type="button"
                      key={`${highlightId}-${tag}`}
                      className="highlight-tag-chip-button"
                      onClick={() => removeTag(tag)}
                    >
                      {tag} ×
                    </button>
                  ))}
                </div>
                <div className="highlight-organize-tag-input">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="Add tag"
                  />
                  <QuietButton onClick={addTag}>Add tag</QuietButton>
                </div>
              </div>
              {itemType === 'evidence' && (
                <div className="highlight-organize-row">
                  <span className="highlight-organize-label">Link claim</span>
                  <input
                    type="text"
                    value={claimQuery}
                    onChange={(event) => setClaimQuery(event.target.value)}
                    placeholder="Search claim highlights"
                  />
                  <select
                    className="highlight-organize-select"
                    value={claimId}
                    onChange={(event) => setClaimId(event.target.value)}
                  >
                    <option value="">Select claim</option>
                    {claimOptions.map(option => (
                      <option key={option._id} value={option._id}>
                        {(option.text || 'Claim').slice(0, 60)}
                      </option>
                    ))}
                  </select>
                  {claimOptionsLoading && <p className="muted small">Loading claim options…</p>}
                </div>
              )}
              {itemType === 'claim' && (
                <div className="highlight-organize-row">
                  <div className="highlight-organize-inline">
                    <span className="highlight-organize-label">Evidence</span>
                    <QuietButton onClick={() => setClaimEvidenceOpen(prev => !prev)}>
                      {claimEvidenceOpen ? 'Hide' : 'Show'}
                    </QuietButton>
                  </div>
                  {highlight?.type !== 'claim' && (
                    <p className="muted small">Save this highlight as Claim to load linked evidence.</p>
                  )}
                  {highlight?.type === 'claim' && claimEvidenceOpen && (
                    <div className="highlight-organize-evidence-list">
                      {claimEvidenceLoading && <p className="muted small">Loading evidence…</p>}
                      {!claimEvidenceLoading && claimEvidenceItems.length === 0 && (
                        <p className="muted small">No evidence linked yet.</p>
                      )}
                      {!claimEvidenceLoading && claimEvidenceItems.map(item => (
                        <div key={item._id} className="highlight-organize-evidence-item">
                          <div className="highlight-organize-evidence-text">{item.text || 'Evidence'}</div>
                          <div className="muted small">{item.articleTitle || 'Article'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="highlight-organize-actions">
                <Button onClick={saveOrganize} disabled={organizeSaving}>
                  {organizeSaving ? 'Saving…' : 'Save organization'}
                </Button>
              </div>
              {organizeError && <p className="status-message error-message">{organizeError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HighlightCard;
