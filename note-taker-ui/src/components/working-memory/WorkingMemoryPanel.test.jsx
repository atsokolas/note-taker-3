import { fireEvent, render, screen } from '@testing-library/react';
import WorkingMemoryPanel from './WorkingMemoryPanel';

jest.mock('react-router-dom', () => ({
  Link: ({ children }) => <span>{children}</span>
}), { virtual: true });

describe('WorkingMemoryPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
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

  it('shows promote actions for selected text and promotes to card in scope', () => {
    const onPromoteToCard = jest.fn().mockResolvedValue(undefined);
    render(
      <WorkingMemoryPanel
        items={[]}
        onPromoteToCard={onPromoteToCard}
        promotionContext={{ scopeType: 'concept', scopeId: 'Systems Thinking' }}
      />
    );

    const textarea = screen.getByPlaceholderText(/Scratch freely/i);
    fireEvent.change(textarea, { target: { value: 'Alpha\nBeta\nGamma' } });
    textarea.setSelectionRange(0, 10);
    fireEvent.select(textarea);

    fireEvent.click(screen.getByRole('button', { name: 'Make card' }));
    expect(onPromoteToCard).toHaveBeenCalledWith('Alpha\nBeta');
  });
});
