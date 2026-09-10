import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditionShare from './EditionShare';
import {
  getEditionShare,
  updateEditionShare
} from '../../api/editions';

jest.mock('../../api/editions', () => ({
  getEditionShare: jest.fn(),
  shareEdition: jest.fn(),
  updateEditionShare: jest.fn(),
  revokeEditionShare: jest.fn()
}));

const preview = {
  title: 'This Week in AI',
  issueLabel: 'Issue',
  number: 14,
  windowStart: '2026-09-01',
  windowEnd: '2026-09-07',
  ownerDisplayName: 'Athan',
  standfirst: 'A quiet week.',
  sections: [{ key: 'models_methods', label: 'Models & methods' }],
  items: [{
    itemId: 'item-1',
    title: 'A paper about scaling',
    url: 'https://example.com/paper',
    section: 'models_methods',
    finding: 'Loss keeps falling.',
    boundary: 'One lab.',
    note: 'Editorial aside.'
  }]
};

const open = (editionId = 'e1') => render(
  <EditionShare editionId={editionId} edition={{ title: 'This Week in AI', number: 14, issueLabel: 'Issue' }} />
);

describe('sharing an edition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getEditionShare.mockResolvedValue({
      shared: false,
      preview,
      currentHash: 'hash-1',
      ownerDisplayName: 'Athan'
    });
  });

  it('shows the public preview and the privacy line before a link exists', async () => {
    open();
    expect(await screen.findByText(/Anyone with the link can read the version you share/)).toBeInTheDocument();
    expect(await screen.findByText('Kept by Athan')).toBeInTheDocument();
    expect(screen.getByText('Editorial aside.')).toBeInTheDocument();
    expect(screen.getByTestId('edition-publish')).toHaveTextContent('Create share link');
  });

  it('falls back to selecting the URL when the clipboard is refused', async () => {
    getEditionShare.mockResolvedValue({ shared: true, slug: 'abc123', stale: false, preview });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn(() => Promise.reject(new Error('denied'))) }
    });
    open();
    fireEvent.click(await screen.findByTestId('edition-copy-link'));
    expect(await screen.findByTestId('edition-select-link')).toHaveTextContent('Select and copy this link');
    expect(screen.queryByText('Link copied')).not.toBeInTheDocument();
  });

  it('offers to update when the private issue has moved on', async () => {
    getEditionShare.mockResolvedValue({
      shared: true,
      slug: 'abc123',
      stale: true,
      currentHash: 'hash-2',
      preview
    });
    updateEditionShare.mockResolvedValue({
      shared: true,
      slug: 'abc123',
      stale: false,
      preview
    });
    open();
    fireEvent.click(await screen.findByTestId('edition-update-share'));
    await waitFor(() => expect(updateEditionShare).toHaveBeenCalledWith('e1', { previewHash: 'hash-2' }));
  });

  it('resets when the issue id changes', async () => {
    const { rerender } = render(<EditionShare editionId="e1" edition={{ title: 'A' }} />);
    await screen.findByTestId('edition-publish');
    getEditionShare.mockResolvedValue({
      shared: true,
      slug: 'other',
      stale: false,
      preview: { ...preview, title: 'Weekend Readings' }
    });
    rerender(<EditionShare editionId="e2" edition={{ title: 'B' }} />);
    expect((await screen.findByTestId('edition-share-url')).value).toContain('/share/editions/other');
    expect(screen.queryByTestId('edition-publish')).not.toBeInTheDocument();
  });
});
