import React from 'react';
import { render, screen } from '@testing-library/react';
import { EditorialSideRail, EditorialSideRailCollapsible } from './EditorialSideRail';

describe('EditorialSideRailCollapsible', () => {
  it('renders collapsed by default and exposes summary content when opened', () => {
    render(
      <EditorialSideRail>
        <EditorialSideRailCollapsible
          title="Supporting context"
          subtitle="Pull-in, evidence, and drafts."
          testId="editorial-rail-collapsible"
        >
          <p>Secondary rail content</p>
        </EditorialSideRailCollapsible>
      </EditorialSideRail>
    );

    const collapsible = screen.getByTestId('editorial-rail-collapsible');
    expect(collapsible).not.toHaveAttribute('open');
    expect(screen.getByText('Supporting context')).toBeInTheDocument();
    expect(screen.queryByText('Secondary rail content')).not.toBeVisible();
  });

  it('can render open when defaultOpen is true', () => {
    render(
      <EditorialSideRailCollapsible title="Provenance" defaultOpen>
        <p>Visible provenance</p>
      </EditorialSideRailCollapsible>
    );

    expect(screen.getByText('Visible provenance')).toBeVisible();
  });
});
