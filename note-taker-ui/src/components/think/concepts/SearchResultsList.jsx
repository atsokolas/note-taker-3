import React from 'react';

/**
 * @param {{
 *  items: Array<any>,
 *  loading?: boolean,
 *  error?: string,
 *  emptyLabel?: string,
 *  renderItem: (item: any) => React.ReactNode
 * }} props
 */
const SearchResultsList = ({ items, loading, error, emptyLabel, renderItem }) => {
  if (loading) return <p className="muted small">Loading…</p>;
  if (error) return <p className="status-message error-message">{error}</p>;
  if (!items.length) return <p className="muted small">{emptyLabel || 'No results found.'}</p>;

  return (
    <div className="concept-search-results">
      {items.map(renderItem)}
    </div>
  );
};

export default SearchResultsList;
