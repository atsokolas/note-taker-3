import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotebookVolume, { NotebookVolumePanel } from './NotebookVolume';
import { volumeSnapshot } from './notebookShareFixture';
import { getNotebookVolume, previewNotebookVolume, publishNotebookVolume } from '../../../api/notebook';

jest.mock('../../../api/notebook', () => ({
  getNotebookVolume: jest.fn(),
  previewNotebookVolume: jest.fn(),
  publishNotebookVolume: jest.fn(),
  revokeNotebookVolume: jest.fn(),
  updateNotebookVolume: jest.fn()
}));
jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>
}));

const catalog = [
  { notebookId: 'note-1', title: 'Who gets to experiment, and who pays?', contentHash: 'a' },
  { notebookId: 'note-2', title: 'Whose downside?', contentHash: 'b' }
];

describe('NotebookVolumePanel', () => {
  it('collects published notes into a volume and keeps the live link off an empty catalog', () => {
    render(
      <NotebookVolumePanel
        notebookId="note-1"
        status="ready"
        share={{
          shared: false,
          publishable: true,
          catalog,
          preview: volumeSnapshot({ publishedAt: undefined })
        }}
        title="Who pays?"
        introduction="Two finished notes, one question."
        selection={['note-1', 'note-2']}
      />
    );
    expect(screen.getByTestId('notebook-volume-publish')).toBeInTheDocument();
    expect(screen.getByText('Collected volume')).toBeInTheDocument();
    expect(screen.getByText('The exception first')).toBeInTheDocument();
    expect(screen.getByText('The cost')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Print this volume' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Leave a question' })).not.toBeInTheDocument();
  });

  it('stays silent until two published notes exist', () => {
    render(
      <NotebookVolumePanel
        notebookId="note-1"
        status="ready"
        share={{
          shared: false,
          publishable: false,
          catalog: [catalog[0]],
          preview: { pieces: [] }
        }}
        title=""
        introduction=""
        selection={['note-1']}
      />
    );
    expect(screen.getByTestId('notebook-volume-silence')).toHaveTextContent('Share at least two notes first.');
    expect(screen.queryByTestId('notebook-volume-publish')).not.toBeInTheDocument();
  });

  it('names the frozen snapshot as what a reader will see when the workshop moved', () => {
    render(
      <NotebookVolumePanel
        notebookId="note-1"
        status="ready"
        share={{
          shared: true,
          slug: 'volume-slug',
          stale: true,
          catalog,
          snapshot: volumeSnapshot(),
          preview: volumeSnapshot({ introduction: 'Rewritten in the workshop.' })
        }}
        title="Who pays?"
        introduction="Rewritten in the workshop."
        selection={['note-1', 'note-2']}
      />
    );
    expect(screen.getByTestId('notebook-volume-url').value).toContain('/share/volumes/volume-slug');
    expect(screen.getByTestId('notebook-volume-preview')).toHaveTextContent('Two finished notes, one question.');
    expect(screen.getByTestId('notebook-volume-pending')).toHaveTextContent('Rewritten in the workshop.');
    expect(screen.getByTestId('notebook-volume-update')).toBeInTheDocument();
  });
});

describe('NotebookVolume', () => {
  beforeEach(() => {
    getNotebookVolume.mockReset();
    previewNotebookVolume.mockReset();
    publishNotebookVolume.mockReset();
    getNotebookVolume.mockResolvedValue({
      shared: false,
      catalog,
      selection: [],
      title: '',
      introduction: ''
    });
    previewNotebookVolume.mockResolvedValue({
      shared: false,
      catalog,
      publishable: true,
      currentHash: 'hash-1',
      preview: volumeSnapshot({ publishedAt: undefined })
    });
  });

  it('publishes the current through-line after confirming the preview hash', async () => {
    publishNotebookVolume.mockResolvedValue({
      shared: true,
      slug: 'volume-slug',
      catalog,
      snapshot: volumeSnapshot()
    });

    render(<NotebookVolume notebookId="note-1" />);
    fireEvent.change(await screen.findByTestId('notebook-volume-title'), {
      target: { value: 'Who pays?' }
    });
    fireEvent.change(screen.getByTestId('notebook-volume-intro'), {
      target: { value: 'Two finished notes, one question.' }
    });
    fireEvent.click(screen.getByLabelText('Whose downside?'));
    fireEvent.click(await screen.findByTestId('notebook-volume-publish'));

    await waitFor(() => expect(publishNotebookVolume).toHaveBeenCalled());
    expect(publishNotebookVolume.mock.calls[0][0]).toEqual({
      notebookIds: ['note-1', 'note-2'],
      title: 'Who pays?',
      introduction: 'Two finished notes, one question.',
      previewHash: 'hash-1'
    });
    expect(previewNotebookVolume).toHaveBeenCalled();
    expect(getNotebookVolume.mock.calls.every((call) => call.length === 0)).toBe(true);
  });

  it('previews unpublished title and introduction without putting them on GET', async () => {
    render(<NotebookVolume notebookId="note-1" />);
    await screen.findByTestId('notebook-volume-title');
    getNotebookVolume.mockClear();
    previewNotebookVolume.mockClear();

    fireEvent.change(screen.getByTestId('notebook-volume-title'), {
      target: { value: 'Who pays?' }
    });
    fireEvent.change(screen.getByTestId('notebook-volume-intro'), {
      target: { value: 'Unpublished through-line.' }
    });

    await waitFor(() => expect(previewNotebookVolume).toHaveBeenCalledWith({
      notebookIds: ['note-1'],
      title: 'Who pays?',
      introduction: 'Unpublished through-line.'
    }));
    expect(getNotebookVolume).not.toHaveBeenCalled();
  });
});
