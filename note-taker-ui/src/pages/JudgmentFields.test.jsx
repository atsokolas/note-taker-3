import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import Judgment from './Judgment';
import { getWikiPage, listWikiSourceEvents, updateWikiPage } from '../api/wiki';

jest.mock('../api/wiki', () => ({
  askWikiPage: jest.fn(),
  createWikiPage: jest.fn(),
  getWikiPage: jest.fn(),
  listWikiPages: jest.fn().mockResolvedValue([]),
  listWikiSourceEvents: jest.fn(),
  updateWikiPage: jest.fn()
}));

const page = () => ({
  _id: 'p1',
  title: 'A written process improves judgment.',
  judgment: {
    currentJudgment: 'A written process improves judgment.',
    why: [{ reasonId: 'r1', text: 'Process still loses half the bets.', sourceRefIds: [], sourceLabel: 'Everyone Has a Process' }],
    against: [],
    falsifiers: [],
    decisions: []
  }
});

/* A judgment carried out of a tension arrives with two sides written and two
   sections empty. An empty section used to be absent entirely, so the page that
   is supposed to hold four things showed one. */
describe('the four sections of a judgment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'p1' });
    getWikiPage.mockResolvedValue(page());
    listWikiSourceEvents.mockResolvedValue([]);
  });

  it('are all on the page, whether or not there is anything in them yet', async () => {
    render(<MemoryRouter><Judgment /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Why' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Against' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /change my mind if/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What I did' })).toBeInTheDocument();
    expect(screen.getByText('Process still loses half the bets.')).toBeInTheDocument();
  });

  it('take a line the human types, and keep the lines already written', async () => {
    updateWikiPage.mockImplementation(async (_id, updates) => ({ ...page(), judgment: updates.judgment }));
    render(<MemoryRouter><Judgment /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Why' });

    fireEvent.change(screen.getByLabelText('What would change your mind?'), {
      target: { value: 'Two quarters of falling margin.' }
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Write' })[2]);

    await waitFor(() => expect(updateWikiPage).toHaveBeenCalled());
    const [, updates] = updateWikiPage.mock.calls[0];
    expect(updates.judgment.falsifiers).toEqual([{ text: 'Two quarters of falling margin.' }]);
    expect(updates.judgment.why[0].text).toBe('Process still loses half the bets.');
    expect(await screen.findByText('Two quarters of falling margin.')).toBeInTheDocument();
  });
});

/* A save that comes back without the line is the failure that leaves no trace:
   the line settles into the field, the response replaces the page, and it is
   gone with nothing to read. */
describe('a line that does not land', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useParams').mockReturnValue({ pageId: 'p1' });
    getWikiPage.mockResolvedValue(page());
    listWikiSourceEvents.mockResolvedValue([]);
  });

  it('says so, instead of quietly dropping it', async () => {
    // 200, but the server kept nothing new.
    updateWikiPage.mockResolvedValue(page());
    render(<MemoryRouter><Judgment /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Why' });

    fireEvent.change(screen.getByLabelText('What would change your mind?'), {
      target: { value: 'Two quarters of falling margin.' }
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Write' })[2]);

    expect(await screen.findByRole('alert')).toHaveTextContent(/was not saved/);
  });
});
