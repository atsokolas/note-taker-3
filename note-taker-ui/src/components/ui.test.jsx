import React from 'react';
import { render, screen } from '@testing-library/react';
import { SectionHeader } from './ui';

describe('SectionHeader', () => {
  it('renders title and subtitle as separate copy blocks', () => {
    render(
      <SectionHeader
        title="Thought partner"
        subtitle="Library context visible"
      />
    );

    expect(screen.getByText('Thought partner')).toBeInTheDocument();
    expect(screen.getByText('Library context visible')).toBeInTheDocument();

    const copy = screen.getByText('Thought partner').closest('.ui-section-header__copy');
    expect(copy).not.toBeNull();
    expect(copy.querySelector('.ui-section-header__title')).toHaveTextContent('Thought partner');
    expect(copy.querySelector('.ui-section-header__subtitle')).toHaveTextContent('Library context visible');
  });
});
