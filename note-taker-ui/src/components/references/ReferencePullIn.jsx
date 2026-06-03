import React, { useEffect, useMemo, useState } from 'react';
import { Button, QuietButton, SectionHeader } from '../ui';
import { createConnection, getConnectionsForItem, searchConnectableItems } from '../../api/connections';

const ITEM_TYPE_LABELS = {
  article: 'Article',
  concept: 'Concept',
  highlight: 'Highlight',
  notebook: 'Note',
  question: 'Question',
  wiki_page: 'Wiki'
};

const RELATION_LABELS = {
  extends: 'Extends',
  referenced_by: 'Referenced by',
  related: 'Related',
  supports: 'Supports',
  supported_by: 'Supported by',
  contradicts: 'Contradicts',
  contradicted_by: 'Contradicted by',
  contains: 'Contains',
  contained_by: 'Contained by',
  needs_review: 'Needs review',
  review_needed_by: 'Review needed by',
  wikiLink: 'Wiki link',
  shared_source: 'Shared source'
};

const normalizeRelationOptions = (options = []) => (
  Array.isArray(options)
    ? options
      .map((option) => {
        if (typeof option === 'string') return { value: option, label: formatRelationLabel(option) };
        return {
          value: String(option?.value || '').trim(),
          label: option?.label || formatRelationLabel(option?.value)
        };
      })
      .filter((option) => option.value)
    : []
);

const formatTypeLabel = (type = '') => ITEM_TYPE_LABELS[String(type || '').toLowerCase()] || 'Item';

const formatRelationLabel = (type = '') => RELATION_LABELS[String(type || '').trim()] || String(type || 'related').replace(/_/g, ' ');

const formatSnippet = (item) => {
  const value = String(item?.snippet || item?.title || '').trim();
  return value.length > 140 ? `${value.slice(0, 137)}...` : value;
};

const canonicalOpenPath = ({ item = {}, itemType = '', itemId = '' } = {}) => {
  const explicitPath = String(item?.openPath || item?.path || '').trim();
  if (itemType === 'wiki_page') {
    const id = String(itemId || '').trim();
    if (id) return `/wiki/workspace?page=${encodeURIComponent(id)}`;
  }
  if (itemType === 'wiki_claim') {
    const pageId = String(itemId || '').split(':')[0] || '';
    if (pageId) return `/wiki/workspace?page=${encodeURIComponent(pageId)}`;
  }
  if (explicitPath) return explicitPath;
  const id = String(itemId || '').trim();
  if (!id) return '';
  if (itemType === 'article') return `/library?articleId=${encodeURIComponent(id)}`;
  if (itemType === 'highlight') return `/library?highlightId=${encodeURIComponent(id)}`;
  if (itemType === 'question') return `/think?tab=questions&questionId=${encodeURIComponent(id)}`;
  if (itemType === 'notebook') return `/think?tab=notebook&entryId=${encodeURIComponent(id)}`;
  if (itemType === 'concept') {
    const title = String(item?.title || '').trim();
    return title ? `/think?tab=concepts&concept=${encodeURIComponent(title)}` : `/think?tab=concepts&conceptId=${encodeURIComponent(id)}`;
  }
  return '';
};

const normalizeRelatedItems = (items = []) => (
  Array.isArray(items)
    ? items
      .map((item) => ({
        itemType: item.itemType || item.type || '',
        itemId: item.itemId || item.id || '',
        articleId: item.articleId || item.metadata?.articleId || '',
        title: item.title || '',
        snippet: item.snippet || item.description || '',
        openPath: item.openPath || item.path || '',
        metadata: item.metadata || {}
      }))
      .filter((item) => item.itemType && item.itemId && item.title)
      .slice(0, 4)
    : []
);

const normalizeConnectionRows = (connections = {}) => {
  const outgoing = (Array.isArray(connections?.outgoing) ? connections.outgoing : [])
    .map((row) => ({
      id: row?._id || `${row?.toType}:${row?.toId}`,
      direction: 'outgoing',
      relationType: row?.relationType || 'related',
      itemType: row?.toType || row?.target?.itemType || '',
      itemId: row?.toId || row?.target?.itemId || row?.target?.id || '',
      title: row?.target?.title || row?.targetTitle || row?.toType || 'Item',
      openPath: canonicalOpenPath({
        item: row?.target || {},
        itemType: row?.toType || row?.target?.itemType || '',
        itemId: row?.toId || row?.target?.itemId || row?.target?.id || ''
      })
    }))
    .filter((row) => row.itemType && row.title);
  const incoming = (Array.isArray(connections?.incoming) ? connections.incoming : [])
    .map((row) => ({
      id: row?._id || `${row?.fromType}:${row?.fromId}`,
      direction: 'incoming',
      relationType: row?.relationType || 'related',
      itemType: row?.fromType || row?.source?.itemType || '',
      itemId: row?.fromId || row?.source?.itemId || row?.source?.id || '',
      title: row?.source?.title || row?.sourceTitle || row?.fromType || 'Item',
      openPath: canonicalOpenPath({
        item: row?.source || {},
        itemType: row?.fromType || row?.source?.itemType || '',
        itemId: row?.fromId || row?.source?.itemId || row?.source?.id || ''
      })
    }))
    .filter((row) => row.itemType && row.title);
  return { outgoing, incoming };
};

const connectionRowForItem = (item, id = '', relationType = 'related') => ({
  id: id || `${item.itemType}:${item.itemId}`,
  direction: 'outgoing',
  relationType,
  itemType: item.itemType,
  itemId: item.itemId,
  title: item.title || formatTypeLabel(item.itemType),
  openPath: canonicalOpenPath({
    item,
    itemType: item.itemType,
    itemId: item.itemId
  })
});

const incomingConnectionRowForItem = (item, id = '', relationType = 'referenced_by') => ({
  id: id || `${item.itemType}:${item.itemId}:reciprocal`,
  direction: 'incoming',
  relationType,
  itemType: item.itemType,
  itemId: item.itemId,
  title: item.title || formatTypeLabel(item.itemType),
  openPath: canonicalOpenPath({
    item,
    itemType: item.itemType,
    itemId: item.itemId
  })
});

const buildReceiptTrace = ({ receipt, outgoingCount = 0, incomingCount = 0 } = {}) => {
  if (!receipt) return [];
  if (receipt.status === 'saving') {
    return [
      'Writing forward reference',
      'Waiting for reciprocal edge',
      'Updating graph counts'
    ];
  }
  const target = `${formatTypeLabel(receipt.itemType)} landed`;
  if (receipt.status === 'existing') {
    return [
      target,
      'Existing reciprocal edge confirmed',
      `${outgoingCount} out · ${incomingCount} in`
    ];
  }
  return [
    target,
    'Reciprocal edge saved',
    `${outgoingCount} out · ${incomingCount} in`
  ];
};

const upsertOutgoingConnection = (connectionState, row) => ({
  ...connectionState,
  outgoing: [
    row,
    ...(connectionState.outgoing || []).filter((existing) => (
      existing.id !== row.id
      && `${existing.itemType}:${existing.title}` !== `${row.itemType}:${row.title}`
    ))
  ].slice(0, 8)
});

const upsertIncomingConnection = (connectionState, row) => ({
  ...connectionState,
  incoming: [
    row,
    ...(connectionState.incoming || []).filter((existing) => (
      existing.id !== row.id
      && `${existing.itemType}:${existing.title}` !== `${row.itemType}:${row.title}`
    ))
  ].slice(0, 8)
});

const ReferencePullIn = ({
  targetType = '',
  targetId = '',
  targetTitle = '',
  scopeType = '',
  scopeId = '',
  relatedItems = [],
  className = '',
  onLinked,
  onPulled,
  connectionPayloadForItem,
  relationOptions = [],
  defaultRelationType = 'related'
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [linkedItems, setLinkedItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [linkReceipt, setLinkReceipt] = useState(null);
  const [connectionState, setConnectionState] = useState({ outgoing: [], incoming: [], loading: false, error: '' });

  const hasTarget = Boolean(targetType && targetId);
  const related = useMemo(() => normalizeRelatedItems(relatedItems), [relatedItems]);
  const normalizedRelationOptions = useMemo(() => normalizeRelationOptions(relationOptions), [relationOptions]);
  const [selectedRelationType, setSelectedRelationType] = useState(defaultRelationType || 'related');
  const trimmedQuery = query.trim();
  const scopePayload = useMemo(
    () => (scopeType && scopeId ? { scopeType, scopeId } : {}),
    [scopeType, scopeId]
  );

  useEffect(() => {
    if (!hasTarget) {
      setConnectionState({ outgoing: [], incoming: [], loading: false, error: '' });
      return undefined;
    }
    let cancelled = false;
    const loadConnections = async () => {
      setConnectionState((current) => ({ ...current, loading: true, error: '' }));
      try {
        const data = await getConnectionsForItem({
          itemType: targetType,
          itemId: targetId,
          ...scopePayload
        });
        if (!cancelled) {
          setConnectionState({
            ...normalizeConnectionRows(data),
            loading: false,
            error: ''
          });
        }
      } catch (err) {
        if (!cancelled) {
          setConnectionState({
            outgoing: [],
            incoming: [],
            loading: false,
            error: err.response?.data?.error || 'Failed to load references.'
          });
        }
      }
    };
    loadConnections();
    return () => {
      cancelled = true;
    };
  }, [hasTarget, scopePayload, targetId, targetType]);

  useEffect(() => {
    if (!normalizedRelationOptions.length) {
      setSelectedRelationType(defaultRelationType || 'related');
      return;
    }
    const hasSelected = normalizedRelationOptions.some((option) => option.value === selectedRelationType);
    if (!hasSelected) setSelectedRelationType(normalizedRelationOptions[0].value);
  }, [defaultRelationType, normalizedRelationOptions, selectedRelationType]);

  useEffect(() => {
    if (!hasTarget) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const items = await searchConnectableItems({
          q: trimmedQuery,
          excludeType: targetType,
          excludeId: targetId,
          ...scopePayload,
          limit: 6
        });
        if (!cancelled) setResults(Array.isArray(items) ? items : []);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to search references.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, trimmedQuery ? 180 : 320);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [hasTarget, scopePayload, targetId, targetType, trimmedQuery]);

  const handleLink = async (item) => {
    if (!hasTarget || !item?.itemType || !item?.itemId) return;
    const key = `${item.itemType}:${item.itemId}`;
    setSavingId(key);
    setError('');
    setLinkReceipt({
      key,
      status: 'saving',
      itemType: item.itemType,
      title: item.title || formatTypeLabel(item.itemType),
      message: 'Saving bidirectional trace...'
    });
    try {
      const payload = connectionPayloadForItem?.(item, {
        targetType,
        targetId,
        scopeType,
        scopeId,
        scopePayload,
        relationType: selectedRelationType
      }) || {
        fromType: targetType,
        fromId: targetId,
        toType: item.itemType,
        toId: item.itemId,
        relationType: selectedRelationType || 'related',
        ...scopePayload
      };
      const created = await createConnection(payload);
      const nextItem = {
        ...item,
        articleId: item.articleId || item.metadata?.articleId || '',
        connectionId: created?._id || key
      };
      const row = connectionRowForItem(item, created?._id || key, created?.relationType || selectedRelationType || 'related');
      const reciprocalRow = created?.trace?.bidirectional || created?.reciprocalConnection
        ? incomingConnectionRowForItem(
          item,
          created?.reciprocalConnection?._id || created?.trace?.reciprocalId || `${key}:reciprocal`,
          created?.trace?.reciprocalRelationType || created?.reciprocalConnection?.relationType || 'referenced_by'
        )
        : null;
      setConnectionState((current) => (
        reciprocalRow
          ? upsertIncomingConnection(upsertOutgoingConnection(current, row), reciprocalRow)
          : upsertOutgoingConnection(current, row)
      ));
      setLinkedItems((current) => [
        nextItem,
        ...current.filter((existing) => `${existing.itemType}:${existing.itemId}` !== key)
      ].slice(0, 5));
      setLinkReceipt({
        key,
        status: 'saved',
        itemType: item.itemType,
        title: item.title || formatTypeLabel(item.itemType),
        message: reciprocalRow
          ? 'Reference landed. Bidirectional trace saved both ways.'
          : 'Reference landed. Bidirectional trace saved.'
      });
      setQuery('');
      setResults([]);
      onLinked?.(created);
      onPulled?.({ item: nextItem, connection: created, status: 'saved' });
    } catch (err) {
      const status = err.response?.status;
      if (status === 409) {
        const row = connectionRowForItem(item, key);
        const reciprocalRow = incomingConnectionRowForItem(item, `${key}:reciprocal`);
        setConnectionState((current) => upsertIncomingConnection(upsertOutgoingConnection(current, row), reciprocalRow));
        setLinkedItems((current) => [
          item,
          ...current.filter((existing) => `${existing.itemType}:${existing.itemId}` !== key)
        ].slice(0, 5));
        setLinkReceipt({
          key,
          status: 'existing',
          itemType: item.itemType,
          title: item.title || formatTypeLabel(item.itemType),
          message: 'Reference already linked. Bidirectional trace is live.'
        });
        setQuery('');
        setResults([]);
        onPulled?.({ item, connection: null, status: 'existing' });
      } else {
        setLinkReceipt(null);
        setError(err.response?.data?.error || 'Failed to pull this reference in.');
      }
    } finally {
      setSavingId('');
    }
  };

  const visibleItems = linkedItems.length > 0 ? linkedItems : related;
  const hasConnectionRows = connectionState.outgoing.length > 0 || connectionState.incoming.length > 0;
  const receiptTrace = buildReceiptTrace({
    receipt: linkReceipt,
    outgoingCount: connectionState.outgoing.length,
    incomingCount: connectionState.incoming.length
  });
  const constellation = useMemo(() => {
    const rows = [...connectionState.outgoing, ...connectionState.incoming];
    const typeCounts = rows.reduce((counts, row) => {
      const label = formatTypeLabel(row.itemType);
      counts[label] = (counts[label] || 0) + 1;
      return counts;
    }, {});
    return {
      rows: rows.slice(0, 6),
      total: rows.length,
      types: Object.entries(typeCounts).slice(0, 4)
    };
  }, [connectionState.incoming, connectionState.outgoing]);

  return (
    <section className={`reference-pull-in ${className}`.trim()} aria-label="Reference pull-in">
      <SectionHeader
        title="Reference"
        subtitle={hasTarget ? 'Pull Library, Think, and Wiki material into this surface.' : 'Open an item to pull sources into it.'}
      />
      {targetTitle && (
        <p className="reference-pull-in__target muted small">
          Landing in <strong>{targetTitle}</strong>
        </p>
      )}
      {normalizedRelationOptions.length > 1 ? (
        <div className="reference-pull-in__relations" role="group" aria-label="Reference relationship">
          {normalizedRelationOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={selectedRelationType === option.value}
              onClick={() => setSelectedRelationType(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="reference-pull-in__search">
        <input
          type="search"
          value={query}
          disabled={!hasTarget}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Reference Library, wiki, notes, questions..."
          aria-label="Search references to pull in"
        />
        <Button
          variant="secondary"
          disabled={!hasTarget || results.length === 0 || loading}
          onClick={() => handleLink(results[0])}
        >
          Pull
        </Button>
      </div>
      {loading && <p className="muted small">Searching corpus...</p>}
      {error && <p className="status-message error-message">{error}</p>}
      {linkReceipt && (
        <>
          <div
            className={`reference-pull-in__receipt is-${linkReceipt.status}`}
            role="status"
            aria-live="polite"
          >
            <span className="reference-pull-in__receipt-dot" aria-hidden="true" />
            <span>
              <strong>{linkReceipt.message}</strong>
              <em>{formatTypeLabel(linkReceipt.itemType)} · {linkReceipt.title}</em>
            </span>
          </div>
          {receiptTrace.length > 0 ? (
            <ol className="reference-pull-in__trace" aria-label="Graph trace receipt">
              {receiptTrace.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          ) : null}
          {linkReceipt.status !== 'saving' ? (
            <span
              className="reference-pull-in__arc"
              data-testid="reference-link-arc"
              aria-hidden="true"
            />
          ) : null}
        </>
      )}
      {!loading && results.length > 0 && (
        <div className="reference-pull-in__results">
          {results.map((item) => {
            const key = `${item.itemType}:${item.itemId}`;
            const openPath = canonicalOpenPath({
              item,
              itemType: item.itemType,
              itemId: item.itemId
            });
            return (
              <div
                key={key}
                className="reference-pull-in__result"
              >
                <button
                  type="button"
                  className="reference-pull-in__result-main"
                  onClick={() => handleLink(item)}
                  disabled={savingId === key}
                >
                  <span className="reference-pull-in__result-title">{item.title || formatTypeLabel(item.itemType)}</span>
                  <span className="reference-pull-in__result-meta">
                    {formatTypeLabel(item.itemType)} · {formatSnippet(item)}
                  </span>
                </button>
                {openPath ? (
                  <a className="reference-pull-in__result-open" href={openPath}>
                    Open
                  </a>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {visibleItems.length > 0 && (
        <div className="reference-pull-in__strip" aria-label="Pulled references">
          {visibleItems.map((item) => {
            const key = `${item.itemType}:${item.itemId}`;
            return (
              <QuietButton
                key={key}
                className={`reference-pull-in__chip${linkReceipt?.key === key ? ' is-linked' : ''}`}
                onClick={() => handleLink(item)}
                disabled={!hasTarget}
              >
                {formatTypeLabel(item.itemType)} · {item.title}
              </QuietButton>
            );
          })}
        </div>
      )}
      {hasConnectionRows && (
        <div className="reference-pull-in__constellation" aria-label="Local constellation">
          <div className="reference-pull-in__constellation-head">
            <span>Local constellation</span>
            <strong>{constellation.total} trace{constellation.total === 1 ? '' : 's'}</strong>
          </div>
          {constellation.types.length > 0 ? (
            <div className="reference-pull-in__constellation-types" aria-label="Connected object types">
              {constellation.types.map(([label, count]) => (
                <span key={label}>{count} {label}</span>
              ))}
            </div>
          ) : null}
          <div className="reference-pull-in__constellation-edges">
            {constellation.rows.map(row => (
              <a
                key={`${row.direction}-${row.id}`}
                className={`reference-pull-in__constellation-edge is-${row.direction}`}
                data-direction={row.direction}
                href={row.openPath || undefined}
                aria-disabled={row.openPath ? undefined : 'true'}
              >
                <span>{row.direction === 'outgoing' ? 'This uses' : 'This is used by'}</span>
                <strong>{row.title}</strong>
                <em>{formatRelationLabel(row.relationType)}</em>
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="reference-pull-in__backlinks" aria-label="Referenced by">
        <div className="reference-pull-in__backlinks-head">
          <span>References</span>
          <span>
            {connectionState.outgoing.length} out · {connectionState.incoming.length} in
          </span>
        </div>
        {connectionState.loading && <p className="muted small">Reading graph links...</p>}
        {connectionState.error && <p className="status-message error-message">{connectionState.error}</p>}
        {!connectionState.loading && !connectionState.error && !hasConnectionRows && (
          <p className="muted small">No references yet.</p>
        )}
        {!connectionState.loading && !connectionState.error && hasConnectionRows && (
          <div className="reference-pull-in__backlink-list">
            {connectionState.outgoing.slice(0, 3).map((row) => (
              <a
                key={`out-${row.id}`}
                className="reference-pull-in__backlink-row"
                href={row.openPath || undefined}
                aria-disabled={row.openPath ? undefined : 'true'}
              >
                <span>Uses</span>
                <strong>{row.title}</strong>
                <em>{formatTypeLabel(row.itemType)}</em>
              </a>
            ))}
            {connectionState.incoming.slice(0, 3).map((row) => (
              <a
                key={`in-${row.id}`}
                className="reference-pull-in__backlink-row"
                href={row.openPath || undefined}
                aria-disabled={row.openPath ? undefined : 'true'}
              >
                <span>Used by</span>
                <strong>{row.title}</strong>
                <em>{formatTypeLabel(row.itemType)}</em>
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default ReferencePullIn;
