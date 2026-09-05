import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import PaperColumns from './PaperColumns';
import { getMorningPaperColumns } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({ getMorningPaperColumns: jest.fn() }));
jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>
}));

const morning = (over = {}) => ({
  warned: null, calibration: null, anniversary: null, disagreement: null,
  corrections: [], obituary: null, asked: 0, closed: [], ...over
});

describe('the four things only this product can print', () => {
  beforeEach(() => jest.clearAllMocks());

  /* Every reading app can show you a highlight from last March. Only this one
     can show you a belief and ask whether you still hold it. */
  it('asks about a belief you have not looked at in a year', async () => {
    getMorningPaperColumns.mockResolvedValue(morning({
      anniversary: {
        text: 'Alphabet capex is defensive, not offensive.',
        bornAt: '2024-09-04T00:00:00.000Z', years: 2, pageId: 'p1', pageTitle: 'Alphabet'
      }
    }));
    render(<PaperColumns />);
    expect(await screen.findByText('2 years ago you wrote this down')).toBeInTheDocument();
    expect(screen.getByText(/Alphabet capex is defensive/)).toBeInTheDocument();
    expect(screen.getByText(/Not looked at since/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Alphabet capex/ })).toHaveAttribute('href', '/wiki/p1');
  });

  it('reports your own sources arguing with each other', async () => {
    getMorningPaperColumns.mockResolvedValue(morning({
      disagreement: { text: 'Inference costs are falling.', against: 3, pageId: 'p2', pageTitle: 'Compute' }
    }));
    render(<PaperColumns />);
    expect(await screen.findByText('Your library disagrees with itself')).toBeInTheDocument();
    expect(screen.getByText('On Compute · 3 sources against it')).toBeInTheDocument();
  });

  /* Not a correction — the reader changing position, read out of a claim's own
     history. It was called Correction before the paper kept a record, when
     there was nothing else the word could have meant. */
  it('calls your own reversal what it is', async () => {
    getMorningPaperColumns.mockResolvedValue(morning({
      corrections: [{
        key: 'k1', text: 'Alphabet capex is defensive.', was: 'retired', became: 'brought it back',
        pageId: 'p1', pageTitle: 'Alphabet', at: '2026-09-01'
      }]
    }));
    render(<PaperColumns />);
    expect(await screen.findByText('Second thoughts')).toBeInTheDocument();
    expect(screen.getByText('You retired this, then brought it back.')).toBeInTheDocument();
  });

  it('heads the box the same however many times you changed your mind', async () => {
    getMorningPaperColumns.mockResolvedValue(morning({
      corrections: [
        { key: 'a', text: 'One', was: 'retired', became: 'brought it back', pageId: 'p1' },
        { key: 'b', text: 'Two', was: 'reaffirmed', became: 'revised it', pageId: 'p2' }
      ]
    }));
    render(<PaperColumns />);
    expect(await screen.findByText('Second thoughts')).toBeInTheDocument();
  });

  /* The word used properly, at last: we printed a thing and the thing was not
     there. Quietly dropping the question is hoping nobody remembers it. */
  it('runs a real correction when it has been asking about something gone', async () => {
    getMorningPaperColumns.mockResolvedValue(morning({
      closed: [{ kind: 'obituary', label: 'Old page', day: '2026-09-01', pageId: 'p9', vanished: true }]
    }));
    render(<PaperColumns />);
    expect(await screen.findByText('Correction')).toBeInTheDocument();
    expect(screen.getByText('Old page is gone. The paper was still asking about it.')).toBeInTheDocument();
    expect(screen.queryByText('Since we last asked')).not.toBeInTheDocument();
  });

  it('runs the obituary for the page that has gone quietest', async () => {
    getMorningPaperColumns.mockResolvedValue(morning({
      obituary: { pageTitle: 'Deliberate Practice', days: 312, pageId: 'p9' }
    }));
    render(<PaperColumns />);
    expect(await screen.findByText('Nothing has been added to Deliberate Practice in 10 months.')).toBeInTheDocument();
  });

  /* The loudest sentence this product can print, and the one no other reading
     tool can — it needs a dated claim with a named falsifier and a watcher
     pointed at the same subject. */
  it('leads with the thing you said would change your mind', async () => {
    getMorningPaperColumns.mockResolvedValue(morning({
      warned: {
        text: 'The capex is a bet on new growth after all.',
        signal: 'Nvidia guides datacenter revenue down two quarters',
        pageId: 'p1',
        pageTitle: 'Alphabet'
      },
      anniversary: { text: 'Something older.', years: 2, pageId: 'p9', pageTitle: 'Older' }
    }));
    const { container } = render(<PaperColumns />);
    expect(await screen.findByText('The thing you said would change your mind may have happened')).toBeInTheDocument();
    expect(screen.getByText(/Read it, then say: held, or broke/)).toBeInTheDocument();

    /* It outranks a year-old belief. */
    const standfirsts = [...container.querySelectorAll('.paper-column__standfirst')].map(n => n.textContent);
    expect(standfirsts[0]).toMatch(/change your mind/);
  });

  /* A percentage invites a target, and a target invites gaming the one
     instrument that only works when nobody is performing for it. */
  it('counts your calibration without scoring it', async () => {
    getMorningPaperColumns.mockResolvedValue(morning({
      calibration: { confidence: 'certain', held: 7, of: 9 }
    }));
    render(<PaperColumns />);
    const line = await screen.findByText('When you said “certain”, it held 7 of 9 times.');
    expect(line).toBeInTheDocument();
    expect(line.closest('a')).toHaveAttribute('href', '/judgment/mirror');
  });

  /* The whole reason the paper keeps a record of itself. */
  it('says which morning this is when it has asked before', async () => {
    getMorningPaperColumns.mockResolvedValue(morning({
      anniversary: { text: 'Capex is defensive.', years: 1, pageId: 'p1', pageTitle: 'Alphabet' },
      asked: 3
    }));
    render(<PaperColumns />);
    expect(await screen.findByText('The fourth morning I have asked.')).toBeInTheDocument();
  });

  it('does not count out loud until asking twice is a pattern', async () => {
    getMorningPaperColumns.mockResolvedValue(morning({
      anniversary: { text: 'Capex is defensive.', years: 1, pageId: 'p1', pageTitle: 'Alphabet' },
      asked: 1
    }));
    render(<PaperColumns />);
    await screen.findByText(/Capex is defensive/);
    expect(screen.queryByText(/morning I have asked/)).not.toBeInTheDocument();
  });

  /* A paper that notices you acted is a different object from one that asks
     again. */
  it('reports what you closed since it last asked', async () => {
    getMorningPaperColumns.mockResolvedValue(morning({
      closed: [{ kind: 'anniversary', label: 'Alphabet', day: '2026-09-01', pageId: 'p1' }]
    }));
    render(<PaperColumns />);
    expect(await screen.findByText('Since we last asked')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'You went back to it: Alphabet.' })).toHaveAttribute('href', '/wiki/p1');
  });

  /* A morning whose only news is that you closed something is not a quiet
     morning. It is the best kind. */
  it('is not a quiet morning when the only news is that you acted', async () => {
    getMorningPaperColumns.mockResolvedValue(morning({
      closed: [{ kind: 'obituary', label: 'Anchoring', day: '2026-09-01', pageId: 'p2' }]
    }));
    render(<PaperColumns />);
    expect(await screen.findByText('Since we last asked')).toBeInTheDocument();
    expect(screen.queryByText(/A quiet morning/)).not.toBeInTheDocument();
  });

  /* The whole point of the rebuild: the length of the paper says what kind of
     day it is, and a morning with nothing in it says so and lets you go. */
  it('tells you to go away on a quiet morning', async () => {
    getMorningPaperColumns.mockResolvedValue(morning());
    render(<PaperColumns />);
    expect(await screen.findByText(/A quiet morning/)).toBeInTheDocument();
    expect(screen.queryByTestId('paper-columns')).not.toBeInTheDocument();
  });

  /* A column that could not be fetched is not a quiet morning. */
  it('does not call a failed fetch an empty day', async () => {
    getMorningPaperColumns.mockRejectedValue(new Error('down'));
    const { container } = render(<PaperColumns />);
    await waitFor(() => expect(getMorningPaperColumns).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing while it is still asking', () => {
    getMorningPaperColumns.mockReturnValue(new Promise(() => {}));
    const { container } = render(<PaperColumns />);
    expect(container).toBeEmptyDOMElement();
  });
});
