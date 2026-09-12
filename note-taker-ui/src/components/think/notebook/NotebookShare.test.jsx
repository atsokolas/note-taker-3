import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NotebookEssay from './NotebookEssay';
import { NotebookSharePanel } from './NotebookShare';
import { essaySnapshot } from './notebookShareFixture';

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
    expect(screen.getByTestId('notebook-publish')).toHaveTextContent('Create share link');
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
          preview: essaySnapshot({ publishedAt: undefined })
        }}
        onUpdate={jest.fn()}
      />
    );
    expect(screen.getByTestId('notebook-share-url').value).toContain('/share/notebooks/essay-slug');
    expect(screen.getByTestId('notebook-update-share')).toHaveTextContent('Update shared version');
    expect(screen.getByText(/Copies already taken stay with their holders/)).toBeInTheDocument();
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
  });
});
