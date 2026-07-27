import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LibrarySourceTrace from './LibrarySourceTrace';

const source = {
  createdAt: '2026-07-27T12:00:00.000Z',
  provenance: {
    provider: 'readwise',
    sourceLabel: 'Readwise Reader',
    author: 'Ada Example',
    publicationDate: '2026-07-20T00:00:00.000Z',
    importedAt: '2026-07-27T12:00:00.000Z'
  },
  relevance: {
    movementCount: 1,
    connected: [
      {
        type: 'concept',
        id: 'concept-1',
        title: 'Inference economics',
        href: '/think?tab=concepts&concept=Inference%20economics'
      },
      {
        type: 'wiki_claim',
        id: 'claim-1',
        parentId: 'page-1',
        title: 'Utilization changes cost',
        href: '/wiki/workspace?page=page-1&claimId=claim-1'
      },
      {
        type: 'wiki_page',
        id: 'unsafe-protocol-relative',
        title: 'Unsafe protocol-relative',
        href: '//example.com'
      }
    ]
  }
};

describe('LibrarySourceTrace', () => {
  it('renders import identity and exact durable destinations', () => {
    render(<LibrarySourceTrace source={source} />);

    expect(screen.getByText('Source record')).toBeInTheDocument();
    expect(screen.getByText(/Ada Example/)).toBeInTheDocument();
    expect(screen.getByText(/Readwise Reader/)).toBeInTheDocument();
    expect(screen.getByText('1 material change')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Concept Inference economics/ }))
      .toHaveAttribute('href', '/think?tab=concepts&concept=Inference%20economics');
    expect(screen.getByRole('link', { name: /Claim Utilization changes cost/ }))
      .toHaveAttribute('href', '/wiki/workspace?page=page-1&claimId=claim-1');
    expect(screen.queryByText('Unsafe protocol-relative')).not.toBeInTheDocument();
  });

  it('omits malformed and protocol-relative KnowledgeRef links', () => {
    render(
      <LibrarySourceTrace
        source={{
          provenance: { author: 'Safe Author' },
          relevance: {
            connected: [
              {
                type: 'wiki_page',
                id: 'safe',
                title: 'Safe wiki page',
                href: '/wiki/workspace?page=safe'
              },
              {
                type: 'wiki_page',
                id: 'protocol-relative',
                title: 'Protocol relative',
                href: '//evil.example'
              },
              {
                type: 'wiki_page',
                id: 'absolute-http',
                title: 'Absolute http',
                href: 'http://evil.example/page'
              },
              {
                type: 'wiki_page',
                id: 'absolute-https',
                title: 'Absolute https',
                href: 'https://evil.example/page'
              },
              {
                type: 'concept',
                id: 'javascript-href',
                title: 'Javascript href',
                href: 'javascript:alert(1)'
              },
              {
                type: 'concept',
                id: 'missing-href',
                title: 'Missing href'
              },
              {
                type: 'wiki_claim',
                id: 'empty-href',
                title: 'Empty href',
                href: ''
              },
              {
                type: 'wiki_page',
                id: 'relative-no-slash',
                title: 'Relative without slash',
                href: 'wiki/workspace?page=bad'
              }
            ]
          }
        }}
      />
    );

    expect(screen.getByRole('link', { name: /Wiki Safe wiki page/ }))
      .toHaveAttribute('href', '/wiki/workspace?page=safe');
    expect(screen.queryByText('Protocol relative')).not.toBeInTheDocument();
    expect(screen.queryByText('Absolute http')).not.toBeInTheDocument();
    expect(screen.queryByText('Absolute https')).not.toBeInTheDocument();
    expect(screen.queryByText('Javascript href')).not.toBeInTheDocument();
    expect(screen.queryByText('Missing href')).not.toBeInTheDocument();
    expect(screen.queryByText('Empty href')).not.toBeInTheDocument();
    expect(screen.queryByText('Relative without slash')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('keeps honest quiet and failure states', () => {
    const { rerender } = render(
      <LibrarySourceTrace source={{ provenance: {}, relevance: { connected: [] } }} />
    );
    expect(screen.getByText('Not used in a Concept or Wiki page yet.')).toBeInTheDocument();

    rerender(<LibrarySourceTrace source={null} error="network" />);
    expect(screen.getByText(
      'The article is available, but its source connections could not be loaded.'
    )).toBeInTheDocument();
  });

  it('shows a calm loading status while provenance is tracing', () => {
    render(<LibrarySourceTrace source={null} loading />);
    expect(screen.getByText('Tracing where this source appears…')).toBeInTheDocument();
  });

  it('renders a browse preview with exact connections and open action', () => {
    const onOpenSource = jest.fn();
    render(
      <LibrarySourceTrace
        variant="preview"
        onOpenSource={onOpenSource}
        source={{
          source: {
            type: 'highlight',
            id: 'highlight-1',
            parentId: 'article-1',
            title: 'Power availability is becoming the scarce input.',
            sourceUrl: 'https://example.com/source'
          },
          createdAt: '2026-05-14T12:00:00.000Z',
          provenance: {
            provider: 'readwise',
            parentTitle: 'Bottleneck essay',
            author: 'Ada Example',
            importedAt: '2026-05-14T12:00:00.000Z'
          },
          relevance: {
            connectedCount: 2,
            movementCount: 0,
            connected: [
              {
                type: 'wiki_claim',
                id: 'claim-1',
                parentId: 'page-1',
                title: 'Time-to-power constrains deployable capacity',
                href: '/wiki/workspace?page=page-1&claimId=claim-1'
              },
              {
                type: 'concept',
                id: 'concept-1',
                title: 'Bottleneck Economics',
                href: '/think?tab=concepts&concept=Bottleneck%20Economics'
              }
            ]
          }
        }}
      />
    );

    expect(screen.getByText('Highlight')).toBeInTheDocument();
    expect(screen.getByText('Power availability is becoming the scarce input.')).toBeInTheDocument();
    expect(screen.getByText('Provenance')).toBeInTheDocument();
    expect(screen.getByText('Imported from')).toBeInTheDocument();
    expect(screen.getByText('readwise')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Claim Time-to-power constrains deployable capacity/ }))
      .toHaveAttribute('href', '/wiki/workspace?page=page-1&claimId=claim-1');
    expect(screen.getByRole('link', { name: /Concept Bottleneck Economics/ }))
      .toHaveAttribute('href', '/think?tab=concepts&concept=Bottleneck%20Economics');
    const openAction = screen.getByTestId('library-source-trace-open');
    expect(openAction).toHaveAttribute('href', '/library?articleId=article-1&highlightId=highlight-1');
    expect(fireEvent.click(openAction)).toBe(false);
    expect(onOpenSource).toHaveBeenCalledWith(expect.objectContaining({
      type: 'highlight',
      id: 'highlight-1',
      parentId: 'article-1'
    }));
  });

  it('keeps an honest empty preview and missing-provenance state', () => {
    const { rerender } = render(
      <LibrarySourceTrace variant="preview" source={null} />
    );
    expect(screen.getByText(/Select a source to inspect provenance/i)).toBeInTheDocument();

    rerender(
      <LibrarySourceTrace
        variant="preview"
        source={{
          source: { type: 'note', id: 'note-1', title: 'Personal principle' },
          provenance: {},
          relevance: { connected: [] }
        }}
      />
    );
    expect(screen.getByText('Provenance unavailable for this source.')).toBeInTheDocument();
    expect(screen.getByText('Not used in a Concept or Wiki page yet.')).toBeInTheDocument();
  });
});
