import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditionRead from './EditionRead';
import { getEdition, getEditionShare, revokeEditionShare, saveEditionItem, saveEditionItemLater, setEditionItemState, shareEdition } from '../api/editions';

/* The suite-wide router mock renders `Route element=` as nothing, so a page
   that reads a param is given the param directly, as the other ones are. */
let mockSearch = '';
jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useParams: () => ({ id: 'e1' }),
  useSearchParams: () => [new URLSearchParams(mockSearch)]
}));

jest.mock('../api/editions', () => ({
  getEdition: jest.fn(),
  saveEditionItem: jest.fn(),
  saveEditionItemLater: jest.fn(),
  setEditionItemState: jest.fn(),
  getEditionShare: jest.fn(),
  shareEdition: jest.fn(),
  updateEditionShare: jest.fn(),
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
    mockSearch = '';
    setEditionItemState.mockResolvedValue({ readerStatus: 'opened' });
    saveEditionItemLater.mockResolvedValue({ placed: true });
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

  it('prints the columns the agent configured', async () => {
    getEdition.mockResolvedValue(paper({
      sections: [
        { key: 'deployment', label: 'Deployment' },
        { key: 'policy', label: 'Policy' }
      ],
      items: [item({ section: 'deployment' })],
      unfilled: ['Policy']
    }));
    open();
    expect(await screen.findByText('Deployment')).toBeInTheDocument();
    expect(screen.getByText('Policy')).toBeInTheDocument();
    expect(screen.queryByText('Evidence for the thesis')).not.toBeInTheDocument();
  });

  it('stays silent when the paper has no columns', async () => {
    getEdition.mockResolvedValue(paper({ sections: [], items: [], unfilled: [] }));
    open();
    expect(await screen.findByTestId('edition-columns-silence')).toHaveTextContent('No columns set.');
    expect(screen.queryByText('Models & methods')).not.toBeInTheDocument();
    expect(screen.queryByText('Elsewhere')).not.toBeInTheDocument();
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

    it('saves for later and points at Later', async () => {
      getEdition.mockResolvedValue(paper());
      saveEditionItemLater.mockResolvedValue({
        placed: true,
        articleId: 'a1',
        edition: paper({
          items: [item({ savedArticleId: 'a1', readerStatus: 'later' })],
          savedCount: 1
        })
      });
      open();
      fireEvent.click(await screen.findByTestId('edition-later-item-1'));
      await waitFor(() => expect(screen.getByRole('link', { name: /Open Later/ })).toBeInTheDocument());
      expect(screen.getByRole('link', { name: /Open Later/ })).toHaveAttribute('href', '/library?scope=later');
      expect(saveEditionItemLater).toHaveBeenCalledWith('e1', 'item-1');
    });
  });

  it('records opened only after the item is on the page', async () => {
    mockSearch = 'item=item-1';
    getEdition.mockResolvedValue(paper());
    open();
    await screen.findByText('A paper about scaling');
    await waitFor(() => expect(setEditionItemState).toHaveBeenCalledWith('e1', 'item-1', 'opened'));
  });

  it('does not record opened for an item that is not there', async () => {
    mockSearch = 'item=missing';
    getEdition.mockResolvedValue(paper());
    open();
    await screen.findByText('A paper about scaling');
    expect(setEditionItemState).not.toHaveBeenCalled();
  });

  it('links every item to where it came from', async () => {
    getEdition.mockResolvedValue(paper());
    open();
    const link = await screen.findByRole('link', { name: 'A paper about scaling' });
    expect(link).toHaveAttribute('href', 'https://example.com/paper');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('puts the sources beside Share, folded until opened', async () => {
    getEdition.mockResolvedValue(paper());
    open();
    expect(await screen.findByTestId('edition-sources-jump')).toHaveTextContent('Show me the sources');
    expect(screen.getByTestId('edition-share-open')).toBeInTheDocument();
    const list = screen.getByTestId('edition-sources');
    expect(list).not.toHaveAttribute('open');
    expect(screen.getByRole('link', { name: 'Lab Blog · A paper about scaling' }))
      .toHaveAttribute('href', 'https://example.com/paper');
    expect(screen.getByTestId('edition-share-open').closest('.edition__actions'))
      .toContainElement(screen.getByTestId('edition-sources-jump'));
  });

  it('prints masthead, then the issue, then the sources list', async () => {
    getEdition.mockResolvedValue(paper());
    open();
    const title = await screen.findByRole('heading', { level: 1, name: 'This Week in AI' });
    const standfirst = screen.getByText('A quiet week with one loud paper.');
    const sources = screen.getByTestId('edition-sources');
    expect(title.compareDocumentPosition(standfirst) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(standfirst.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not invent a source list when nothing is followable', async () => {
    getEdition.mockResolvedValue(paper({ items: [item({ url: '' })] }));
    open();
    await screen.findByText('A paper about scaling');
    expect(screen.queryByTestId('edition-sources-jump')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edition-sources')).not.toBeInTheDocument();
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
    mockSearch = '';
    getEdition.mockResolvedValue(paper());
    getEditionShare.mockResolvedValue({
      shared: false,
      slug: '',
      preview: { title: 'This Week in AI', ownerDisplayName: 'Athan', items: [], sections: [] },
      currentHash: 'hash-1'
    });
  });

  it('offers to publish a paper that is not published', async () => {
    open();
    expect(await screen.findByTestId('edition-share-open')).toHaveTextContent('Share');
    expect(await screen.findByTestId('edition-publish')).toBeInTheDocument();
    expect(screen.queryByTestId('edition-copy-link')).not.toBeInTheDocument();
  });

  it('mints a link and then offers to copy it', async () => {
    shareEdition.mockResolvedValue({ shared: true, slug: 'abc123', stale: false });
    open();
    fireEvent.click(await screen.findByTestId('edition-publish'));
    await waitFor(() => expect(screen.getByTestId('edition-copy-link')).toBeInTheDocument());
    expect(screen.getByTestId('edition-unpublish')).toHaveTextContent('Stop sharing');
    expect(screen.getByTestId('edition-share-url').value).toContain('/share/editions/abc123');
  });

  /* Already published means copy the link, never mint a second one. */
  it('does not offer to publish what is already published', async () => {
    getEditionShare.mockResolvedValue({ shared: true, slug: 'abc123', stale: false });
    open();
    expect(await screen.findByTestId('edition-copy-link')).toBeInTheDocument();
    expect(screen.queryByTestId('edition-publish')).not.toBeInTheDocument();
  });

  it('goes back to offering to publish once revoked', async () => {
    getEditionShare.mockResolvedValue({ shared: true, slug: 'abc123', stale: false });
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

  it('does not treat a failed lookup as unpublished', async () => {
    getEditionShare.mockRejectedValue(new Error('network'));
    open();
    expect(await screen.findByText('Sharing status unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('edition-share-retry')).toBeInTheDocument();
    expect(screen.queryByTestId('edition-publish')).not.toBeInTheDocument();
  });
});
