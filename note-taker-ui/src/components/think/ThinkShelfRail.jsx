import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  filterShelfRailSections,
  getWikiOpenQuestionHref,
  SHELF_RAIL_VISIBLE_LIMIT,
  sortShelfRailConcepts,
  sortShelfRailNotebook,
  sortShelfRailQuestions
} from './calmIndexModel';
import { SidebarSkeletonRows } from './EditorialRail';

const ShelfSection = ({
  label,
  items,
  loading,
  emptyMessage,
  renderItem,
  getItemKey
}) => {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? items : items.slice(0, SHELF_RAIL_VISIBLE_LIMIT);
  const hiddenCount = Math.max(0, items.length - SHELF_RAIL_VISIBLE_LIMIT);

  return (
    <section className="think-shelf-rail__section" aria-label={label}>
      <h2 className="think-shelf-rail__section-label">{label}</h2>
      {loading ? (
        <SidebarSkeletonRows rows={4} />
      ) : items.length === 0 ? (
        <p className="think-shelf-rail__empty muted small">{emptyMessage}</p>
      ) : (
        <>
          <ul className="think-shelf-rail__list">
            {visibleItems.map((item) => (
              <li key={getItemKey(item)}>
                {renderItem(item)}
              </li>
            ))}
          </ul>
          {!expanded && hiddenCount > 0 ? (
            <button
              type="button"
              className="think-shelf-rail__expand"
              onClick={() => setExpanded(true)}
            >
              all →
            </button>
          ) : null}
        </>
      )}
    </section>
  );
};

const ThinkShelfRail = ({
  search = '',
  onSearchChange,
  concepts = [],
  questions = [],
  notebookEntries = [],
  conceptsLoading = false,
  questionsLoading = false,
  notebookLoading = false,
  onSelectConcept,
  onSelectQuestion,
  onSelectNotebook
}) => {
  const filtered = useMemo(() => filterShelfRailSections({
    concepts,
    questions,
    notebookEntries,
    searchQuery: search
  }), [concepts, notebookEntries, questions, search]);

  const sortedConcepts = useMemo(
    () => sortShelfRailConcepts(filtered.concepts),
    [filtered.concepts]
  );
  const sortedQuestions = useMemo(
    () => sortShelfRailQuestions(filtered.questions),
    [filtered.questions]
  );
  const sortedNotebook = useMemo(
    () => sortShelfRailNotebook(filtered.notebookEntries),
    [filtered.notebookEntries]
  );

  return (
    <div className="think-shelf-rail" data-testid="think-shelf-rail">
      <label className="think-shelf-rail__search feedback-field">
        <span className="sr-only">Search concepts, questions, and notebook</span>
        <input
          type="search"
          value={search}
          placeholder="Search corpus"
          data-testid="think-index-search-input"
          onChange={(event) => onSearchChange?.(event.target.value)}
        />
      </label>

      <ShelfSection
        label="Concepts"
        items={sortedConcepts}
        loading={conceptsLoading}
        emptyMessage="No concepts yet."
        getItemKey={(item) => item.name}
        renderItem={(item) => (
          <button
            type="button"
            className="think-shelf-rail__item"
            onClick={() => onSelectConcept?.(item.name)}
          >
            <span className="think-shelf-rail__item-title">{item.name}</span>
            {Number.isFinite(item.count) && item.count > 0 ? (
              <span className="think-shelf-rail__item-meta">{item.count}</span>
            ) : null}
          </button>
        )}
      />

      <ShelfSection
        label="Questions"
        items={sortedQuestions}
        loading={questionsLoading}
        emptyMessage="No questions yet."
        getItemKey={(item) => item._id}
        renderItem={(item) => {
          const sourceHref = getWikiOpenQuestionHref(item);
          const content = (
            <>
              <span className="think-shelf-rail__item-title">{item.text || 'Untitled question'}</span>
              {sourceHref ? <span className="think-shelf-rail__item-meta">Wiki page</span> : null}
            </>
          );
          return sourceHref ? (
            <Link className="think-shelf-rail__item" to={sourceHref}>
              {content}
            </Link>
          ) : (
            <button
              type="button"
              className="think-shelf-rail__item"
              onClick={() => onSelectQuestion?.(item._id)}
            >
              {content}
            </button>
          );
        }}
      />

      <ShelfSection
        label="Notebook"
        items={sortedNotebook}
        loading={notebookLoading}
        emptyMessage="No notebook pages yet."
        getItemKey={(item) => item._id}
        renderItem={(item) => (
          <button
            type="button"
            className="think-shelf-rail__item"
            onClick={() => onSelectNotebook?.(item._id)}
          >
            <span className="think-shelf-rail__item-title">{item.title || 'Untitled'}</span>
          </button>
        )}
      />
    </div>
  );
};

export default ThinkShelfRail;
