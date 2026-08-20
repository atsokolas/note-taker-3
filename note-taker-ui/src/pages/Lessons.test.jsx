import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Lessons from './Lessons';
import { listWikiPages } from '../api/wiki';
import { resetFirstPaint } from '../motion/columnMotion';

jest.mock('../api/wiki', () => ({ listWikiPages: jest.fn() }));

const pageWithLesson = (id, claim, lessons) => ({
  _id: id,
  title: claim,
  judgment: { currentJudgment: claim, lessons }
});

beforeEach(() => {
  jest.clearAllMocks();
  resetFirstPaint();
});

describe('Lessons', () => {
  it('reads back every lesson, newest first, each still naming its claim', async () => {
    listWikiPages.mockResolvedValue([
      pageWithLesson('a', 'Rates matter for asset prices.', [
        { lessonId: 'l1', text: 'I anchored on the last cycle for too long.', at: '2026-02-01T00:00:00.000Z', closedAs: 'closed' }
      ]),
      pageWithLesson('b', 'Compute is scarce.', [
        { lessonId: 'l2', text: 'Announced capacity is not delivered capacity.', at: '2026-08-01T00:00:00.000Z', closedAs: 'parked' }
      ])
    ]);

    render(<Lessons />);

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Announced capacity is not delivered capacity.');
    expect(items[0]).toHaveTextContent('Compute is scarce.');
    expect(items[0]).toHaveTextContent('when you parked it');
    expect(items[1]).toHaveTextContent('I anchored on the last cycle for too long.');

    // The claim it came from is a way back to it.
    expect(screen.getByRole('link', { name: 'Compute is scarce.' })).toHaveAttribute('href', '/judgment/b');
  });

  it('asks for a summary of the corpus rather than every page in full', async () => {
    listWikiPages.mockResolvedValue([]);
    render(<Lessons />);
    await waitFor(() => expect(listWikiPages).toHaveBeenCalled());
    expect(listWikiPages).toHaveBeenCalledWith(expect.objectContaining({ summary: 1 }));
  });

  it('is a door when there is nothing yet, not a blank page', async () => {
    listWikiPages.mockResolvedValue([]);
    render(<Lessons />);
    expect(await screen.findByText(/A lesson gets written when you park or close a judgment/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go and see what you are still holding/ })).toBeInTheDocument();
  });

  it('says so when it cannot read them', async () => {
    listWikiPages.mockRejectedValue(new Error('nope'));
    render(<Lessons />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your lessons.');
  });
});
