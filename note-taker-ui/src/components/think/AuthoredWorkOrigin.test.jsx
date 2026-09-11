import React from 'react';
import { render, screen } from '@testing-library/react';
import AuthoredWorkOrigin from './AuthoredWorkOrigin';
import { safeInternalPath } from '../../utils/sourceRoutes';

describe('AuthoredWorkOrigin', () => {
  const importMeta = {
    sourceType: 'authored_exploration',
    sourceLabel: 'Parenting',
    sourceUrl: '/wiki/read/page-1?claimId=claim-1&exploration=1',
    sourcePath: '/library?articleId=article-1#passage=exact',
    importedAt: '2026-09-07T15:30:00.000Z'
  };

  it('renders the kept date and both exact internal return doors', () => {
    render(<AuthoredWorkOrigin importMeta={importMeta} />);

    expect(screen.getByText(/Kept Sep 7, 2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to Parenting' })).toHaveAttribute('href', importMeta.sourceUrl);
    expect(screen.getByRole('link', { name: 'Open the chosen passage' })).toHaveAttribute('href', importMeta.sourcePath);
  });

  it('names each saved source and preserves its exact Library doorway in order', () => {
    const sources = [
      {
        articleTitle: 'First source',
        sourcePath: '/library?articleId=article-1&highlightId=highlight-1'
      },
      {
        articleTitle: 'Second source',
        sourcePath: '/library?articleId=article-2#passage=exact'
      }
    ];
    render(<AuthoredWorkOrigin importMeta={importMeta} sourceBlocks={sources} />);

    expect(screen.getAllByLabelText('Library sources')[0]).toHaveTextContent('Open First sourceOpen Second source');
    expect(screen.getByRole('link', { name: 'Open First source' })).toHaveAttribute('href', sources[0].sourcePath);
    expect(screen.getByRole('link', { name: 'Open Second source' })).toHaveAttribute('href', sources[1].sourcePath);
    expect(screen.queryByRole('link', { name: 'Open the chosen passage' })).not.toBeInTheDocument();
  });

  it('rejects external and protocol-relative provenance paths', () => {
    expect(safeInternalPath('https://example.com/wiki/read/page-1', '/wiki/read/')).toBe('');
    expect(safeInternalPath('//example.com/wiki/read/page-1', '/wiki/read/')).toBe('');
    expect(safeInternalPath('/library-elsewhere?articleId=article-1', '/library')).toBe('');
    render(<AuthoredWorkOrigin importMeta={{ ...importMeta, sourceUrl: 'javascript:alert(1)' }} />);
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('does not label another article as the recorded source when a saved path is mismatched', () => {
    render(<AuthoredWorkOrigin importMeta={importMeta} sourceBlocks={[null, {
      articleId: 'article-1', articleTitle: 'The recorded source',
      sourcePath: '/library?articleId=article-elsewhere#passage=wrong'
    }]} />);
    expect(screen.getByRole('link', { name: 'Open The recorded source' })).toHaveAttribute(
      'href', '/library?articleId=article-1'
    );
  });

  it('stays absent for ordinary notebook and question records', () => {
    const { container } = render(<AuthoredWorkOrigin importMeta={{ sourceType: 'concept' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

it('returns a kept Library exploration to the original saved passage', () => {
  const sourceUrl = '/library?articleId=article-1&highlightId=highlight-1&exploration=1';
  render(<AuthoredWorkOrigin importMeta={{ sourceType: 'authored_exploration', sourceLabel: 'A source', sourceUrl }} />);
  expect(screen.getByRole('link', { name: 'Return to A source' })).toHaveAttribute('href', sourceUrl);
});
