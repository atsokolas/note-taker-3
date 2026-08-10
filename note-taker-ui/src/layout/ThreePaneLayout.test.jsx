import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ThreePaneLayout from './ThreePaneLayout';

const renderLayout = (props = {}) => render(
  <MemoryRouter initialEntries={['/think?tab=home']}>
    <ThreePaneLayout
      left={<nav aria-label="Shelf">Shelf</nav>}
      main={<main aria-label="Working plane">Working plane</main>}
      right={<div>Context content</div>}
      defaultLeftOpen
      defaultRightOpen
      {...props}
    />
  </MemoryRouter>
);

describe('ThreePaneLayout', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the main plane before the context drawer in DOM order', () => {
    const { container } = renderLayout();
    const main = container.querySelector('.three-pane__main main');
    const drawer = container.querySelector('.right-drawer');

    expect(main.compareDocumentPosition(drawer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('defaults its desktop context rail open when a right surface is supplied', () => {
    renderLayout();
    expect(screen.getByText('Context content')).toBeInTheDocument();
  });
});
