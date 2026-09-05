import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditionRead from './EditionRead';
import { getEdition, getEditionShare, revokeEditionShare, saveEditionItem, shareEdition } from '../api/editions';

/* The suite-wide router mock renders `Route element=` as nothing, so a page
   that reads a param is given the param directly, as the other ones are. */
jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useParams: () => ({ id: 'e1' })
}));

jest.mock('../api/editions', () => ({
  getEdition: jest.fn(),
  saveEditionItem: jest.fn(),
  getEditionShare: jest.fn(),
  shareEdition: jest.fn(),
  revokeEditionShare: jest.fn()
}));

const item = (over = {}) => ({
  itemId: 'item-1',
  title: 'A paper about scaling',
  url: 'https://example.com/paper',
  section: 'models_methods',
  finding: 'Loss keeps falling past the expected budget.',
  boundary: 'One lab, no replication yet.',
  sourceLabel: 'Lab Blog',
  sourceDate: 'Sep 3',
  note: '',
  savedArticleId: null,
  ...over
});

const paper = (over = {}) => ({
  _id: 'e1',
  title: 'This Week in AI',
  issueLabel: 'Issue',
  number: 14,
  windowStart: '2026-09-01',
  windowEnd: '2026-09-07',
  standfirst: 'A quiet week with one loud paper.',
  throughLine: 'Everything points at inference cost.',
  watchNext: ['The replication attempt'],
  writtenBy: 'OpenClaw · Jarvis',
  sections: [
    { key: 'models_methods', label: 'Models & methods' },
    { key: 'evaluation_counterevidence', label: 'Evaluation & counterevidence' }
  ],
  items: [item()],
  itemCount: 1,
  savedCount: 0,
  unfilled: ['Evaluation & counterevidence'],
  ...over
});

const open = () => render(<EditionRead />);

describe('reading a paper an agent wrote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    /* Unpublished unless a test says otherwise. */
    getEditionShare.mockResolvedValue({ shared: false, slug: '' });
  });

  it('prints the finding and the thing that would limit it', async () => {
    getEdition.mockResolvedValue(paper());
    open();
    expect(await screen.findByText('Loss keeps falling past the expected budget.')).toBeInTheDocument();
    expect(screen.getByText('What would limit it')).toBeInTheDocument();
    expect(screen.getByText('One lab, no replication yet.')).toBeInTheDocument();
  });

  /* A week with nothing under counterevidence is saying something. Dropping
     the section is what a newsletter does. */
  it('prints a section nobody filled rather than dropping it', async () => {
    getEdition.mockResolvedValue(paper());
    open();
    expect(await screen.findByText('Evaluation & counterevidence')).toBeInTheDocument();
    expect(screen.getByText('Nothing this week.')).toBeInTheDocument();
    expect(screen.getByText('Nothing this week under Evaluation & counterevidence.')).toBeInTheDocument();
  });

  it('signs the masthead and dates the window', async () => {
    getEdition.mockResolvedValue(paper());
    open();
    expect(await screen.findByText('Written by OpenClaw · Jarvis')).toBeInTheDocument();
    expect(screen.getByText('Sep 1 – 7 · Issue 14')).toBeInTheDocument();
  });

  describe('the crossing', () => {
    /* Every other surface reads library to wiki. This one runs the other way,
       and without this door the whole thing is a newsletter. */
    it('takes a source into your library and says it is there', async () => {
      getEdition.mockResolvedValue(paper());
      saveEditionItem.mockResolvedValue({
        articleId: 'a1',
        edition: paper({ items: [item({ savedArticleId: 'a1' })], savedCount: 1 })
      });
      open();
      fireEvent.click(await screen.findByTestId('edition-save-item-1'));
      await waitFor(() => expect(screen.getByText('In your library →')).toBeInTheDocument());
      expect(saveEditionItem).toHaveBeenCalledWith('e1', 'item-1');
      expect(screen.getByRole('link', { name: 'In your library →' })).toHaveAttribute('href', '/articles/a1');
    });

    it('updates what you have taken the moment you take one', async () => {
      getEdition.mockResolvedValue(paper({ itemCount: 2, savedCount: 0, items: [item(), item({ itemId: 'item-2', url: 'https://example.com/b' })] }));
      saveEditionItem.mockResolvedValue({
        articleId: 'a1',
        edition: paper({ itemCount: 2, savedCount: 1, items: [item({ savedArticleId: 'a1' }), item({ itemId: 'item-2' })] })
      });
      open();
      expect(await screen.findByText('2 sources.')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('edition-save-item-1'));
      await waitFor(() => expect(screen.getByText('1 of 2 in your library.')).toBeInTheDocument());
    });

    it('offers no save for a source already yours', async () => {
      getEdition.mockResolvedValue(paper({ items: [item({ savedArticleId: 'a1' })], savedCount: 1 }));
      open();
      await screen.findByText('In your library →');
      expect(screen.queryByTestId('edition-save-item-1')).not.toBeInTheDocument();
    });

    /* Saved and saved-but-empty are different things to a reader about to go
       looking for the text. */
    it('says when a source was filed but would not read', async () => {
      getEdition.mockResolvedValue(paper());
      saveEditionItem.mockResolvedValue({
        articleId: 'a1',
        readable: false,
        readError: 'That source request failed with HTTP 403.',
        edition: paper({ items: [item({ savedArticleId: 'a1' })], savedCount: 1 })
      });
      open();
      fireEvent.click(await screen.findByTestId('edition-save-item-1'));
      await waitFor(() => expect(screen.getByText(/would not come/)).toBeInTheDocument());
      /* Still filed — the click was not lost. */
      expect(screen.getByRole('link', { name: 'In your library →' })).toBeInTheDocument();
    });

    it('says nothing extra when the source read fine', async () => {
      getEdition.mockResolvedValue(paper());
      saveEditionItem.mockResolvedValue({
        articleId: 'a1',
        readable: true,
        edition: paper({ items: [item({ savedArticleId: 'a1' })], savedCount: 1 })
      });
      open();
      fireEvent.click(await screen.findByTestId('edition-save-item-1'));
      await waitFor(() => expect(screen.getByText('In your library →')).toBeInTheDocument());
      expect(screen.queryByText(/would not come/)).not.toBeInTheDocument();
    });

    it('says so when the save fails, and leaves the door open', async () => {
      getEdition.mockResolvedValue(paper());
      saveEditionItem.mockRejectedValue({ response: { data: { error: 'That source did not save.' } } });
      open();
      fireEvent.click(await screen.findByTestId('edition-save-item-1'));
      await waitFor(() => expect(screen.getByText('That source did not save.')).toBeInTheDocument());
      expect(screen.getByTestId('edition-save-item-1')).toBeEnabled();
    });
  });

  it('links every item to where it came from', async () => {
    getEdition.mockResolvedValue(paper());
    open();
    const link = await screen.findByRole('link', { name: 'A paper about scaling' });
    expect(link).toHaveAttribute('href', 'https://example.com/paper');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('says so when the edition does not open', async () => {
    getEdition.mockRejectedValue({ response: { data: { error: 'No such edition.' } } });
    open();
    expect(await screen.findByText('No such edition.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Editions' })).toBeInTheDocument();
  });
});

describe('publishing a paper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getEdition.mockResolvedValue(paper());
    getEditionShare.mockResolvedValue({ shared: false, slug: '' });
  });

  it('offers to publish a paper that is not published', async () => {
    open();
    expect(await screen.findByTestId('edition-publish')).toBeInTheDocument();
    expect(screen.queryByTestId('edition-copy-link')).not.toBeInTheDocument();
  });

  it('mints a link and then offers to copy it', async () => {
    shareEdition.mockResolvedValue({ shared: true, slug: 'abc123' });
    open();
    fireEvent.click(await screen.findByTestId('edition-publish'));
    await waitFor(() => expect(screen.getByTestId('edition-copy-link')).toBeInTheDocument());
    expect(screen.getByTestId('edition-unpublish')).toBeInTheDocument();
  });

  /* Already published means copy the link, never mint a second one. */
  it('does not offer to publish what is already published', async () => {
    getEditionShare.mockResolvedValue({ shared: true, slug: 'abc123' });
    open();
    expect(await screen.findByTestId('edition-copy-link')).toBeInTheDocument();
    expect(screen.queryByTestId('edition-publish')).not.toBeInTheDocument();
  });

  it('goes back to offering to publish once revoked', async () => {
    getEditionShare.mockResolvedValue({ shared: true, slug: 'abc123' });
    revokeEditionShare.mockResolvedValue({ revoked: true });
    open();
    fireEvent.click(await screen.findByTestId('edition-unpublish'));
    await waitFor(() => expect(screen.getByTestId('edition-publish')).toBeInTheDocument());
  });

  it('says so when publishing fails', async () => {
    shareEdition.mockRejectedValue({ response: { data: { error: 'That paper did not publish.' } } });
    open();
    fireEvent.click(await screen.findByTestId('edition-publish'));
    await waitFor(() => expect(screen.getByText('That paper did not publish.')).toBeInTheDocument());
  });
});
