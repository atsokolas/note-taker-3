import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Evergreen from './Evergreen';
import { getArticles } from '../api/articles';
import { listWikiPages } from '../api/wiki';
import { resetFirstPaint } from '../motion/columnMotion';

jest.mock('../api/articles', () => ({ getArticles: jest.fn() }));
jest.mock('../api/wiki', () => ({ listWikiPages: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  resetFirstPaint();
  getArticles.mockResolvedValue([]);
  listWikiPages.mockResolvedValue([]);
});

describe('Evergreen', () => {
  it('reads sources, pages and beliefs together, in the order they were kept', async () => {
    getArticles.mockResolvedValue([
      { _id: 'a1', title: 'The Bitter Lesson', siteName: 'incompleteideas.net', evergreen: true, evergreenAt: '2026-01-05T00:00:00.000Z' },
      { _id: 'a2', title: 'Something I merely saved', evergreen: false }
    ]);
    listWikiPages.mockResolvedValue([
      { _id: 'p1', title: 'Compute', evergreen: true, evergreenAt: '2026-08-01T00:00:00.000Z', judgment: { currentJudgment: 'Compute stays scarce.' } }
    ]);

    render(<Evergreen />);

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    // Newest decision first, and a judgment reads by its claim.
    expect(items[0]).toHaveTextContent('Compute stays scarce.');
    expect(items[0]).toHaveTextContent('A belief you hold');
    expect(items[1]).toHaveTextContent('The Bitter Lesson');
    expect(items[1]).toHaveTextContent('Something you read');

    // What was merely saved is not here.
    expect(screen.queryByText('Something I merely saved')).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Compute stays scarce.' })).toHaveAttribute('href', '/judgment/p1');
  });

  it('is a door when nothing is kept yet', async () => {
    render(<Evergreen />);
    expect(await screen.findByText(/Nothing kept yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'library' })).toHaveAttribute('href', '/library');
  });

  it('asks for a summary of the corpus rather than every page in full', async () => {
    render(<Evergreen />);
    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    expect(listWikiPages).toHaveBeenCalledWith(expect.objectContaining({ summary: 1 }));
  });

  it('still shows the pages when the library cannot be read, and the reverse', async () => {
    getArticles.mockRejectedValue(new Error('nope'));
    listWikiPages.mockResolvedValue([{ _id: 'p1', title: 'Reflexivity', evergreen: true }]);
    render(<Evergreen />);
    expect(await screen.findByRole('link', { name: 'Reflexivity' })).toBeInTheDocument();
  });
});
