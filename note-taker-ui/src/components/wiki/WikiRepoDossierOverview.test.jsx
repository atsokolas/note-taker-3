import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiRepoDossierOverview from './WikiRepoDossierOverview';

const page = {
  externalWatches: {
    githubRepo: { owner: 'atsokolas', repo: 'note-taker-3', status: 'active' }
  }
};

const sectionNav = [
  { id: 'overview', label: 'Overview', anchorId: 'repo-section-overview', available: true },
  { id: 'architecture', label: 'Architecture', anchorId: 'repo-section-architecture', available: true },
  { id: 'key-decisions', label: 'Key decisions', anchorId: 'repo-section-key-decisions', available: false },
  { id: 'changelog-digest', label: 'Changelog digest', anchorId: 'repo-section-changelog-digest', available: false },
  { id: 'open-questions', label: 'Open questions', anchorId: 'repo-section-open-questions', available: true }
];

describe('WikiRepoDossierOverview', () => {
  it('renders orientation, section nav, and comparison link', () => {
    render(
      <MemoryRouter>
        <WikiRepoDossierOverview
          page={page}
          overviewSummary="Noeis connects Library, Think, and Wiki for maintained repo documentation."
          sectionNav={sectionNav}
          sectionBadges={{ architecture: 2 }}
          publicationMessage="Page current through a7cc281 · checked 2h ago"
          publishedHead="a7cc281"
          buildStateLabel="Current"
          comparisonHref="/share/wiki/wiki-repo-1/comparison"
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('region', { name: 'Repository dossier overview' })).toBeInTheDocument();
    expect(screen.getByText(/Noeis connects Library, Think, and Wiki/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'atsokolas/note-taker-3' })).toHaveAttribute('href', 'https://github.com/atsokolas/note-taker-3');
    expect(screen.getByRole('navigation', { name: 'Repository dossier quick links' })).toHaveTextContent('Architecture');
    expect(screen.getByRole('link', { name: /View repository maintenance comparison/i })).toHaveAttribute(
      'href',
      '/share/wiki/wiki-repo-1/comparison'
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
