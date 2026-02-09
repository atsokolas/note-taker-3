import { fireEvent, render, screen } from '@testing-library/react';
import WorkingMemoryPanel from './WorkingMemoryPanel';

jest.mock('react-router-dom', () => ({
  Link: ({ children }) => <span>{children}</span>
}), { virtual: true });

describe('WorkingMemoryPanel', () => {
  it('is expanded by default and toggles collapsed state', () => {
    render(<WorkingMemoryPanel items={[]} />);

    expect(screen.getByPlaceholderText(/Dump a thought quickly/i)).toBeInTheDocument();
    expect(screen.getByText('No dumped items yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Collapse Working Memory/i }));
    expect(screen.queryByPlaceholderText(/Dump a thought quickly/i)).not.toBeInTheDocument();
    expect(screen.getByText('Working Memory')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Expand Working Memory/i }));
    expect(screen.getByPlaceholderText(/Dump a thought quickly/i)).toBeInTheDocument();
  });
});
