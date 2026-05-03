import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiIndex from './WikiIndex';
import { createWikiPage, deleteWikiPage, listWikiPages } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  createWikiPage: jest.fn(),
  deleteWikiPage: jest.fn(),
  listWikiPages: jest.fn()
}));

const pages = [
  {
    _id: 'wiki-1',
    title: 'Enterprise AI Memory',
    pageType: 'topic',
    status: 'draft',
    visibility: 'private',
    sourceScope: 'entire_library',
    plainText: 'A source-backed page about memory.',
    sourceRefs: [],
    updatedAt: '2026-05-03T12:00:00.000Z'
  },
  {
    _id: 'wiki-2',
    title: 'Investing',
    pageType: 'topic',
    status: 'draft',
    visibility: 'private',
    sourceScope: 'entire_library',
    plainText: 'A source-backed page about investing.',
    sourceRefs: [{ _id: 'source-1' }],
    updatedAt: '2026-05-02T12:00:00.000Z'
  }
];

describe('WikiIndex', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createWikiPage.mockResolvedValue(pages[0]);
    deleteWikiPage.mockResolvedValue({ ...pages[0], status: 'archived' });
    listWikiPages.mockResolvedValue(pages);
  });

  it('deletes a Wiki page from the menu after confirmation', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    expect(await screen.findByText('Enterprise AI Memory')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    await waitFor(() => {
      expect(deleteWikiPage).toHaveBeenCalledWith('wiki-1');
    });
    expect(confirmSpy).toHaveBeenCalledWith('Delete "Enterprise AI Memory"?');
    await waitFor(() => {
      expect(screen.queryByText('Enterprise AI Memory')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Investing')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('keeps the page visible when deletion is cancelled', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <MemoryRouter>
        <WikiIndex />
      </MemoryRouter>
    );

    expect(await screen.findByText('Enterprise AI Memory')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    expect(deleteWikiPage).not.toHaveBeenCalled();
    expect(screen.getByText('Enterprise AI Memory')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
