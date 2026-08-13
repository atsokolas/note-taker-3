import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { attachConceptWorkspaceBlock, updateConceptWorkspaceBlock } from '../../../api/concepts';
import useConceptMaterial from '../../../hooks/useConceptMaterial';
import useConceptWorkspace from '../../../hooks/useConceptWorkspace';

const clean = (value) => String(value || '').trim();

const TYPE_ALIASES = {
  notebook: 'note',
  notebook_entry: 'note',
  wiki: 'wiki_page'
};

const TYPE_LABELS = {
  highlight: 'Library highlight',
  article: 'Library article',
  note: 'Notebook note',
  question: 'Question',
  concept: 'Concept',
  wiki_page: 'Wiki page',
  wiki_claim: 'Wiki claim'
};

const canonicalObjectType = (value) => {
  const type = clean(value).toLowerCase();
  return TYPE_ALIASES[type] || type;
};

const safeInternalPath = (value) => {
  const path = clean(value);
  return path.startsWith('/') && !path.startsWith('//') ? path : '';
};

const objectPath = (object = {}) => {
  const type = canonicalObjectType(object.type || object.itemType);
  const id = clean(object.refId || object.itemId || object.id || object._id);
  if (!type || !id) return '';
  if (type === 'highlight') {
    const articleId = clean(object.articleId || object.metadata?.articleId);
    return articleId
      ? `/library?articleId=${encodeURIComponent(articleId)}&highlightId=${encodeURIComponent(id)}`
      : '';
  }
  if (type === 'wiki_page') return `/wiki/workspace?page=${encodeURIComponent(id)}`;
  if (type === 'wiki_claim') {
    const [pageId, ...claimParts] = id.split(':');
    const claimId = claimParts.join(':');
    return pageId && claimId
      ? `/wiki/workspace?page=${encodeURIComponent(pageId)}&claimId=${encodeURIComponent(claimId)}`
      : '';
  }
  const explicit = safeInternalPath(object.openPath || object.path);
  if (explicit) return explicit;
  if (type === 'article') return `/library?articleId=${encodeURIComponent(id)}`;
  if (type === 'note') return `/think?tab=notebook&entryId=${encodeURIComponent(id)}`;
  if (type === 'question') return `/think?tab=questions&questionId=${encodeURIComponent(id)}`;
  if (type === 'concept') return `/think?tab=concepts&conceptId=${encodeURIComponent(id)}`;
  return '';
};

const normalizeObject = (value = {}) => {
  const type = canonicalObjectType(value.type || value.itemType || (value.articleId ? 'highlight' : ''));
  const refId = clean(value.refId || value.itemId || value.id || value._id);
  if (!type || !refId || !TYPE_LABELS[type]) return null;
  return {
    type,
    refId,
    title: clean(value.inlineTitle || value.title || value.articleTitle || value.label) || TYPE_LABELS[type],
    text: clean(value.inlineText || value.text || value.snippet || value.description),
    source: clean(value.source || value.sourceTitle || value.articleTitle) || TYPE_LABELS[type],
    articleId: clean(value.articleId || value.metadata?.articleId),
    openPath: safeInternalPath(value.openPath || value.path),
    metadata: value.metadata && typeof value.metadata === 'object' ? value.metadata : {}
  };
};

const highlightPath = (highlight) => objectPath({ ...highlight, type: 'highlight' });

const toDraftCard = (value, { workspaceAttached = false } = {}) => {
  const object = normalizeObject(value);
  if (!object) return null;
  return {
    id: `${object.type}:${object.refId}`,
    sourceKey: `${object.type}:${object.refId}`,
    objectId: object.refId,
    type: TYPE_LABELS[object.type],
    title: object.title,
    content: object.text || object.title,
    source: object.source,
    origin: object.type === 'highlight' || object.type === 'article' ? 'library' : object.type,
    zone: 'workspace',
    workspaceAttached,
    workspaceRef: {
      type: object.type,
      refId: object.refId,
      inlineTitle: object.title,
      inlineText: object.text
    }
  };
};

const ThinkGroundedObjects = ({ conceptId = '', candidates = [], onInsert, variant = 'page' }) => {
  const safeConceptId = clean(conceptId);
  const { material, loading: materialLoading, error: materialError, refresh: refreshMaterial } = useConceptMaterial(
    safeConceptId,
    { enabled: Boolean(safeConceptId) }
  );
  const {
    workspace,
    loading: workspaceLoading,
    error: workspaceError,
    setWorkspace,
    refresh: refreshWorkspace
  } = useConceptWorkspace(safeConceptId, { enabled: Boolean(safeConceptId) });
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const handleWorkspaceAttached = (event) => {
      if (clean(event?.detail?.conceptId) !== safeConceptId) return;
      refreshWorkspace();
    };
    window.addEventListener('noeis:concept-workspace-attached', handleWorkspaceAttached);
    return () => window.removeEventListener('noeis:concept-workspace-attached', handleWorkspaceAttached);
  }, [refreshWorkspace, safeConceptId]);

  const readyObjects = useMemo(() => {
    const byKey = new Map();
    (material?.pinnedHighlights || []).forEach((highlight) => {
      const object = normalizeObject({ ...highlight, type: 'highlight' });
      if (object) byKey.set(`${object.type}:${object.refId}`, object);
    });
    (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
      const object = normalizeObject(candidate);
      if (object) byKey.set(`${object.type}:${object.refId}`, object);
    });
    return byKey;
  }, [candidates, material?.pinnedHighlights]);

  const attachedItems = useMemo(
    () => (Array.isArray(workspace?.attachedItems) ? workspace.attachedItems : [])
      .filter((item) => item?.status !== 'archived' && TYPE_LABELS[canonicalObjectType(item?.type)])
      .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0)),
    [workspace?.attachedItems]
  );

  const objects = useMemo(() => {
    const attachedKeys = new Set();
    const attached = attachedItems.map((item) => {
      const type = canonicalObjectType(item.type);
      const key = `${type}:${clean(item.refId)}`;
      attachedKeys.add(key);
      const object = normalizeObject({ ...readyObjects.get(key), ...item, type });
      return object ? { item, object } : null;
    }).filter(Boolean);
    const ready = [...readyObjects.entries()]
      .filter(([key]) => !attachedKeys.has(key))
      .map(([, object]) => ({ item: null, object }));
    return [...attached, ...ready];
  }, [attachedItems, readyObjects]);

  const placeObject = useCallback(async (entry) => {
    const object = entry?.object;
    const objectKey = object ? `${object.type}:${object.refId}` : '';
    if (!safeConceptId || !objectKey || busyId) return;
    setBusyId(objectKey);
    setActionError('');
    setMessage('');
    try {
      if (!entry.item) {
        const response = await attachConceptWorkspaceBlock(safeConceptId, {
          type: object.type,
          refId: object.refId,
          sectionId: 'working',
          stage: 'working',
          inlineTitle: object.title,
          inlineText: object.text
        });
        if (response?.workspace) setWorkspace(response.workspace);
      }
      onInsert?.(toDraftCard(object, { workspaceAttached: true }));
      setMessage('Inserted at the cursor. Its way home stays attached.');
      await Promise.allSettled([refreshWorkspace(), refreshMaterial()]);
    } catch (error) {
      setActionError(error.response?.data?.error || 'Could not place this object in the draft.');
    } finally {
      setBusyId('');
    }
  }, [busyId, onInsert, refreshMaterial, refreshWorkspace, safeConceptId, setWorkspace]);

  const moveObject = useCallback(async (entry, direction) => {
    if (!entry?.item || !safeConceptId || busyId) return;
    const siblings = attachedItems.filter(item => (
      (item.sectionId || 'working') === (entry.item.sectionId || 'working')
      && (item.parentId || '') === (entry.item.parentId || '')
    ));
    const index = siblings.findIndex((item) => item.id === entry.item.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= siblings.length) return;
    setBusyId(`${entry.object.type}:${entry.object.refId}`);
    setActionError('');
    setMessage('');
    try {
      const response = await updateConceptWorkspaceBlock(safeConceptId, entry.item.id, {
        sectionId: entry.item.sectionId || 'working',
        order: nextIndex
      });
      if (response?.workspace) setWorkspace(response.workspace);
      setMessage('Constellation order saved.');
    } catch (error) {
      setActionError(error.response?.data?.error || 'Could not reorder this object.');
      await refreshWorkspace();
    } finally {
      setBusyId('');
    }
  }, [attachedItems, busyId, refreshWorkspace, safeConceptId, setWorkspace]);

  const handleObjectDragStart = (event, entry) => {
    const card = toDraftCard(entry?.object, { workspaceAttached: Boolean(entry?.item) });
    if (!card) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-noeis-card-id', String(card.id));
    event.dataTransfer.setData('application/x-noeis-card-json', JSON.stringify(card));
    event.dataTransfer.setData('text/plain', String(card.id));
  };

  if (!safeConceptId) return null;
  const loading = materialLoading || workspaceLoading;
  const error = actionError || materialError || workspaceError;

  return (
    <section className={`think-grounded-objects think-grounded-objects--${variant}`} aria-labelledby="think-grounded-objects-title">
      <div className="think-grounded-objects__head">
        <div>
          <span>{variant === 'rail' ? 'Ready to place' : 'Working constellation'}</span>
          <h2 id="think-grounded-objects-title">Grounded material</h2>
        </div>
        <p>{variant === 'rail' ? 'Drag into the line where it belongs.' : 'Library, questions, notes, concepts, and Wiki remain one thought.'}</p>
      </div>

      {loading && objects.length === 0 ? (
        <p className="think-grounded-objects__empty">Gathering attached source memory…</p>
      ) : objects.length === 0 ? (
        <p className="think-grounded-objects__empty">Ask the thought partner to retrieve something. It will land here with its path home.</p>
      ) : (
        <ol className="think-grounded-objects__list" aria-label="Grounded object order">
          {objects.map((entry, index) => {
            const { object } = entry;
            const objectKey = `${object.type}:${object.refId}`;
            const path = objectPath(object);
            const isBusy = busyId === objectKey;
            const siblings = entry.item
              ? attachedItems.filter((item) => (
                  item.sectionId === entry.item.sectionId
                  && (item.parentId || '') === (entry.item.parentId || '')
                ))
              : [];
            const siblingIndex = entry.item ? siblings.findIndex((item) => item.id === entry.item.id) : -1;
            return (
              <li
                key={objectKey}
                className={`think-grounded-object is-${object.type.replace('_', '-')}`}
                draggable
                onDragStart={(event) => handleObjectDragStart(event, entry)}
              >
                <div className="think-grounded-object__index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="think-grounded-object__copy">
                  <span>{TYPE_LABELS[object.type]}{entry.item ? ' · in working set' : ' · retrieved'}</span>
                  <blockquote>{object.text || object.title}</blockquote>
                  <p>{object.title}</p>
                </div>
                <div className="think-grounded-object__actions">
                  <button type="button" onClick={() => placeObject(entry)} disabled={isBusy}>
                    {isBusy ? 'Inserting…' : 'Insert at cursor'}
                  </button>
                  {path ? <a href={path}>Open source</a> : null}
                  {entry.item ? (
                    <span className="think-grounded-object__order">
                      <button
                        type="button"
                        aria-label={`Move ${object.title} up`}
                        disabled={isBusy || siblingIndex <= 0}
                        onClick={() => moveObject(entry, -1)}
                      >↑</button>
                      <button
                        type="button"
                        aria-label={`Move ${object.title} down`}
                        disabled={isBusy || siblingIndex < 0 || siblingIndex >= siblings.length - 1}
                        onClick={() => moveObject(entry, 1)}
                      >↓</button>
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <p className={`think-grounded-objects__receipt ${error ? 'is-error' : ''}`} role="status" aria-live="polite">
        {error || message}
      </p>
      <p className="think-grounded-objects__keyboard-note">Drag to a line · use the labelled arrows to reorder.</p>
    </section>
  );
};

export { canonicalObjectType, highlightPath, normalizeObject, objectPath, toDraftCard };
export default ThinkGroundedObjects;
