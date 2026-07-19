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
    expect(screen.getByText('Collapsed')).toBeInTheDocument();
    fireEvent.click(summary);
    fireEvent(details, new Event('toggle'));
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('Expanded')).toBeInTheDocument();
    expect(screen.getByText('The API owns repository maintenance.')).toBeInTheDocument();
  });

  it('opens every titled section by default when used on the public dossier', () => {
    const { container } = render(
      <WikiRepoDossierBody
        collapseSections
        expandAllSectionsByDefault
        doc={{
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Overview' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Overview copy.' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Architecture' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Architecture copy.' }] }
          ]
        }}
        tocItems={[]}
      />
    );

    const sections = Array.from(container.querySelectorAll('details'));
    expect(sections).toHaveLength(2);
    expect(sections.every(section => section.hasAttribute('open'))).toBe(true);
    expect(screen.getAllByText('Expanded')).toHaveLength(2);
  });
});
