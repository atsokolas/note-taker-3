import React from 'react';

const PAGE_TYPES = ['concept', 'entity', 'source', 'question', 'comparison', 'overview', 'project', 'log', 'topic'];
const STATUSES = ['draft', 'published', 'archived'];
const VISIBILITIES = ['private', 'shared'];
const SOURCE_SCOPES = ['entire_library', 'current_item', 'selected_sources'];

const labels = {
  entire_library: 'Entire library',
  current_item: 'Current item',
  selected_sources: 'Selected sources'
};

const labelFor = (value = '') => labels[value] || String(value || '').replace(/_/g, ' ');

const saveCopy = {
  idle: 'Loaded',
  dirty: 'Unsaved changes',
  saving: 'Saving...',
  saved: 'Saved just now',
  failed: 'Save failed'
};

const WikiPageMetaBar = ({ page, onChange, saveStatus = 'idle' }) => {
  const pageId = String(page?._id || page?.id || '').trim();
  const shareUrl = page?.visibility === 'shared' && pageId && typeof window !== 'undefined'
    ? `${window.location.origin}/share/wiki/${encodeURIComponent(pageId)}`
    : '';

  return (
    <div className="wiki-meta-bar" aria-label="Wiki page metadata">
      <label>
        Type
        <select value={page.pageType || 'topic'} onChange={(event) => onChange({ pageType: event.target.value })}>
          {PAGE_TYPES.map(value => <option key={value} value={value}>{labelFor(value)}</option>)}
        </select>
      </label>
      <label>
        Status
        <select value={page.status || 'draft'} onChange={(event) => onChange({ status: event.target.value })}>
          {STATUSES.map(value => <option key={value} value={value}>{labelFor(value)}</option>)}
        </select>
      </label>
      <label>
        Visibility
        <select value={page.visibility || 'private'} onChange={(event) => onChange({ visibility: event.target.value })}>
          {VISIBILITIES.map(value => <option key={value} value={value}>{labelFor(value)}</option>)}
        </select>
      </label>
      <label>
        Source scope
        <select value={page.sourceScope || 'entire_library'} onChange={(event) => onChange({ sourceScope: event.target.value })}>
          {SOURCE_SCOPES.map(value => <option key={value} value={value}>{labelFor(value)}</option>)}
        </select>
      </label>
      <span className={`wiki-meta-bar__save-state wiki-meta-bar__save-state--${saveStatus}`} aria-live="polite">
        {saveCopy[saveStatus] || saveCopy.idle}
      </span>
      {shareUrl ? (
        <span className="wiki-meta-bar__share" role="status">
          <span>Public page ready: citations included, private source notes withheld.</span>
          <a className="wiki-meta-bar__share-link" href={shareUrl} target="_blank" rel="noopener noreferrer">
            Public link
          </a>
        </span>
      ) : null}
    </div>
  );
};

export default WikiPageMetaBar;
