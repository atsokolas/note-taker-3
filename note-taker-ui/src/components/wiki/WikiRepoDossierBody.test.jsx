import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WikiRepoDossierBody from './WikiRepoDossierBody';

describe('WikiRepoDossierBody', () => {
  it('uses the collapsible container as the stable anchor and renders its heading once', () => {
    render(
      <WikiRepoDossierBody
        collapseSections
        doc={{
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 2, id: 'repo-section-architecture', anchorId: 'repo-section-architecture' },
              content: [{ type: 'text', text: 'Architecture map' }]
            },
            { type: 'paragraph', content: [{ type: 'text', text: 'The API owns repository maintenance.' }] }
          ]
        }}
        tocItems={[]}
        recentAnchorIds={new Set()}
        wikiLinkPages={[]}
      />
    );

    const summary = screen.getByText('Architecture map');
    const details = summary.closest('details');
    expect(screen.getAllByText('Architecture map')).toHaveLength(1);
    expect(details).toHaveAttribute('id', 'repo-section-architecture');
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('The API owns repository maintenance.')).toBeInTheDocument();
  });
});
