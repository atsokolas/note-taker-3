import React from 'react';
import { sourceRowKey } from './librarySourceIdentity';

const formatDate = value => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
};

const hasSafeInternalHref = ref => {
  const href = typeof ref === 'string' ? ref : ref?.href;
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
};

const destinationLabel = type => {
  if (type === 'wiki_claim') return 'Claim';
  if (type === 'wiki_page') return 'Wiki';
  if (type === 'concept') return 'Concept';
  return 'Reference';
};

const sourceTypeLabel = type => {
  if (type === 'highlight') return 'Highlight';
  if (type === 'note') return 'Notebook';
  if (type === 'article') return 'Article';
  return 'Source';
};

const normalizeSourceEnvelope = (input) => {
  if (!input || typeof input !== 'object') return null;
  if (input.source && typeof input.source === 'object') {
    return {
      source: input.source,
      provenance: input.provenance || {},
      relevance: input.relevance || {},
      createdAt: input.createdAt || input.source.createdAt || null,
      title: input.source.title || input.title || '',
      type: input.source.type || input.type || 'article',
      id: input.source.id || input.id || '',
      parentId: input.source.parentId || input.parentId || '',
      href: input.source.href || input.href || '',
      sourceUrl: input.source.sourceUrl || input.sourceUrl || '',
      excerpt: input.excerpt || input.source.excerpt || input.provenance?.excerpt || ''
    };
  }
  return {
    source: {
      type: input.type || 'article',
      id: input.id || '',
      parentId: input.parentId || '',
      title: input.title || '',
      href: input.href || '',
      sourceUrl: input.sourceUrl || ''
    },
    provenance: input.provenance || {},
    relevance: input.relevance || {},
    createdAt: input.createdAt || null,
    title: input.title || '',
    type: input.type || 'article',
    id: input.id || '',
    parentId: input.parentId || '',
    href: input.href || '',
    sourceUrl: input.sourceUrl || '',
    excerpt: input.excerpt || input.provenance?.excerpt || ''
  };
};

const uniqueConnected = (connected) => {
  const list = Array.isArray(connected) ? connected : [];
  return list
    .filter(hasSafeInternalHref)
    .filter((ref, index, refs) => refs.findIndex(candidate => (
      `${candidate?.type}:${candidate?.id}:${candidate?.parentId || ''}`
      === `${ref?.type}:${ref?.id}:${ref?.parentId || ''}`
    )) === index);
};

const LibrarySourceTrace = ({
  source,
  loading = false,
  error = '',
  variant = 'inline',
  onOpenSource = null,
  emptyLabel = 'Select a source to inspect provenance and connections.'
}) => {
  const isPreview = variant === 'preview';

  if (loading) {
    return (
      <section
        className={`library-source-trace${isPreview ? ' library-source-trace--preview' : ''}`}
        aria-label="Source record"
        aria-live="polite"
        data-testid="library-source-trace"
      >
        <p className="library-source-trace__status">Tracing where this source appears…</p>
      </section>
    );
  }

  const envelope = normalizeSourceEnvelope(source);

  if (!envelope) {
    if (error) {
      return (
        <section
          className={`library-source-trace${isPreview ? ' library-source-trace--preview' : ''}`}
          aria-label="Source record"
          aria-live="polite"
          data-testid="library-source-trace"
        >
          <p className="library-source-trace__status">
            The article is available, but its source connections could not be loaded.
          </p>
        </section>
      );
    }
    if (isPreview) {
      return (
        <section
          className="library-source-trace library-source-trace--preview is-empty"
          aria-label="Source record"
          data-testid="library-source-trace"
        >
          <p className="library-source-trace__status">{emptyLabel}</p>
        </section>
      );
    }
    return null;
  }

  const provenance = envelope.provenance || {};
  const connected = uniqueConnected(envelope.relevance?.connected);
  const typeLabel = sourceTypeLabel(envelope.type);
  const title = envelope.title || 'Untitled source';
  const movementCount = Number(envelope.relevance?.movementCount || 0);
  const hasProvenanceFacts = Boolean(
    provenance.author
    || provenance.publicationDate
    || provenance.importedAt
    || provenance.sourceLabel
    || provenance.provider
    || provenance.siteName
    || provenance.parentTitle
    || envelope.createdAt
    || envelope.sourceUrl
  );

  const provenanceRows = [
    provenance.parentTitle ? { key: 'parent', label: 'From', value: provenance.parentTitle } : null,
    provenance.author ? { key: 'author', label: 'Author', value: provenance.author } : null,
    provenance.sourceLabel || provenance.provider || provenance.siteName
      ? {
        key: 'origin',
        label: 'Imported from',
        value: provenance.sourceLabel || provenance.provider || provenance.siteName
      }
      : null,
    provenance.publicationDate
      ? { key: 'published', label: 'Published', value: formatDate(provenance.publicationDate) }
      : null,
    provenance.importedAt || envelope.createdAt
      ? {
        key: 'saved',
        label: envelope.type === 'highlight' ? 'Highlighted' : 'Saved',
        value: formatDate(provenance.importedAt || envelope.createdAt)
      }
      : null,
    envelope.sourceUrl
      ? { key: 'url', label: 'Exact URL', value: envelope.sourceUrl, href: envelope.sourceUrl }
      : null
  ].filter(Boolean);

  const openLabel = envelope.type === 'note'
    ? 'Open in Notebook'
    : envelope.type === 'highlight'
      ? 'Open highlight'
      : 'Open source';
  const openHref = hasSafeInternalHref(envelope.href)
    ? envelope.href
    : envelope.type === 'note' && envelope.id
      ? `/think?tab=notebook&entryId=${encodeURIComponent(envelope.id)}`
      : envelope.type === 'highlight' && envelope.id && envelope.parentId
        ? `/library?articleId=${encodeURIComponent(envelope.parentId)}&highlightId=${encodeURIComponent(envelope.id)}`
        : envelope.id
          ? `/library?articleId=${encodeURIComponent(envelope.id)}`
          : '';

  const handleOpen = () => {
    if (typeof onOpenSource !== 'function') return;
    onOpenSource({
      type: envelope.type,
      id: envelope.id,
      parentId: envelope.parentId,
      title: envelope.title,
      href: envelope.href,
      sourceUrl: envelope.sourceUrl
    });
  };

  return (
    <section
      className={`library-source-trace${isPreview ? ' library-source-trace--preview' : ''}`}
      aria-labelledby="library-source-trace-title"
      data-testid="library-source-trace"
      data-source-key={sourceRowKey(envelope)}
    >
      <header className="library-source-trace__header">
        <div className="library-source-trace__heading">
          <p id="library-source-trace-title">{isPreview ? typeLabel : 'Source record'}</p>
          {isPreview && envelope.type !== 'highlight' ? (
            <h3 className="library-source-trace__title">{title}</h3>
          ) : null}
        </div>
        {movementCount > 0 ? (
          <span>
            {movementCount} material {movementCount === 1 ? 'change' : 'changes'}
          </span>
        ) : null}
      </header>

      {isPreview && envelope.type === 'highlight' ? (
        <blockquote className="library-source-trace__quote">
          {title}
        </blockquote>
      ) : null}

      {isPreview && envelope.type !== 'highlight' && envelope.excerpt ? (
        <p className="library-source-trace__excerpt">{envelope.excerpt}</p>
      ) : null}

      {!isPreview && hasProvenanceFacts ? (
        <p className="library-source-trace__facts">
          {[
            provenance.author,
            provenance.publicationDate ? `Published ${formatDate(provenance.publicationDate)}` : '',
            provenance.importedAt || envelope.createdAt
              ? `Saved ${formatDate(provenance.importedAt || envelope.createdAt)}`
              : '',
            provenance.sourceLabel || provenance.provider || provenance.siteName
          ].filter(Boolean).join(' · ')}
        </p>
      ) : null}

      {isPreview ? (
        <div className="library-source-trace__provenance" aria-label="Provenance">
          <span className="library-source-trace__section-label">Provenance</span>
          {provenanceRows.length > 0 ? (
            <ul>
              {provenanceRows.map(row => (
                <li key={row.key}>
                  <span>{row.label}</span>
                  {row.href ? (
                    <a href={row.href} target="_blank" rel="noopener noreferrer">
                      {row.value}
                    </a>
                  ) : (
                    <strong>{row.value}</strong>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="library-source-trace__status">Provenance unavailable for this source.</p>
          )}
        </div>
      ) : null}

      <div className="library-source-trace__uses">
        <span>{isPreview ? 'In your knowledge' : 'Appears in'}</span>
        {connected.length > 0 ? (
          <nav aria-label="Places using this source">
            {connected.map(ref => (
              <a
                key={`${ref.type}:${ref.id}:${ref.parentId || ''}`}
                href={ref.href}
              >
                <span>{destinationLabel(ref.type)}</span>
                {ref.title}
              </a>
            ))}
          </nav>
        ) : (
          <p>Not used in a Concept or Wiki page yet.</p>
        )}
      </div>

      {isPreview && hasSafeInternalHref(openHref) ? (
        <div className="library-source-trace__actions">
          <a
            href={openHref}
            className="library-source-trace__open"
            data-testid="library-source-trace-open"
            onClick={handleOpen}
          >
            {openLabel}
          </a>
          {envelope.sourceUrl ? (
            <a
              className="library-source-trace__external"
              href={envelope.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View original
            </a>
          ) : null}
        </div>
      ) : null}

      {error && isPreview ? (
        <p className="library-source-trace__status is-error" role="status">
          Additional source detail could not be loaded. Showing list provenance only.
        </p>
      ) : null}
    </section>
  );
};

export default LibrarySourceTrace;
