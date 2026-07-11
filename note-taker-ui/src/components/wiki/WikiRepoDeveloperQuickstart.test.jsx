import React from 'react';
import { render, screen } from '@testing-library/react';
import WikiRepoDeveloperQuickstart from './WikiRepoDeveloperQuickstart';

const repoPage = {
  pageType: 'project',
  externalWatches: {
    githubRepo: { owner: 'atsokolas', repo: 'note-taker-3', status: 'active' }
  },
  plainText: [
    'Five-minute setup',
    'Run: npm run start - node server/server.js',
    'UI: npm run start from note-taker-ui/package.json - react-scripts start',
    'Test: npm run wiki:qa - git diff --check && node -c server/routes/wikiRoutes.js',
    'Build: npm run build from note-taker-ui/package.json - react-scripts build',
    'Key paths',
    'server/server.js'
  ].join('\n')
};

describe('WikiRepoDeveloperQuickstart', () => {
  it('renders copyable command rows with working directories', () => {
    render(<WikiRepoDeveloperQuickstart page={repoPage} />);

    expect(screen.getByRole('region', { name: 'Developer quickstart' })).toBeInTheDocument();
    expect(screen.getAllByText('repository root').length).toBeGreaterThan(0);
    expect(screen.getAllByText('npm run start').length).toBeGreaterThan(0);
    expect(screen.getByText('→ node server/server.js')).toBeInTheDocument();
    expect(screen.getAllByText('note-taker-ui').length).toBeGreaterThan(0);
    expect(screen.getByText('npm run wiki:qa')).toBeInTheDocument();
    expect(screen.getAllByText('package.json').length).toBeGreaterThan(0);
    expect(screen.getByText('CI=true npm run build')).toBeInTheDocument();
    expect(screen.queryByText(/git diff --check/)).not.toBeInTheDocument();
  });

  it('stays hidden when quickstart data is absent', () => {
    const { container } = render(<WikiRepoDeveloperQuickstart page={{ pageType: 'concept' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
