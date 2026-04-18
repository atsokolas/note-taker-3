import React from 'react';
import { render, screen } from '@testing-library/react';
import SlashCommandMenu from './SlashCommandMenu';

describe('SlashCommandMenu', () => {
  it('renders an empty state when a slash query has no matches', () => {
    render(
      <SlashCommandMenu
        open
        items={[]}
        query="zzz"
      />
    );

    expect(screen.getByText('No commands found')).toBeInTheDocument();
    expect(screen.getByText('Try a different keyword for "/zzz".')).toBeInTheDocument();
  });
});
