import React from 'react';
import { Link } from 'react-router-dom';
import { repoDossierGitHubLabel, repoDossierGitHubUrl } from './wikiRepoDossierModel';

const SectionNavLink = ({ item, badgeCount = 0, onNavigate }) => {
  if (!item?.available) {
    return (
      <li className="wiki-read__repo-dossier-nav-item is-missing">
        <span aria-disabled="true">{item.label}</span>
        <span className="wiki-read__repo-dossier-nav-note">Not in page yet</span>
      </li>
    );
  }
  return (
    <li className="wiki-read__repo-dossier-nav-item">
      <a href={`#${item.anchorId}`} onClick={onNavigate}>
        {item.label}
        {badgeCount > 0 ? (
          <span className="wiki-read__repo-dossier-nav-badge" aria-label={`${badgeCount} maintenance changes`}>
            {badgeCount}
          </span>
        ) : null}
      </a>
    </li>
  );
};

const WikiRepoDossierOverview = ({
  page,
  overviewSummary = '',
  sectionNav = [],
  sectionBadges = {},
  publicationMessage = '',
  publishedHead = '',
  buildStateLabel = '',
  comparisonHref = '',
  comparisonPendingShare = false,
  collapseEnabled = false,
  sectionsExpandedByDefault = false,
  onSectionNavigate
}) => {
  const repoLabel = repoDossierGitHubLabel(page);
  const githubUrl = repoDossierGitHubUrl(page);

  return (
    <section className="wiki-read__repo-dossier" aria-label="Repository dossier overview">
      <div className="wiki-read__repo-dossier-head">
        <span className="wiki-read__repo-dossier-kicker">Repository dossier</span>
        <h4>Developer entry point</h4>
        <p className="wiki-read__repo-dossier-lede">
          {overviewSummary || 'One canonical page for what this repository is, how to run it, where boundaries live, what changed, and what remains uncertain.'}
        </p>
      </div>

      <div className="wiki-read__repo-dossier-orientation">
        <div>
          <span className="wiki-read__repo-dossier-label">Repository</span>
          {githubUrl ? (
            <a href={githubUrl} target="_blank" rel="noopener noreferrer">
              {repoLabel || 'GitHub repository'}
            </a>
          ) : (
            <span>{repoLabel || 'GitHub repository not linked yet'}</span>
          )}
        </div>
        {publishedHead ? (
          <div>
            <span className="wiki-read__repo-dossier-label">Current through</span>
            <span>{publishedHead}</span>
          </div>
        ) : null}
        {buildStateLabel ? (
          <div>
            <span className="wiki-read__repo-dossier-label">Build state</span>
            <span>{buildStateLabel}</span>
          </div>
        ) : null}
      </div>

      {publicationMessage ? (
        <p className="wiki-read__repo-dossier-publication" role="status">{publicationMessage}</p>
      ) : null}

      <nav className="wiki-read__repo-dossier-nav" aria-label="Repository dossier quick links">
        <span className="wiki-read__repo-dossier-label">Sections</span>
        <ul>
          {sectionNav.map(item => (
            <SectionNavLink
              key={item.id}
              item={item}
              badgeCount={Number(sectionBadges[item.id] || 0)}
              onNavigate={onSectionNavigate}
            />
          ))}
        </ul>
      </nav>

      {comparisonHref ? (
        <p className="wiki-read__repo-dossier-comparison">
          <Link to={comparisonHref}>View repository maintenance comparison</Link>
        </p>
      ) : comparisonPendingShare ? (
        <p className="wiki-read__repo-dossier-comparison wiki-read__repo-dossier-comparison--pending">
          Maintenance comparison is ready. Share this page to expose the public comparison link.
        </p>
      ) : null}

      {collapseEnabled ? (
        <p className="wiki-read__repo-dossier-collapse-note">
          {sectionsExpandedByDefault
            ? 'All sections are expanded below. Use each section arrow to collapse or reopen it.'
            : 'Long sections stay collapsed below. Open a section to read the full maintained article.'}
        </p>
      ) : null}
    </section>
  );
};

export default WikiRepoDossierOverview;
