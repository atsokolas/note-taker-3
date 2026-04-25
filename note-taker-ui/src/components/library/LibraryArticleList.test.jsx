import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LibraryArticleList from './LibraryArticleList';

const sample = [
  { _id: 'a1', title: 'Calm interfaces in long-form reading', createdAt: '2026-04-20T00:00:00Z',
    summary: 'Restraint reads as confidence; motion rewards intent.', tags: ['design'],
    highlights: [{}, {}] },
  { _id: 'a2', title: 'Magnetic motion patterns', createdAt: '2026-04-22T00:00:00Z',
    summary: 'Pointer-following without disco.', tags: [], highlights: [] }
];

const renderList = (props = {}) =>
  render(
    <MemoryRouter>
      <LibraryArticleList
        articles={sample}
        loading={false}
        error=""
        emptyLabel="None"
        onSelectArticle={() => {}}
        {...props}
      />
    </MemoryRouter>
  );

describe('LibraryArticleList', () => {
  it('renders rows with title, source-derived label and excerpt', () => {
    renderList();
    expect(screen.getByText('Calm interfaces in long-form reading')).toBeInTheDocument();
    expect(screen.getByText('Restraint reads as confidence; motion rewards intent.')).toBeInTheDocument();
  });

  it('marks rows as magnetic and drives row bloom CSS vars on pointermove', () => {
    const { container } = renderList();
    const row = container.querySelector('.library-article-row.is-magnetic');
    expect(row).not.toBeNull();
    row.getBoundingClientRect = () => ({
      top: 50, left: 100, right: 600, bottom: 140, width: 500, height: 90, x: 100, y: 50, toJSON: () => ({})
    });
    const move = new Event('pointermove', { bubbles: true });
    Object.defineProperty(move, 'clientX', { value: 320 });
    Object.defineProperty(move, 'clientY', { value: 80 });
    row.dispatchEvent(move);
    expect(row.style.getPropertyValue('--row-bloom-x')).toBe('220px');
    expect(row.style.getPropertyValue('--row-bloom-y')).toBe('30px');

    fireEvent.pointerLeave(row);
    expect(row.style.getPropertyValue('--row-bloom-x')).toBe('');
    expect(row.style.getPropertyValue('--row-bloom-y')).toBe('');
  });

  it('clicking the row body invokes onSelectArticle with id', () => {
    const onSelect = jest.fn();
    renderList({ onSelectArticle: onSelect });
    const main = screen.getByText('Calm interfaces in long-form reading').closest('button');
    fireEvent.click(main);
    expect(onSelect).toHaveBeenCalledWith('a1');
  });

  it('Move action does not trigger row select (stopPropagation)', () => {
    const onSelect = jest.fn();
    const onMove = jest.fn();
    renderList({ onSelectArticle: onSelect, onMoveArticle: onMove });
    const moveBtn = screen.getAllByRole('button', { name: 'Move' })[0];
    fireEvent.click(moveBtn);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows empty state with CTA when no articles', () => {
    renderList({ articles: [] });
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.getByText('Move articles into this folder')).toBeInTheDocument();
  });
});
