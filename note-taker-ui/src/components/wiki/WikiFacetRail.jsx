import React, { useMemo, useState } from 'react';
import { SectionHeader, QuietButton } from '../ui';
import { labelFor } from './wikiGraph';
import {
  WIKI_FACET_STATUSES,
  WIKI_FACET_TYPES,
  WIKI_FACET_VISIBILITIES,
  isWikiAllPagesActive
} from './wikiFacetModel';

const FacetButton = ({
  active = false,
  count,
  label,
  onClick,
  hideWhenZero = false,
  testId
}) => {
  if (hideWhenZero && count === 0) return null;

  return (
    <QuietButton
      className={`list-button wiki-facet-rail__facet${active ? ' is-active' : ''}${count === 0 ? ' is-empty' : ''}`}
      aria-pressed={active}
      data-testid={testId}
      onClick={onClick}
    >
      <span>{label}</span>
      {typeof count === 'number' ? (
        <span className="library-cabinet-count">{count}</span>
      ) : null}
    </QuietButton>
  );
};

const FacetSection = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  const items = React.Children.toArray(children).filter(Boolean);

  if (!items.length) return null;

  return (
    <section className="wiki-facet-rail__section" aria-label={title}>
      <button
        type="button"
        className="wiki-facet-rail__section-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        <span className="wiki-facet-rail__section-chevron" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <div className="library-cabinet-nested wiki-facet-rail__section-items">
          {items}
        </div>
      ) : null}
    </section>
  );
};

/**
 * @param {{
 *  scope?: 'all' | 'primary' | 'deep',
 *  deepSectionsDefaultOpen?: boolean,
 *  query?: string,
 *  pageType?: string,
 *  visibility?: string,
 *  status?: string,
 *  needsReviewFilter?: boolean,
 *  facetCounts?: import('./wikiFacetModel').computeWikiFacetCounts extends (...args: any[]) => infer R ? R : never,
 *  onQueryChange?: (value: string) => void,
 *  onSelectAllPages?: () => void,
 *  onSelectNeedsReview?: () => void,
 *  onSelectPageType?: (pageType: string) => void,
 *  onSelectStatus?: (status: string) => void,
 *  onSelectVisibility?: (visibility: string) => void
 * }} props
 */
const WikiFacetRail = ({
  scope = 'all',
  deepSectionsDefaultOpen = scope === 'all',
  query = '',
  pageType = 'all',
  visibility = 'all',
  status = 'all',
  needsReviewFilter = false,
  facetCounts,
  onQueryChange,
  onSelectAllPages,
  onSelectNeedsReview,
  onSelectPageType,
  onSelectStatus,
  onSelectVisibility
}) => {
  const counts = facetCounts || {
    all: 0,
    needsReview: 0,
    byType: {},
    byStatus: {},
    byVisibility: {}
  };

  const allPagesActive = useMemo(() => isWikiAllPagesActive({
    pageType,
    visibility,
    status,
    needsReviewFilter
  }), [needsReviewFilter, pageType, status, visibility]);

  const showPrimary = scope === 'all' || scope === 'primary';
  const showDeep = scope === 'all' || scope === 'deep';
  const railClassName = [
    'wiki-facet-rail',
    'library-cabinet',
    scope === 'primary' ? 'wiki-facet-rail--primary' : '',
    scope === 'deep' ? 'wiki-facet-rail--deep' : ''
  ].filter(Boolean).join(' ');

  const deepSections = showDeep ? (
    <>
      <FacetSection title="By type" defaultOpen={deepSectionsDefaultOpen}>
        {WIKI_FACET_TYPES.map((type) => (
          <FacetButton
            key={type}
            label={labelFor(type)}
            count={counts.byType?.[type] ?? 0}
            active={pageType === type}
            hideWhenZero
            testId={`wiki-facet-type-${type}`}
            onClick={() => onSelectPageType?.(type)}
          />
        ))}
      </FacetSection>

      <FacetSection title="By status" defaultOpen={deepSectionsDefaultOpen}>
        {WIKI_FACET_STATUSES.map((value) => (
          <FacetButton
            key={value}
            label={labelFor(value)}
            count={counts.byStatus?.[value] ?? 0}
            active={status === value}
            hideWhenZero
            testId={`wiki-facet-status-${value}`}
            onClick={() => onSelectStatus?.(value)}
          />
        ))}
      </FacetSection>

      <FacetSection title="Shared / Private" defaultOpen={deepSectionsDefaultOpen}>
        {WIKI_FACET_VISIBILITIES.map((value) => (
          <FacetButton
            key={value}
            label={labelFor(value)}
            count={counts.byVisibility?.[value] ?? 0}
            active={visibility === value}
            hideWhenZero
            testId={`wiki-facet-visibility-${value}`}
            onClick={() => onSelectVisibility?.(value)}
          />
        ))}
      </FacetSection>
    </>
  ) : null;

  if (scope === 'deep') {
    return (
      <aside
        className={railClassName}
        aria-label="Wiki page deep facets"
        data-testid="wiki-facet-rail-deep"
      >
        {deepSections}
      </aside>
    );
  }

  return (
    <aside className={railClassName} aria-label="Wiki page facets" data-testid="wiki-facet-rail">
      {showPrimary ? (
        <>
          <SectionHeader title="Pages" subtitle="Browse your wiki." />
          <label className="wiki-facet-rail__search feedback-field">
            <span className="sr-only">Search wiki pages</span>
            <input
              type="search"
              value={query}
              placeholder="Search pages"
              aria-label="Search Wiki pages"
              data-testid="wiki-facet-search"
              onChange={(event) => onQueryChange?.(event.target.value)}
            />
          </label>

          <div className="library-cabinet-actions wiki-facet-rail__primary">
            <FacetButton
              label="All pages"
              count={counts.all}
              active={allPagesActive}
              testId="wiki-facet-all-pages"
              onClick={() => onSelectAllPages?.()}
            />
            <FacetButton
              label="Needs review"
              count={counts.needsReview}
              active={needsReviewFilter}
              testId="wiki-facet-needs-review"
              onClick={() => onSelectNeedsReview?.()}
            />
          </div>
        </>
      ) : null}

      {deepSections}
    </aside>
  );
};

export default WikiFacetRail;
