import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import EmptyState, { ErrorState } from './EmptyState';

describe('EmptyState', () => {
  it('renders compact variant with text and inline action', () => {
    const onAction = jest.fn();
    render(
      <EmptyState
        text="No notes yet."
        actionLabel="Start your first note"
        onAction={onAction}
        testId="empty-notebook"
      />
    );
    const wrapper = screen.getByTestId('empty-notebook');
    expect(wrapper.className).toMatch(/empty-state--compact/);
    expect(screen.getByText('No notes yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Start your first note/ }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('omits the action when only text is provided', () => {
    render(<EmptyState text="No items yet." />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders panel variant with eyebrow / title / body / primary CTA / secondary link', () => {
    const onAction = jest.fn();
    render(
      <EmptyState
        variant="panel"
        eyebrow="Library"
        title="Save your first article"
        text="Use the browser extension to save and highlight from any page."
        actionLabel="Install extension"
        actionHref="https://chrome.google.com/x"
        actionExternal
        secondaryLabel="See the walkthrough"
        secondaryHref="/how-to-use"
        testId="empty-library"
      />
    );
    const wrapper = screen.getByTestId('empty-library');
    expect(wrapper.className).toMatch(/empty-state--panel/);
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Save your first article' })).toBeInTheDocument();

    const primary = screen.getByRole('link', { name: 'Install extension' });
    expect(primary).toHaveAttribute('href', 'https://chrome.google.com/x');
    expect(primary).toHaveAttribute('target', '_blank');

    const secondary = screen.getByRole('link', { name: 'See the walkthrough' });
    expect(secondary).toHaveAttribute('href', '/how-to-use');
  });

  it('prefers actionHref over onAction when both are provided', () => {
    const onAction = jest.fn();
    render(
      <EmptyState
        variant="panel"
        title="Test"
        actionLabel="Go"
        actionHref="/x"
        onAction={onAction}
      />
    );
    const link = screen.getByRole('link', { name: 'Go' });
    expect(link).toHaveAttribute('href', '/x');
    fireEvent.click(link);
    // navigating doesn't fire onAction
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe('ErrorState', () => {
  it('renders the message and no retry by default', () => {
    render(<ErrorState message="Failed to load." testId="err" />);
    expect(screen.getByTestId('err')).toBeInTheDocument();
    expect(screen.getByText('Failed to load.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a Try again button when onRetry is set', () => {
    const onRetry = jest.fn();
    render(<ErrorState message="Boom." onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('respects custom retry label', () => {
    render(<ErrorState message="Boom." onRetry={() => {}} retryLabel="Reload" />);
    expect(screen.getByRole('button', { name: /Reload/ })).toBeInTheDocument();
  });
});
