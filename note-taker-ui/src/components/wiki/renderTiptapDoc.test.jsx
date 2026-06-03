import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import renderTiptapDoc from './renderTiptapDoc';

describe('renderTiptapDoc', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders contradiction indexes on claim spans and citation buttons', () => {
    render(
      <div>
        {renderTiptapDoc({
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'A disputed claim.',
              marks: [{
                type: 'claim',
                attrs: {
                  claimId: 'claim-1',
                  support: 'conflicted',
                  citationIndexes: [1],
                  contradictionIndexes: [2]
                }
              }]
            }]
          }]
        })}
      </div>
    );

    const claim = screen.getByText('A disputed claim.');
    const button = screen.getByRole('button', { name: 'Backlink to source 1' });
    expect(claim).toHaveAttribute('data-citation-indexes', '1');
    expect(claim).toHaveAttribute('data-contradiction-indexes', '2');
    expect(button).toHaveAttribute('data-citation-indexes', '1');
    expect(button).toHaveAttribute('data-contradiction-indexes', '2');
    expect(screen.queryByText('[2]')).not.toBeInTheDocument();
  });

  it('renders a fallback citation button for contradiction-only claims', () => {
    render(
      <div>
        {renderTiptapDoc({
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'A contradicted claim.',
              marks: [{
                type: 'claim',
                attrs: {
                  claimId: 'claim-2',
                  support: 'conflicted',
                  citationIndexes: [],
                  contradictionIndexes: [2]
                }
              }]
            }]
          }]
        })}
      </div>
    );

    const button = screen.getByRole('button', { name: 'Backlink to source 2' });
    expect(button).toHaveTextContent('[2]');
    expect(button).toHaveAttribute('data-citation-indexes', '');
    expect(button).toHaveAttribute('data-contradiction-indexes', '2');
  });

  it('renders wikiLink marks as internal router links', () => {
    render(
      <MemoryRouter>
        <div>
          {renderTiptapDoc({
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Compounding interest',
                marks: [{
                  type: 'wikiLink',
                  attrs: {
                    pageId: 'wiki-related',
                    title: 'Compounding interest'
                  }
                }]
              }]
            }]
          })}
        </div>
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: 'Compounding interest' });
    expect(link).toHaveAttribute('href', '/wiki/workspace?page=wiki-related');
    expect(link).toHaveAttribute('data-wiki-page-id', 'wiki-related');
    expect(link).toHaveAttribute('data-wiki-title', 'Compounding interest');
  });

  it('demotes body h1 headings so the page title owns the document h1', () => {
    render(
      <div>
        {renderTiptapDoc({
          type: 'doc',
          content: [{
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Model generated title' }]
          }]
        })}
      </div>
    );

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Model generated title' })).toBeInTheDocument();
  });

  it('strips model source-range citation artifacts from prose', () => {
    render(
      <div>
        {renderTiptapDoc({
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: `Cash-flow valuation matters ${'\u3010'}1†L1-L4${'\u3011'} and process matters ${'\u3010'}2†L7${'\u3011'} .`
            }]
          }]
        })}
      </div>
    );

    expect(screen.getByText('Cash-flow valuation matters and process matters.')).toBeInTheDocument();
    expect(screen.queryByText(/L1-L4/)).not.toBeInTheDocument();
  });
});
