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
import {
  RoomShelf,
  RoomShelfList,
  RoomShelfSection,
  roomShelfItemClass
} from '../collection/RoomShelf';

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
    <RoomShelfSection className="think-shelf-rail__section" label={label}>
      {loading ? (
        <SidebarSkeletonRows rows={4} />
      ) : items.length === 0 ? (
        <p className="think-shelf-rail__empty muted small">{emptyMessage}</p>
      ) : (
        <>
          <RoomShelfList className="think-shelf-rail__list">
            {visibleItems.map((item) => (
              <li key={getItemKey(item)}>
                {renderItem(item)}
              </li>
            ))}
          </RoomShelfList>
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
    </RoomShelfSection>
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
  activeConcept = '',
  activeQuestionId = '',
  activeNotebookId = '',
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
    <RoomShelf
      className="think-shelf-rail"
      data-testid="think-shelf-rail"
      label="Think"
      count={concepts.length + questions.length + notebookEntries.length}
      search={search}
      searchLabel="Search concepts, questions, and notebook"
      searchPlaceholder="Search corpus"
      searchTestId="think-index-search-input"
      onSearchChange={onSearchChange}
    >

      <ShelfSection
        label="Concepts"
        items={sortedConcepts}
        loading={conceptsLoading}
        emptyMessage="No concepts yet."
        getItemKey={(item) => item.name}
        renderItem={(item) => (
          <button
            type="button"
            className={roomShelfItemClass({ active: item.name === activeConcept, className: 'think-shelf-rail__item' })}
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
            <Link className={roomShelfItemClass({ active: item._id === activeQuestionId, className: 'think-shelf-rail__item' })} to={sourceHref}>
              {content}
            </Link>
          ) : (
            <button
              type="button"
              className={roomShelfItemClass({ active: item._id === activeQuestionId, className: 'think-shelf-rail__item' })}
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
            className={roomShelfItemClass({ active: item._id === activeNotebookId, className: 'think-shelf-rail__item' })}
            onClick={() => onSelectNotebook?.(item._id)}
          >
            <span className="think-shelf-rail__item-title">{item.title || 'Untitled'}</span>
          </button>
        )}
      />
    </RoomShelf>
  );
};

export default ThinkShelfRail;
