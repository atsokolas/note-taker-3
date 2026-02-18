import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkingMemoryPanel from './WorkingMemoryPanel';
import api from '../../api';

jest.mock('react-router-dom', () => ({
  Link: ({ children }) => <span>{children}</span>
}), { virtual: true });

jest.mock('../../api', () => ({
  get: jest.fn()
}));

jest.mock('../../hooks/useAuthHeaders', () => ({
  getAuthHeaders: jest.fn(() => ({}))
}));

describe('WorkingMemoryPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
    api.get.mockResolvedValue({ data: [] });
  });

  it('is expanded by default and toggles collapsed state', () => {
    render(<WorkingMemoryPanel items={[]} />);

    expect(screen.getByPlaceholderText(/Scratch freely/i)).toBeInTheDocument();
    expect(screen.getByText('No dumped items yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Collapse Working Memory/i }));
    expect(screen.queryByPlaceholderText(/Scratch freely/i)).not.toBeInTheDocument();
    expect(screen.getByText('Working Memory')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Expand Working Memory/i }));
    expect(screen.getByPlaceholderText(/Scratch freely/i)).toBeInTheDocument();
  });

  it('supports multi-select promote for blocks', async () => {
    const onPromoteBlocks = jest.fn().mockResolvedValue(undefined);
    render(
      <WorkingMemoryPanel
        items={[
          { _id: 'wm-1', textSnippet: 'First memory block', sourceType: 'note', createdAt: new Date().toISOString() },
          { _id: 'wm-2', textSnippet: 'Second memory block', sourceType: 'note', createdAt: new Date().toISOString() }
        ]}
        onPromoteBlocks={onPromoteBlocks}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Promote selected' }));

    await waitFor(() => {
      expect(onPromoteBlocks).toHaveBeenCalledWith(expect.objectContaining({
        target: 'notebook',
        itemIds: ['wm-1', 'wm-2']
      }));
    });
  });

  it('runs split action for an individual block', async () => {
    const onSplitItem = jest.fn().mockResolvedValue(undefined);
    render(
      <WorkingMemoryPanel
        items={[
          { _id: 'wm-1', textSnippet: 'Alpha. Beta.', sourceType: 'note', createdAt: new Date().toISOString() }
        ]}
        onSplitItem={onSplitItem}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    await waitFor(() => {
      expect(onSplitItem).toHaveBeenCalledWith('wm-1', 'sentence');
    });
  });

  it('restores selected archived blocks', async () => {
    const onRestoreItems = jest.fn().mockResolvedValue(undefined);
    render(
      <WorkingMemoryPanel
        viewMode="archived"
        items={[
          { _id: 'wm-1', textSnippet: 'Archived memory', sourceType: 'note', createdAt: new Date().toISOString() }
        ]}
        onRestoreItems={onRestoreItems}
      />
    );

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Restore selected' }));

    await waitFor(() => {
      expect(onRestoreItems).toHaveBeenCalledWith(['wm-1']);
    });
  });
});
