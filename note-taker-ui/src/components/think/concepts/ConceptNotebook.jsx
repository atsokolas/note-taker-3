import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { Button, QuietButton } from '../../ui';
import { addConceptLayoutCard, getConceptLayout, updateConceptLayout } from '../../../api/concepts';
import { searchKeyword } from '../../../api/retrieval';

const CARD_PREFIX = 'card:';
const SECTION_PREFIX = 'section:';

const RELATION_OPTIONS = [
  { value: 'supports', label: 'Supports' },
  { value: 'contradicts', label: 'Contradicts' },
  { value: 'related', label: 'Related' }
];

const ITEM_LABELS = {
  highlight: 'Highlight',
  article: 'Article',
  note: 'Note'
};

const buildId = (prefix) => (
  `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Math.random().toString(36).slice(2, 9)}-${Date.now()}`}`
);

const createDefaultLayout = () => ({
  sections: [
    { id: buildId('section'), title: 'Claims', description: '', cardIds: [] },
    { id: buildId('section'), title: 'Evidence', description: '', cardIds: [] },
    { id: buildId('section'), title: 'Examples', description: '', cardIds: [] },
    { id: buildId('section'), title: 'Questions', description: '', cardIds: [] },
    { id: buildId('section'), title: 'To verify', description: '', cardIds: [] }
  ],
  cards: [],
  connections: []
});

const toCardSortableId = (cardId) => `${CARD_PREFIX}${cardId}`;
const toSectionDroppableId = (sectionId) => `${SECTION_PREFIX}${sectionId}`;
const getCardIdFromSortable = (sortableId) => (
  String(sortableId || '').startsWith(CARD_PREFIX)
    ? String(sortableId).slice(CARD_PREFIX.length)
    : ''
);
const getSectionIdFromDroppable = (droppableId) => (
  String(droppableId || '').startsWith(SECTION_PREFIX)
    ? String(droppableId).slice(SECTION_PREFIX.length)
    : ''
);

const normalizeLayout = (input = {}) => {
  const fallback = createDefaultLayout();
  const source = input && typeof input === 'object' ? input : {};

  const cards = Array.isArray(source.cards)
    ? source.cards
      .map((card) => {
        if (!card) return null;
        const id = String(card.id || '').trim();
        const itemType = String(card.itemType || '').trim().toLowerCase();
        const itemId = String(card.itemId || '').trim();
        if (!id || !itemType || !itemId) return null;
        return {
          id,
          itemType,
          itemId,
          title: String(card.title || '').trim(),
          snippet: String(card.snippet || '').trim(),
          createdAt: card.createdAt || new Date().toISOString()
        };
      })
      .filter(Boolean)
    : [];

  const cardIds = new Set(cards.map((card) => card.id));

  let sections = Array.isArray(source.sections)
    ? source.sections
      .map((section, index) => {
        if (!section) return null;
        const id = String(section.id || '').trim() || buildId('section');
        const title = String(section.title || '').trim() || `Section ${index + 1}`;
        const description = String(section.description || '').trim();
        const seen = new Set();
        const cardIdsForSection = Array.isArray(section.cardIds)
          ? section.cardIds
            .map((cardId) => String(cardId || '').trim())
            .filter((cardId) => cardIds.has(cardId) && !seen.has(cardId) && seen.add(cardId))
          : [];
        return { id, title, description, cardIds: cardIdsForSection };
      })
      .filter(Boolean)
    : [];

  if (sections.length === 0) {
    sections = fallback.sections;
  }

  const assigned = new Set();
  sections.forEach((section) => section.cardIds.forEach((cardId) => assigned.add(cardId)));
  const unassigned = cards.filter((card) => !assigned.has(card.id)).map((card) => card.id);
  if (unassigned.length > 0) {
    sections[0].cardIds = [...sections[0].cardIds, ...unassigned];
  }

  const connections = Array.isArray(source.connections)
    ? source.connections
      .map((connection) => {
        if (!connection) return null;
        const id = String(connection.id || '').trim() || buildId('connection');
        const fromCardId = String(connection.fromCardId || '').trim();
        const toCardId = String(connection.toCardId || '').trim();
        const type = String(connection.type || '').trim().toLowerCase();
        if (!fromCardId || !toCardId || fromCardId === toCardId) return null;
        if (!cardIds.has(fromCardId) || !cardIds.has(toCardId)) return null;
        if (!['supports', 'contradicts', 'related'].includes(type)) return null;
        return {
          id,
          fromCardId,
          toCardId,
          type,
          label: String(connection.label || '').trim()
        };
      })
      .filter(Boolean)
    : [];

  return { sections, cards, connections };
};

const findSectionByCardId = (layout, cardId) => (
  layout.sections.find((section) => section.cardIds.includes(cardId)) || null
);

const moveCardAcrossSections = (layout, cardId, targetSectionId, targetIndex = null) => {
  const sourceSection = findSectionByCardId(layout, cardId);
  const destinationSection = layout.sections.find((section) => section.id === targetSectionId);
  if (!sourceSection || !destinationSection) return layout;
  if (sourceSection.id === destinationSection.id && targetIndex === null) return layout;

  const nextSections = layout.sections.map((section) => {
    const without = section.cardIds.filter((id) => id !== cardId);
    if (section.id !== destinationSection.id) {
      return { ...section, cardIds: without };
    }
    const insertIndex = targetIndex === null ? without.length : Math.max(0, Math.min(targetIndex, without.length));
    const nextCardIds = [...without.slice(0, insertIndex), cardId, ...without.slice(insertIndex)];
    return { ...section, cardIds: nextCardIds };
  });

  return { ...layout, sections: nextSections };
};

const getCardOpenPath = (card) => {
  if (card.itemType === 'article') return `/articles/${encodeURIComponent(card.itemId)}`;
  if (card.itemType === 'note') return `/think?tab=notebook&entryId=${encodeURIComponent(card.itemId)}`;
  return '/library?scope=highlights';
};

const SectionDropZone = ({ sectionId, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: toSectionDroppableId(sectionId) });
  return (
    <div ref={setNodeRef} className={`concept-notebook__section-body ${isOver ? 'is-over' : ''}`}>
      {children}
    </div>
  );
};

const SortableCard = React.memo(({
  card,
  sourceConnections,
  targetLookup,
  expanded,
  onToggleExpanded,
  onStartConnect,
  onSetLinkTarget,
  canSelectTarget,
  linkingFromCardId
}) => {
  const sortableId = toCardSortableId(card.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`concept-notebook__card ${isDragging ? 'is-dragging' : ''}`}
    >
      <header className="concept-notebook__card-head">
        <button
          type="button"
          className="concept-notebook__drag-handle"
          aria-label="Drag card"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <div className="concept-notebook__card-meta">
          <span className="concept-notebook__card-type">{ITEM_LABELS[card.itemType] || 'Card'}</span>
          <h4>{card.title || 'Untitled'}</h4>
        </div>
      </header>

      <p className={`concept-notebook__card-snippet ${expanded ? 'is-expanded' : ''}`}>
        {card.snippet || 'No preview text.'}
      </p>

      <div className="concept-notebook__card-actions">
        <QuietButton onClick={() => onToggleExpanded(card.id)}>
          {expanded ? 'Collapse' : 'Expand'}
        </QuietButton>
        <a href={getCardOpenPath(card)} className="ui-quiet-button">
          Open
        </a>
        <QuietButton onClick={() => onStartConnect(card.id)}>
          Connect
        </QuietButton>
        {canSelectTarget && linkingFromCardId !== card.id && (
          <Button variant="secondary" onClick={() => onSetLinkTarget(card.id)}>
            Target
          </Button>
        )}
      </div>

      {sourceConnections.length > 0 && (
        <div className="concept-notebook__card-links">
          {sourceConnections.map((connection) => (
            <span key={connection.id} className="concept-notebook__connection-pill">
              {connection.type} → {targetLookup.get(connection.toCardId)?.title || 'Card'}
            </span>
          ))}
        </div>
      )}
    </article>
  );
});

const ConceptNotebook = ({ concept }) => {
  const conceptKey = String(concept?._id || concept?.name || '').trim();
  const [layout, setLayout] = useState(createDefaultLayout());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [expandedCards, setExpandedCards] = useState({});
  const [activeCardId, setActiveCardId] = useState('');
  const [linkDraft, setLinkDraft] = useState({ fromCardId: '', toCardId: '', type: 'supports' });
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionDescription, setNewSectionDescription] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addTypeFilter, setAddTypeFilter] = useState('all');
  const [addResults, setAddResults] = useState([]);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [targetSectionId, setTargetSectionId] = useState('');
  const saveTimerRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const cardsById = useMemo(() => {
    const map = new Map();
    layout.cards.forEach((card) => map.set(card.id, card));
    return map;
  }, [layout.cards]);

  const connectionsByFrom = useMemo(() => {
    const map = new Map();
    layout.connections.forEach((connection) => {
      if (!map.has(connection.fromCardId)) map.set(connection.fromCardId, []);
      map.get(connection.fromCardId).push(connection);
    });
    return map;
  }, [layout.connections]);

  const saveLayout = useCallback((nextLayout) => {
    if (!conceptKey) return;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    setSaveState('pending');
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        setSaveState('saving');
        const response = await updateConceptLayout(conceptKey, nextLayout);
        if (response?.layout) {
          setLayout(normalizeLayout(response.layout));
        }
        setSaveState('saved');
      } catch (saveError) {
        setSaveState('error');
        setError(saveError.response?.data?.error || 'Failed to save concept notebook.');
      }
    }, 450);
  }, [conceptKey]);

  const applyLayout = useCallback((nextLayout, { persist = true } = {}) => {
    const normalized = normalizeLayout(nextLayout);
    setLayout(normalized);
    if (persist) {
      saveLayout(normalized);
    }
  }, [saveLayout]);

  useEffect(() => {
    if (!conceptKey) return undefined;
    let cancelled = false;
    const loadLayout = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await getConceptLayout(conceptKey);
        if (cancelled) return;
        const nextLayout = normalizeLayout(response?.layout || {});
        setLayout(nextLayout);
        setTargetSectionId(nextLayout.sections[0]?.id || '');
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.response?.data?.error || 'Failed to load concept notebook.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadLayout();
    return () => {
      cancelled = true;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [conceptKey]);

  useEffect(() => {
    if (!addOpen) return;
    if (addQuery.trim().length < 2) {
      setAddResults([]);
      setAddError('');
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setAddLoading(true);
      setAddError('');
      try {
        const data = await searchKeyword({
          q: addQuery.trim(),
          scope: 'all',
          type: ['article', 'highlight', 'note']
        });
        if (cancelled) return;
        const highlights = Array.isArray(data?.highlights)
          ? data.highlights.map((item) => ({
            key: `highlight:${item._id}`,
            itemType: 'highlight',
            itemId: String(item._id),
            title: item.articleTitle || 'Highlight',
            snippet: item.text || '',
            meta: item.tags?.slice(0, 3).join(', ')
          }))
          : [];
        const articles = Array.isArray(data?.articles)
          ? data.articles.map((item) => ({
            key: `article:${item._id}`,
            itemType: 'article',
            itemId: String(item._id),
            title: item.title || 'Article',
            snippet: item.content || item.url || '',
            meta: item.url || ''
          }))
          : [];
        const notes = Array.isArray(data?.notebook)
          ? data.notebook.map((item) => ({
            key: `note:${item._id}`,
            itemType: 'note',
            itemId: String(item._id),
            title: item.title || 'Notebook note',
            snippet: item.content || '',
            meta: item.type || 'note'
          }))
          : [];
        setAddResults([...highlights, ...articles, ...notes]);
      } catch (searchError) {
        if (!cancelled) {
          setAddError(searchError.response?.data?.error || 'Failed to search saved items.');
        }
      } finally {
        if (!cancelled) setAddLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [addOpen, addQuery]);

  const filteredAddResults = useMemo(() => {
    if (addTypeFilter === 'all') return addResults;
    return addResults.filter((item) => item.itemType === addTypeFilter);
  }, [addResults, addTypeFilter]);

  const handleToggleExpanded = useCallback((cardId) => {
    setExpandedCards((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  }, []);

  const handleCreateSection = useCallback(() => {
    const title = newSectionTitle.trim();
    if (!title) return;
    const nextLayout = {
      ...layout,
      sections: [
        ...layout.sections,
        {
          id: buildId('section'),
          title,
          description: newSectionDescription.trim(),
          cardIds: []
        }
      ]
    };
    setNewSectionTitle('');
    setNewSectionDescription('');
    applyLayout(nextLayout);
  }, [applyLayout, layout, newSectionDescription, newSectionTitle]);

  const handleStartConnect = useCallback((fromCardId) => {
    setLinkDraft({ fromCardId, toCardId: '', type: 'supports' });
  }, []);

  const handleSaveConnection = useCallback(() => {
    if (!linkDraft.fromCardId || !linkDraft.toCardId || linkDraft.fromCardId === linkDraft.toCardId) return;
    const key = `${linkDraft.fromCardId}:${linkDraft.toCardId}:${linkDraft.type}`;
    const exists = layout.connections.some((connection) => (
      `${connection.fromCardId}:${connection.toCardId}:${connection.type}` === key
    ));
    if (exists) {
      setLinkDraft({ fromCardId: '', toCardId: '', type: 'supports' });
      return;
    }
    const nextLayout = {
      ...layout,
      connections: [
        ...layout.connections,
        {
          id: buildId('connection'),
          fromCardId: linkDraft.fromCardId,
          toCardId: linkDraft.toCardId,
          type: linkDraft.type,
          label: ''
        }
      ]
    };
    setLinkDraft({ fromCardId: '', toCardId: '', type: 'supports' });
    applyLayout(nextLayout);
  }, [applyLayout, layout, linkDraft]);

  const handleAddCardToLayout = useCallback(async (item) => {
    const sectionId = targetSectionId || layout.sections[0]?.id || '';
    if (!conceptKey || !sectionId) return;
    try {
      setAddError('');
      const response = await addConceptLayoutCard(conceptKey, {
        itemType: item.itemType,
        itemId: item.itemId,
        title: item.title,
        snippet: item.snippet,
        sectionId
      });
      if (response?.layout) {
        const nextLayout = normalizeLayout(response.layout);
        setLayout(nextLayout);
        setTargetSectionId(sectionId || nextLayout.sections[0]?.id || '');
      }
    } catch (addCardError) {
      setAddError(addCardError.response?.data?.error || 'Failed to add item to concept notebook.');
    }
  }, [conceptKey, layout.sections, targetSectionId]);

  const handleDragStart = useCallback((event) => {
    const cardId = getCardIdFromSortable(event.active?.id);
    setActiveCardId(cardId);
  }, []);

  const handleDragOver = useCallback((event) => {
    const cardId = getCardIdFromSortable(event.active?.id);
    if (!cardId) return;
    const overId = event.over?.id;
    if (!overId) return;

    const overCardId = getCardIdFromSortable(overId);
    const overSectionId = getSectionIdFromDroppable(overId) || findSectionByCardId(layout, overCardId)?.id;
    if (!overSectionId) return;

    const sourceSection = findSectionByCardId(layout, cardId);
    if (!sourceSection) return;
    if (sourceSection.id === overSectionId) return;

    const targetSection = layout.sections.find((section) => section.id === overSectionId);
    if (!targetSection) return;

    const targetIndex = overCardId
      ? targetSection.cardIds.findIndex((id) => id === overCardId)
      : targetSection.cardIds.length;
    const nextLayout = moveCardAcrossSections(layout, cardId, overSectionId, targetIndex < 0 ? targetSection.cardIds.length : targetIndex);
    setLayout(nextLayout);
  }, [layout]);

  const handleDragEnd = useCallback((event) => {
    const cardId = getCardIdFromSortable(event.active?.id);
    const overCardId = getCardIdFromSortable(event.over?.id);
    const overSectionId = getSectionIdFromDroppable(event.over?.id);
    setActiveCardId('');
    if (!cardId || (!overCardId && !overSectionId)) return;

    const sourceSection = findSectionByCardId(layout, cardId);
    if (!sourceSection) return;

    let nextLayout = layout;
    if (overCardId) {
      const destinationSection = findSectionByCardId(layout, overCardId);
      if (!destinationSection) return;
      if (destinationSection.id !== sourceSection.id) {
        const targetIndex = destinationSection.cardIds.findIndex((id) => id === overCardId);
        nextLayout = moveCardAcrossSections(layout, cardId, destinationSection.id, targetIndex);
      } else {
        const fromIndex = sourceSection.cardIds.findIndex((id) => id === cardId);
        const toIndex = sourceSection.cardIds.findIndex((id) => id === overCardId);
        if (fromIndex !== toIndex && fromIndex > -1 && toIndex > -1) {
          nextLayout = {
            ...layout,
            sections: layout.sections.map((section) => (
              section.id !== sourceSection.id
                ? section
                : { ...section, cardIds: arrayMove(section.cardIds, fromIndex, toIndex) }
            ))
          };
        }
      }
    } else if (overSectionId && overSectionId !== sourceSection.id) {
      nextLayout = moveCardAcrossSections(layout, cardId, overSectionId, null);
    }

    if (nextLayout !== layout) {
      applyLayout(nextLayout);
    }
  }, [applyLayout, layout]);

  if (!conceptKey) return null;

  return (
    <section className="concept-notebook">
      <div className="concept-notebook__toolbar">
        <Button variant="secondary" onClick={() => setAddOpen(true)}>Add to concept</Button>
        <div className="concept-notebook__new-section">
          <input
            type="text"
            value={newSectionTitle}
            onChange={(event) => setNewSectionTitle(event.target.value)}
            placeholder="New section title"
          />
          <input
            type="text"
            value={newSectionDescription}
            onChange={(event) => setNewSectionDescription(event.target.value)}
            placeholder="Description (optional)"
          />
          <QuietButton onClick={handleCreateSection}>Create section</QuietButton>
        </div>
        <span className={`concept-notebook__save-state ${saveState}`}>
          {saveState === 'saving' && 'Saving...'}
          {saveState === 'saved' && 'Saved'}
          {saveState === 'error' && 'Save failed'}
        </span>
      </div>

      {loading && <p className="muted small">Loading concept notebook...</p>}
      {error && <p className="status-message error-message">{error}</p>}

      {!loading && (
        <>
          {linkDraft.fromCardId && (
            <div className="concept-notebook__link-bar">
              <span>
                Linking from <strong>{cardsById.get(linkDraft.fromCardId)?.title || 'Card'}</strong>
              </span>
              <select
                value={linkDraft.type}
                onChange={(event) => setLinkDraft((prev) => ({ ...prev, type: event.target.value }))}
              >
                {RELATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <span>
                {linkDraft.toCardId
                  ? `to ${cardsById.get(linkDraft.toCardId)?.title || 'Card'}`
                  : 'Select target card'}
              </span>
              <Button variant="secondary" onClick={handleSaveConnection} disabled={!linkDraft.toCardId}>
                Save link
              </Button>
              <QuietButton onClick={() => setLinkDraft({ fromCardId: '', toCardId: '', type: 'supports' })}>
                Cancel
              </QuietButton>
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="concept-notebook__sections">
              {layout.sections.map((section) => (
                <section key={section.id} className="concept-notebook__section">
                  <header className="concept-notebook__section-head">
                    <h3>{section.title}</h3>
                    {section.description && <p>{section.description}</p>}
                  </header>
                  <SectionDropZone sectionId={section.id}>
                    <SortableContext
                      items={section.cardIds.map((cardId) => toCardSortableId(cardId))}
                      strategy={verticalListSortingStrategy}
                    >
                      {section.cardIds.map((cardId) => {
                        const card = cardsById.get(cardId);
                        if (!card) return null;
                        return (
                          <SortableCard
                            key={card.id}
                            card={card}
                            expanded={Boolean(expandedCards[card.id])}
                            onToggleExpanded={handleToggleExpanded}
                            sourceConnections={connectionsByFrom.get(card.id) || []}
                            targetLookup={cardsById}
                            onStartConnect={handleStartConnect}
                            onSetLinkTarget={(targetCardId) => setLinkDraft((prev) => ({ ...prev, toCardId: targetCardId }))}
                            canSelectTarget={Boolean(linkDraft.fromCardId)}
                            linkingFromCardId={linkDraft.fromCardId}
                          />
                        );
                      })}
                    </SortableContext>
                    {section.cardIds.length === 0 && (
                      <div className="concept-notebook__empty-section">
                        <span>{activeCardId ? 'Drop card here' : 'No cards yet'}</span>
                      </div>
                    )}
                  </SectionDropZone>
                </section>
              ))}
            </div>
          </DndContext>
        </>
      )}

      {addOpen && (
        <div className="modal-overlay">
          <div className="modal-content modal-content--wide">
            <div className="modal-header">
              <h3>Add to Concept Notebook</h3>
              <button type="button" className="icon-button" onClick={() => setAddOpen(false)}>×</button>
            </div>
            <div className="concept-notebook__add-controls">
              <input
                type="text"
                value={addQuery}
                onChange={(event) => setAddQuery(event.target.value)}
                placeholder="Search saved highlights, notes, articles..."
              />
              <select value={addTypeFilter} onChange={(event) => setAddTypeFilter(event.target.value)}>
                <option value="all">All</option>
                <option value="highlight">Highlights</option>
                <option value="article">Articles</option>
                <option value="note">Notes</option>
              </select>
              <select value={targetSectionId} onChange={(event) => setTargetSectionId(event.target.value)}>
                {layout.sections.map((section) => (
                  <option key={section.id} value={section.id}>{section.title}</option>
                ))}
              </select>
            </div>
            {addLoading && <p className="muted small">Searching...</p>}
            {addError && <p className="status-message error-message">{addError}</p>}
            {!addLoading && !addError && (
              <div className="concept-notebook__add-results">
                {filteredAddResults.length === 0 ? (
                  <p className="muted small">Type at least 2 characters to search saved items.</p>
                ) : (
                  filteredAddResults.map((item) => (
                    <div key={item.key} className="concept-notebook__add-row">
                      <div>
                        <p className="concept-notebook__add-type">{ITEM_LABELS[item.itemType]}</p>
                        <h4>{item.title || 'Untitled'}</h4>
                        <p>{item.snippet || 'No preview text.'}</p>
                      </div>
                      <Button variant="secondary" onClick={() => handleAddCardToLayout(item)}>
                        Add
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}
            <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <QuietButton onClick={() => setAddOpen(false)}>Close</QuietButton>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default ConceptNotebook;
