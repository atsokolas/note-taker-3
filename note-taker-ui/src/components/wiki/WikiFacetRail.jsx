import React, { useMemo } from 'react';
import {
  RoomShelf,
  RoomShelfButton,
  RoomShelfList,
  RoomShelfMeta,
  RoomShelfSection,
} from '../collection/RoomShelf';
import {
  WIKI_KINDS,
  WIKI_KIND_LABELS,
  isWikiAllPagesActive
} from './wikiFacetModel';

const FacetButton = ({
  active = false,
  count,
  label,
  nested = false,
  onClick,
  testId
}) => {
  return (
    <RoomShelfButton
      active={active}
      nested={nested}
      className={`wiki-facet-rail__facet${count === 0 ? ' is-empty' : ''}`}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
    >
      <span>{label}</span>
      {typeof count === 'number' ? (
        <RoomShelfMeta>{count}</RoomShelfMeta>
      ) : null}
    </RoomShelfButton>
  );
};

/**
 * @param {{
 *  query?: string,
 *  kind?: 'all' | 'general' | 'repository' | 'investment',
 *  pageType?: string,
 *  visibility?: string,
 *  status?: string,
 *  needsReviewFilter?: boolean,
 *  facetCounts?: import('./wikiFacetModel').computeWikiFacetCounts extends (...args: any[]) => infer R ? R : never,
 *  onQueryChange?: (value: string) => void,
 *  onSelectAllPages?: () => void,
 *  onSelectKind?: (kind: string) => void,
 *  onSelectNeedsReview?: () => void,
 * }} props
 */
const WikiFacetRail = ({
  query = '',
  kind = 'all',
  pageType = 'all',
  visibility = 'all',
  status = 'all',
  needsReviewFilter = false,
  facetCounts,
  onQueryChange,
  onSelectAllPages,
  onSelectKind,
  onSelectNeedsReview
}) => {
  const counts = facetCounts || {
    all: 0,
    needsReview: 0,
    byKind: {},
    byType: {},
    byStatus: {},
    byVisibility: {}
  };

  const allPagesActive = useMemo(() => isWikiAllPagesActive({
    kind,
    pageType,
    visibility,
    status,
    needsReviewFilter
  }), [kind, needsReviewFilter, pageType, status, visibility]);

  return (
    <RoomShelf
      className="wiki-facet-rail"
      aria-label="Wiki page facets"
      data-testid="wiki-facet-rail"
      label="Pages"
      count={counts.all}
      description="Browse your wiki."
      search={query}
      searchLabel="Search Wiki pages"
      searchPlaceholder="Search pages"
      searchTestId="wiki-facet-search"
      onSearchChange={onQueryChange}
    >
      <RoomShelfList className="wiki-facet-rail__primary">
        <li>
          <FacetButton
            label="All pages"
            count={counts.all}
            active={allPagesActive}
            testId="wiki-facet-all-pages"
            onClick={() => onSelectAllPages?.()}
          />
        </li>
        <li>
          <FacetButton
            label="Needs review"
            count={counts.needsReview}
            active={needsReviewFilter}
            testId="wiki-facet-needs-review"
            onClick={() => onSelectNeedsReview?.()}
          />
        </li>
      </RoomShelfList>
      <RoomShelfSection className="wiki-facet-rail__section" label="Kinds">
        <RoomShelfList className="wiki-facet-rail__section-items">
          {WIKI_KINDS.map((value) => (
            <li key={value}>
              <FacetButton
                label={WIKI_KIND_LABELS[value]}
                count={counts.byKind?.[value] ?? 0}
                active={kind === value}
                nested
                testId={`wiki-facet-kind-${value}`}
                onClick={() => onSelectKind?.(value)}
              />
            </li>
          ))}
        </RoomShelfList>
      </RoomShelfSection>
    </RoomShelf>
  );
};

export default WikiFacetRail;
