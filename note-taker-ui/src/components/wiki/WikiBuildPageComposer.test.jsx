import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiBuildPageComposer from './WikiBuildPageComposer';
import { createWikiPage, streamMaintainWikiPage } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  createWikiPage: jest.fn(),
  streamMaintainWikiPage: jest.fn()
}));

describe('WikiBuildPageComposer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REACT_APP_WIKI_WORKSPACE_V1 = 'true';
    createWikiPage.mockResolvedValue({ _id: 'wiki-new', title: 'Portfolio Concentration' });
    streamMaintainWikiPage.mockImplementation(async (_pageId, _options, handlers = {}) => {
      handlers.onPage?.({ _id: 'wiki-new', title: 'Portfolio Concentration' });
      return { _id: 'wiki-new', title: 'Portfolio Concentration' };
    });
  });

  afterEach(() => {
    delete process.env.REACT_APP_WIKI_WORKSPACE_V1;
  });

  it('creates an overview page, asks maintenance to draft it, and opens the workspace page', async () => {
    const onBuilt = jest.fn();
    render(
      <MemoryRouter>
        <WikiBuildPageComposer onBuilt={onBuilt} />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Wiki page to build'), {
      target: { value: 'Portfolio Concentration' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build page' }));

    await waitFor(() => {
      expect(createWikiPage).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Portfolio Concentration',
        pageType: 'overview'
      }));
    });
    expect(streamMaintainWikiPage).toHaveBeenCalledWith('wiki-new', {}, expect.objectContaining({
      onPage: expect.any(Function)
    }));
    expect(onBuilt).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByLabelText('Wiki page to build')).toHaveValue('');
    });
  });

  it('surfaces a build failure without navigating', async () => {
    createWikiPage.mockRejectedValueOnce(new Error('nope'));
    render(
      <MemoryRouter>
        <WikiBuildPageComposer />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Wiki page to build'), {
      target: { value: 'Broken page' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build page' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to build this wiki page.');
    expect(streamMaintainWikiPage).not.toHaveBeenCalled();
  });
});
