import React from 'react';
import { AGENT_DISPLAY_NAME } from '../../constants/agentIdentity';

export const SidebarSkeletonRows = React.memo(({ rows = 4 }) => (
  <div className="library-article-skeletons" aria-hidden="true">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={`think-skeleton-${index}`} className="think-list-skeleton-row">
        <div className="skeleton skeleton-title" style={{ width: `${52 + (index % 3) * 14}%` }} />
        <div className="skeleton skeleton-text" style={{ width: `${28 + (index % 2) * 16}%` }} />
      </div>
    ))}
  </div>
));

export const CalmEmptyLine = React.memo(({ children }) => (
  <p className="think-calm-empty-line">{children}</p>
));

const EditorialRail = React.memo(({
  heroTitle = AGENT_DISPLAY_NAME,
  heroSubtitle = 'Contextual intelligence',
  ctaLabel = 'New inquiry',
  onCta = () => {},
  ctaDisabled = false,
  navItems = [],
  activeNav = '',
  onChangeNav = () => {},
  sections = [],
  footer = null
}) => {
  const activeNavIndex = Math.max(0, navItems.findIndex((item) => item.key === activeNav));

  return (
    <div className="concept-editorial-partner concept-editorial-partner--index">
      <div className="concept-editorial-partner__hero">
        <div className="concept-editorial-partner__title-row">
          <div className="concept-editorial-partner__mark">✦</div>
          <div className="concept-editorial-partner__title-copy">
            <h2>{heroTitle}</h2>
            <p>{heroSubtitle}</p>
          </div>
        </div>
        {ctaLabel ? (
          <button
            type="button"
            className="concept-editorial-partner__new-inquiry"
            onClick={onCta}
            disabled={ctaDisabled}
          >
            {ctaLabel}
          </button>
        ) : null}
      </div>

      {navItems.length > 0 && (
        <nav className="concept-editorial-partner__nav" aria-label={`${heroTitle} sections`}>
          <span
            className="concept-editorial-partner__nav-indicator"
            aria-hidden="true"
            style={{ transform: `translateY(${activeNavIndex * 39}px)` }}
          />
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={activeNav === item.key ? 'is-active' : ''}
              onClick={() => onChangeNav(item.key)}
            >
              <span className="concept-editorial-partner__nav-short">{item.short}</span>
              <span className="concept-editorial-partner__nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="concept-editorial-partner__sections">
        {sections.map((section) => (
          <section
            key={section.label}
            className={`concept-editorial-partner__section ${section.flush ? 'concept-editorial-partner__section--flush' : ''}`.trim()}
          >
            <span>{section.label}</span>
            {section.content}
          </section>
        ))}
      </div>

      {footer ? (
        <div className="concept-editorial-partner__footer">
          {footer}
        </div>
      ) : null}
    </div>
  );
});

export default EditorialRail;
