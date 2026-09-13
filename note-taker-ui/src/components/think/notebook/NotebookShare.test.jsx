import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotebookEssay, { quoteClip } from './NotebookEssay';
import NotebookShare, { NotebookSharePanel } from './NotebookShare';
import { essaySnapshot } from './notebookShareFixture';
import { getNotebookShare, updateNotebookShare } from '../../../api/notebook';

jest.mock('../../../api/notebook', () => ({
  getNotebookShare: jest.fn(),
  publishNotebookShare: jest.fn(),
  revokeNotebookShare: jest.fn(),
  updateNotebookShare: jest.fn()
}));

const frozen = essaySnapshot();
const workshopDraft = essaySnapshot({
  publishedAt: undefined,
  blocks: [...essaySnapshot().blocks, { id: 'p2', type: 'paragraph', text: 'Rewritten in the workshop.' }]
});

describe('NotebookEssay', () => {
  it('prints the frozen quotation with a public source door', () => {
    render(<NotebookEssay snapshot={essaySnapshot()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Who gets to experiment, and who pays?' })).toBeInTheDocument();
    expect(screen.getByText('Two hours a week cannot sustain this.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'A letter on time' })).toHaveAttribute('href', 'https://example.com/letter');
    expect(screen.queryByText(/library\?/)).not.toBeInTheDocument();
  });

  it('explains a withheld source instead of linking into the workshop', () => {
    render(<NotebookEssay snapshot={essaySnapshot({
      blocks: [{
        id: 'q1',
        type: 'quote',
        text: 'Held privately.',
        source: { title: 'A letter on time', href: '', access: 'withheld' }
      }]
    })} />);
    expect(screen.getByText(/Not available at a public address/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('copies the quotation with its public door, and leaves ordinary prose alone', async () => {
    const writeText = jest.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    render(<NotebookEssay snapshot={essaySnapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy with source' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      '"Two hours a week cannot sustain this."\n— A letter on time\nhttps://example.com/letter'
    ));
    expect(await screen.findByRole('button', { name: 'Copied.' })).toBeInTheDocument();
    expect(screen.getByText('The rule assumed spare hours. The exception arrives first.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Copy with source|Copied/ })).toHaveLength(1);
  });

  it('copies a withheld quotation without inventing a door', async () => {
    const writeText = jest.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    render(<NotebookEssay snapshot={essaySnapshot({
      blocks: [{
        id: 'q1',
        type: 'quote',
        text: 'Held privately.',
        source: { title: 'A letter on time', href: 'https://secret.example/private', access: 'withheld' }
      }]
    })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy with source' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      '"Held privately."\n— A letter on time'
    ));
  });

  it('lets the quotation be selected when the clipboard is refused', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn(() => Promise.reject(new Error('denied'))) }
    });
    render(<NotebookEssay snapshot={essaySnapshot()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy with source' }));
    expect(await screen.findByLabelText('Quotation with source')).toHaveValue(
      '"Two hours a week cannot sustain this."\n— A letter on time\nhttps://example.com/letter'
    );
  });
});

describe('quoteClip', () => {
  it('keeps attribution public and stays silent without a quotation or door', () => {
    expect(quoteClip({
      text: 'Two hours a week cannot sustain this.',
      source: { title: 'A letter on time', href: 'https://example.com/letter', access: 'open' }
    })).toBe('"Two hours a week cannot sustain this."\n— A letter on time\nhttps://example.com/letter');
    expect(quoteClip({
      text: 'Held privately.',
      source: { title: 'A letter on time', href: 'https://secret.example/private', access: 'withheld' }
    })).toBe('"Held privately."\n— A letter on time');
    expect(quoteClip({
      text: 'A line.',
      source: { href: 'javascript:alert(1)' }
    })).toBe('');
    expect(quoteClip({
      text: 'A line.',
      source: { href: '/library?articleId=1' }
    })).toBe('');
    expect(quoteClip({ text: 'Prose only.' })).toBe('');
    expect(quoteClip({
      source: { title: 'A letter on time', href: 'https://example.com/letter' }
    })).toBe('');
  });

  it('does not invent a copy act for a quotation with no source', () => {
    render(<NotebookEssay snapshot={essaySnapshot({
      blocks: [{ id: 'q0', type: 'quote', text: 'Just a remembered line.' }]
    })} />);
    expect(screen.getByText('Just a remembered line.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy with source' })).not.toBeInTheDocument();
  });

  it('stays silent on the first share, and names a later correction', () => {
    const { rerender } = render(<NotebookEssay snapshot={essaySnapshot()} />);
    expect(screen.queryByText(/^Updated /)).not.toBeInTheDocument();
    expect(screen.queryByText('The exception now leads.')).not.toBeInTheDocument();
    rerender(<NotebookEssay snapshot={essaySnapshot({
      revisedAt: '2026-09-13T15:00:00.000Z',
      correction: 'The exception now leads.'
    })} />);
    expect(screen.getByText(/^Updated /)).toHaveTextContent('Updated');
    expect(screen.getByText('The exception now leads.')).toBeInTheDocument();
  });

  it('does not invent an Updated line when the calendar date did not move', () => {
    render(<NotebookEssay snapshot={essaySnapshot({
      publishedAt: '2026-09-12T12:00:00.000Z',
      revisedAt: '2026-09-12T18:00:00.000Z'
    })} />);
    expect(screen.queryByText(/^Updated /)).not.toBeInTheDocument();
  });

  it('invites a question on a published sentence, and stays silent in the compact preview', async () => {
    const onAsk = jest.fn(() => Promise.resolve());
    const { rerender } = render(<NotebookEssay snapshot={essaySnapshot()} onAsk={onAsk} />);
    expect(screen.getByTestId('notebook-ask-q1')).toBeInTheDocument();
    expect(screen.getByTestId('notebook-ask-p1')).toBeInTheDocument();
    expect(screen.queryByTestId('notebook-ask-h1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notebook-ask-c1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('notebook-ask-q1').querySelector('button'));
    fireEvent.change(screen.getByLabelText('Your question'), {
      target: { value: 'Does spare time belong to the person who pays?' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send to the author' }));
    expect(await screen.findByText('Sent to the author. It stays off this page.')).toBeInTheDocument();
    expect(onAsk).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'q1', type: 'quote' }),
      'Does spare time belong to the person who pays?'
    );
    expect(screen.queryByDisplayValue('Does spare time belong to the person who pays?')).not.toBeInTheDocument();
    rerender(<NotebookEssay snapshot={essaySnapshot()} onAsk={onAsk} compact />);
    expect(screen.queryByRole('button', { name: 'Leave a question' })).not.toBeInTheDocument();
  });
});

describe('NotebookSharePanel', () => {
  it('shows the recipient preview before a link exists', () => {
    render(
      <NotebookSharePanel
        notebookId="essay-1"
        status="ready"
        share={{
          shared: false,
          publishable: true,
          preview: essaySnapshot({ publishedAt: undefined })
        }}
      />
    );
    expect(screen.getByText(/Anyone with the link can read the version you share/)).toBeInTheDocument();
    expect(screen.getByTestId('notebook-share-preview')).toHaveTextContent('The exception arrives first.');
    expect(screen.getByTestId('notebook-share-preview')).toHaveTextContent('What a reader will see');
    expect(screen.queryByTestId('notebook-share-pending')).not.toBeInTheDocument();
    expect(screen.getByTestId('notebook-publish')).toHaveTextContent('Create share link');
    expect(screen.queryByRole('button', { name: 'Print this note' })).not.toBeInTheDocument();
  });

  it('stays silent when nothing would read as a piece of writing', () => {
    render(
      <NotebookSharePanel
        status="ready"
        share={{ shared: false, publishable: false, preview: { title: 'Untitled', blocks: [] } }}
      />
    );
    expect(screen.getByTestId('notebook-share-silence')).toHaveTextContent('Nothing to share yet.');
    expect(screen.queryByTestId('notebook-publish')).not.toBeInTheDocument();
  });

  it('offers an update when the workshop has moved on, and names the revoke boundary', () => {
    render(
      <NotebookSharePanel
        notebookId="essay-1"
        status="ready"
        share={{
          shared: true,
          slug: 'essay-slug',
          stale: true,
          publishable: true,
          snapshot: frozen,
          preview: workshopDraft
        }}
        onUpdate={jest.fn()}
      />
    );
    expect(screen.getByTestId('notebook-share-url').value).toContain('/share/notebooks/essay-slug');
    expect(screen.getByTestId('notebook-update-share')).toHaveTextContent('Update shared version');
    expect(screen.getByText(/Copies already taken stay with their holders/)).toBeInTheDocument();
    const live = screen.getByTestId('notebook-share-preview');
    expect(live).toHaveTextContent('What a reader will see');
    expect(live).toHaveTextContent('The exception arrives first.');
    expect(live).not.toHaveTextContent('Rewritten in the workshop.');
    const pending = screen.getByTestId('notebook-share-pending');
    expect(pending).toHaveTextContent('Pending an update');
    expect(pending).toHaveTextContent('Rewritten in the workshop.');
    expect(screen.getByTestId('notebook-share-correction')).toBeInTheDocument();
    expect(screen.getByText(/A reader will see this sentence/)).toBeInTheDocument();
    expect(live).not.toHaveTextContent('What changed');
    expect(screen.queryByRole('button', { name: 'Print this note' })).not.toBeInTheDocument();
  });

  it('passes the optional correction with Update, without drafting it into the live preview', () => {
    const onUpdate = jest.fn();
    render(
      <NotebookSharePanel
        notebookId="essay-1"
        status="ready"
        share={{
          shared: true,
          slug: 'essay-slug',
          stale: true,
          publishable: true,
          snapshot: frozen,
          preview: workshopDraft
        }}
        onUpdate={onUpdate}
      />
    );
    fireEvent.change(screen.getByTestId('notebook-share-correction'), {
      target: { value: 'The exception now leads.' }
    });
    expect(screen.getByTestId('notebook-share-preview')).not.toHaveTextContent('The exception now leads.');
    fireEvent.click(screen.getByTestId('notebook-update-share'));
    expect(onUpdate).toHaveBeenCalledWith('The exception now leads.');
  });

  it('returns a reader question to the passage, and keeps it out of the public preview', () => {
    render(
      <NotebookSharePanel
        notebookId="essay-1"
        status="ready"
        share={{
          shared: true,
          slug: 'essay-slug',
          stale: false,
          publishable: true,
          snapshot: frozen,
          preview: frozen,
          letters: [{
            id: 'letter-1',
            blockId: 'q1',
            excerpt: 'Two hours a week cannot sustain this.',
            text: 'Does spare time belong to the person who pays?',
            createdAt: '2026-09-13T16:00:00.000Z'
          }]
        }}
      />
    );
    const letters = screen.getByTestId('notebook-share-letters');
    expect(letters).toHaveTextContent('From a reader');
    expect(letters).toHaveTextContent('Two hours a week cannot sustain this.');
    expect(letters).toHaveTextContent('Does spare time belong to the person who pays?');
    expect(screen.getByTestId('notebook-share-preview')).not.toHaveTextContent('Does spare time belong');
    expect(screen.getByTestId('notebook-share-preview')).not.toHaveTextContent('From a reader');
    expect(screen.queryByRole('button', { name: 'Leave a question' })).not.toBeInTheDocument();
  });

  it('falls back to selecting the URL when the clipboard is refused', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn(() => Promise.reject(new Error('denied'))) }
    });
    render(
      <NotebookSharePanel
        notebookId="essay-1"
        status="ready"
        share={{
          shared: true,
          slug: 'essay-slug',
          stale: false,
          publishable: true,
          preview: essaySnapshot({ publishedAt: undefined })
        }}
      />
    );
    fireEvent.click(screen.getByTestId('notebook-copy-link'));
    expect(await screen.findByTestId('notebook-select-link')).toHaveTextContent('Select and copy this link');
    expect(screen.queryByTestId('notebook-share-correction')).not.toBeInTheDocument();
    expect(screen.queryByTestId('notebook-share-letters')).not.toBeInTheDocument();
  });
});

describe('NotebookShare', () => {
  beforeEach(() => {
    getNotebookShare.mockReset();
    updateNotebookShare.mockReset();
  });

  it('reloads after a later save without treating the workshop draft as the live link', async () => {
    getNotebookShare
      .mockResolvedValueOnce({
        shared: true,
        slug: 'essay-slug',
        stale: false,
        publishable: true,
        snapshot: frozen,
        preview: frozen
      })
      .mockResolvedValueOnce({
        shared: true,
        slug: 'essay-slug',
        stale: true,
        publishable: true,
        snapshot: frozen,
        preview: workshopDraft
      });

    const { rerender } = render(<NotebookShare notebookId="essay-1" revision={0} />);
    expect(await screen.findByTestId('notebook-share-preview')).toHaveTextContent('The exception arrives first.');
    expect(screen.queryByTestId('notebook-share-pending')).not.toBeInTheDocument();

    rerender(<NotebookShare notebookId="essay-1" revision={1} />);
    await waitFor(() => {
      expect(screen.getByTestId('notebook-share-pending')).toHaveTextContent('Rewritten in the workshop.');
    });
    expect(screen.getByTestId('notebook-update-share')).toBeInTheDocument();
    expect(screen.getByTestId('notebook-share-preview')).not.toHaveTextContent('Rewritten in the workshop.');
    expect(getNotebookShare).toHaveBeenCalledTimes(2);
  });

  it('updates the shared version with the optional correction', async () => {
    getNotebookShare.mockResolvedValue({
      shared: true,
      slug: 'essay-slug',
      stale: true,
      publishable: true,
      currentHash: 'hash-2',
      snapshot: frozen,
      preview: workshopDraft
    });
    updateNotebookShare.mockResolvedValue({
      shared: true,
      slug: 'essay-slug',
      stale: false,
      publishable: true,
      currentHash: 'hash-2',
      snapshot: essaySnapshot({
        revisedAt: '2026-09-13T15:00:00.000Z',
        correction: 'The exception now leads.'
      }),
      preview: workshopDraft
    });
    render(<NotebookShare notebookId="essay-1" />);
    fireEvent.change(await screen.findByTestId('notebook-share-correction'), {
      target: { value: 'The exception now leads.' }
    });
    fireEvent.click(screen.getByTestId('notebook-update-share'));
    await waitFor(() => expect(updateNotebookShare).toHaveBeenCalledWith('essay-1', {
      previewHash: 'hash-2',
      correction: 'The exception now leads.'
    }));
  });
});
