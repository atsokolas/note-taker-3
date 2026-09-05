import React, { useEffect, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StickyNotes from './StickyNotes';
import { createSticky, deleteSticky, listStickies } from '../api/stickies';

jest.mock('../api/stickies', () => ({
  listStickies: jest.fn(),
  createSticky: jest.fn(),
  deleteSticky: jest.fn()
}));

const target = {
  targetType: 'article',
  targetId: 'a1',
  targetTitle: 'The letter',
  targetHref: '/library?articleId=a1'
};

describe('StickyNotes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listStickies.mockResolvedValue([]);
  });

  it('stays quiet until asked, then counts the paper running out', async () => {
    createSticky.mockImplementation(async (payload) => ({ _id: 's1', ...payload, status: 'pending' }));
    render(
      <MemoryRouter>
        <StickyNotes {...target} />
      </MemoryRouter>
    );
    await waitFor(() => expect(listStickies).toHaveBeenCalledWith({
      targetType: 'article',
      targetId: 'a1'
    }));
    expect(screen.getByRole('button', { name: 'Pin a line' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Pin a line/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pin a line' }));
    const input = screen.getByPlaceholderText(/Pin a line/);
    fireEvent.change(input, { target: { value: 'Ask him about Thursday' } });
    expect(screen.getByText('118')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pin it' }));
    await waitFor(() => expect(createSticky).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Ask him about Thursday',
      targetType: 'article',
      targetId: 'a1',
      targetTitle: 'The letter',
      targetHref: '/library?articleId=a1',
      dueAt: null
    })));
    expect(await screen.findByText('Ask him about Thursday')).toBeInTheDocument();
  });

  it('resolves with one tap and no confirm, restoring on failure', async () => {
    listStickies.mockResolvedValue([{ _id: 's1', text: 'Ask him.', status: 'pending' }]);
    deleteSticky.mockResolvedValue({ deleted: true });
    render(
      <MemoryRouter>
        <StickyNotes {...target} />
      </MemoryRouter>
    );
    expect(await screen.findByText('Ask him.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remove pinned line/ }));
    await waitFor(() => expect(deleteSticky).toHaveBeenCalledWith('s1'));
    expect(screen.queryByText('Ask him.')).not.toBeInTheDocument();
  });

  it('an unread shelf is not an empty shelf', () => {
    listStickies.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <MemoryRouter>
        <StickyNotes {...target} />
      </MemoryRouter>
    );
    expect(container.querySelector('.sticky-notes__list')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pin a line' })).toBeInTheDocument();
  });

  it('renders nothing without an object to pin to', () => {
    const { container } = render(
      <MemoryRouter>
        <StickyNotes targetType="" targetId="" />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
    expect(listStickies).not.toHaveBeenCalled();
  });
});
