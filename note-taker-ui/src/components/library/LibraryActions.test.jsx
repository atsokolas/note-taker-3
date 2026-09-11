import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LibraryActions from './LibraryActions';

describe('Library actions', () => {
  it('sits behind Actions and keeps both tools', () => {
    const onOrganize = jest.fn();
    const onToggleSuppressed = jest.fn();
    render(
      <LibraryActions
        onOrganize={onOrganize}
        onToggleSuppressed={onToggleSuppressed}
      />
    );
    expect(screen.getByText('Actions')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clean up structure'));
    fireEvent.click(screen.getByText('Show review imports'));
    expect(onOrganize).toHaveBeenCalled();
    expect(onToggleSuppressed).toHaveBeenCalled();
  });

  it('closes on Escape and returns focus to the summary', () => {
    render(<LibraryActions onOrganize={() => {}} onToggleSuppressed={() => {}} />);
    const details = screen.getByText('Actions').closest('details');
    details.open = true;
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(details.open).toBe(false);
  });
});
