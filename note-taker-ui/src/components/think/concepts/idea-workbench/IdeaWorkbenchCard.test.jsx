import React from 'react';
import { render, screen } from '@testing-library/react';
import IdeaWorkbenchCard from './IdeaWorkbenchCard';

jest.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    isDragging: false
  })
}));

jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: () => '' } }
}));

const baseCard = {
  id: 'card-1',
  type: 'Highlight',
  title: 'Calm vs magnetic',
  content: 'A passage that holds the claim together.',
  source: 'Article A',
  zone: 'workspace',
  tags: ['design']
};

describe('IdeaWorkbenchCard', () => {
  it('renders the card title and source when provided', () => {
    render(<IdeaWorkbenchCard card={baseCard} />);
    expect(screen.getByText('Calm vs magnetic')).toBeInTheDocument();
    expect(screen.getByText('Article A')).toBeInTheDocument();
  });

  it('replaces the literal Drag label with a 6-dot grip when draggable', () => {
    render(<IdeaWorkbenchCard card={baseCard} draggable />);
    const grip = screen.getByRole('button', { name: 'Drag Calm vs magnetic' });
    expect(grip.className).toMatch(/idea-workbench-card__grip/);
    // Six dot spans inside the grip
    expect(grip.querySelectorAll('span').length).toBe(6);
    // No literal "Drag" word remaining inside
    expect(grip.textContent.trim()).toBe('');
  });

  it('omits the grip entirely when not draggable', () => {
    render(<IdeaWorkbenchCard card={baseCard} draggable={false} />);
    expect(screen.queryByRole('button', { name: /Drag Calm vs magnetic/ })).not.toBeInTheDocument();
  });
});
