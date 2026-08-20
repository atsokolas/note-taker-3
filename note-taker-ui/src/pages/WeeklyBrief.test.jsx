import React from 'react';
import { render, screen } from '@testing-library/react';
import WeeklyBrief from './WeeklyBrief';
import { getArticles } from '../api/articles';
import { listWikiPages, listWikiSourceEvents } from '../api/wiki';
import { resetFirstPaint } from '../motion/columnMotion';

jest.mock('../api/articles', () => ({ getArticles: jest.fn() }));
jest.mock('../api/wiki', () => ({ listWikiPages: jest.fn(), listWikiSourceEvents: jest.fn() }));

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = days => new Date(Date.now() - days * DAY).toISOString();

const claim = (id, sentence, judgment = {}) => ({
  _id: id,
  updatedAt: daysAgo(200),
  judgment: {
    currentJudgment: sentence,
    falsifiers: [{ falsifierId: `f-${id}`, text: 'Something would change my mind.' }],
    lastReviewedAt: daysAgo(200),
    ...judgment
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  resetFirstPaint();
  getArticles.mockResolvedValue([]);
  listWikiPages.mockResolvedValue([]);
  listWikiSourceEvents.mockResolvedValue([]);
});

describe('WeeklyBrief', () => {
  it('opens with a count and asks only about what has gone unread', async () => {
    listWikiPages.mockResolvedValue([
      claim('avoided', 'Capex discipline is returning.'),
      claim('quiet', 'Rates still matter.')
    ]);
    getArticles.mockResolvedValue([{ _id: 'a1', createdAt: daysAgo(2) }, { _id: 'a2', createdAt: daysAgo(4) }]);
    listWikiSourceEvents.mockResolvedValue([
      { _id: 'e1', affectedPageIds: ['avoided'], sourceUpdatedAt: daysAgo(40) }
    ]);

    render(<WeeklyBrief />);

    expect(await screen.findByText('You read 2 things. None of it touched what you hold.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Waiting on you' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Capex discipline is returning.' })).toBeInTheDocument();

    // The quiet claim is counted, never listed. Listing it turns the brief into
    // the backlog it exists to replace.
    expect(screen.queryByRole('link', { name: 'Rates still matter.' })).not.toBeInTheDocument();
    expect(screen.getByText('1 other sat quiet, which is not a problem.')).toBeInTheDocument();
  });

  it('says a quiet week was quiet', async () => {
    listWikiPages.mockResolvedValue([claim('q', 'Rates still matter.')]);
    render(<WeeklyBrief />);
    expect(await screen.findByText('A quiet week. Nothing arrived, and nothing needed you.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Waiting on you' })).not.toBeInTheDocument();
  });

  it('shows what was learned, still naming the claim it came from', async () => {
    listWikiPages.mockResolvedValue([
      claim('a', 'Compute stays scarce.', { lessons: [{ lessonId: 'l1', text: 'Announced is not delivered.', at: daysAgo(2) }] })
    ]);
    render(<WeeklyBrief />);
    expect(await screen.findByText('Announced is not delivered.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compute stays scarce.' })).toHaveAttribute('href', '/judgment/a');
  });

  it('points at what you keep without counting it as work', async () => {
    listWikiPages.mockResolvedValue([{ _id: 'p', title: 'A page', evergreen: true }]);
    render(<WeeklyBrief />);
    expect(await screen.findByRole('link', { name: '1 thing you keep for good →' })).toHaveAttribute('href', '/evergreen');
  });

  it('says so when the week cannot be assembled', async () => {
    listWikiPages.mockRejectedValue(new Error('nope'));
    render(<WeeklyBrief />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not put this week together.');
  });
});
