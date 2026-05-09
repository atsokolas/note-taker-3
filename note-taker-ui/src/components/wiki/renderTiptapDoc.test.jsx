import { render, screen } from '@testing-library/react';
import renderTiptapDoc from './renderTiptapDoc';

describe('renderTiptapDoc', () => {
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
});
