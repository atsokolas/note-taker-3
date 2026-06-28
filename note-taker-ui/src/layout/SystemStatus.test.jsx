import { readFileSync } from 'fs';
import path from 'path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import SystemStatus from './SystemStatus';

describe('SystemStatus', () => {
  it('renders nothing when all status fields are empty', () => {
    const { container } = render(<SystemStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a compact trigger with polite live region for background work', () => {
    render(
      <SystemStatus
        backgroundWork={{ label: 'Syncing Readwise', stage: 'Attaching highlights' }}
      />
    );

    const liveRegion = screen.getByText('Syncing Readwise: Attaching highlights');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');

    const trigger = screen.getByTestId('system-status-trigger');
    expect(trigger).toHaveAttribute('aria-label', 'System status: work in progress');
    expect(trigger).toHaveClass('topbar__icon-button', 'system-status__trigger');
    expect(screen.getByTestId('system-status')).toHaveAttribute('data-tone', 'working');
  });

  it('opens a single detail panel instead of stacking toasts', () => {
    render(
      <SystemStatus
        backgroundWork={{ label: 'Wiki maintenance' }}
        latestReceipt={{ title: 'Readwise sync', summary: '47 highlights attached' }}
        recoverableFailure={{ stage: 'Import', message: 'Needs review', retryable: true }}
      />
    );

    fireEvent.click(screen.getByTestId('system-status-trigger'));
    const popover = screen.getByTestId('system-status-popover');
    expect(within(popover).getByText('Recoverable failure')).toBeInTheDocument();
    expect(within(popover).getByText('Background work')).toBeInTheDocument();
    expect(within(popover).getByText('Latest receipt')).toBeInTheDocument();
    expect(within(popover).getAllByRole('status')).toHaveLength(3);
  });

  it('uses mobile-first compact trigger sizing in CSS', () => {
    const css = readFileSync(path.join(__dirname, 'system-status.css'), 'utf8');
    expect(css).toMatch(/\.system-status__trigger[\s\S]*height: 34px/);
    expect(css).toMatch(/max-width: 34px/);
    expect(css).toMatch(/\.system-status__label[\s\S]*display: none/);
  });

  it('keeps the inline label element for desktop but mobile-first CSS hides it', () => {
    render(
      <SystemStatus latestReceipt={{ title: 'Readwise sync', summary: '47 highlights attached' }} />
    );

    const label = screen.getByText('Readwise sync');
    expect(label).toHaveClass('system-status__label');
    expect(label).toHaveAttribute('aria-hidden', 'true');
  });

  it('calls retry handler from the failure section', () => {
    const onRetryFailure = jest.fn();
    render(
      <SystemStatus
        recoverableFailure={{ stage: 'Import', message: 'Retry sync', retryable: true }}
        onRetryFailure={onRetryFailure}
      />
    );

    fireEvent.click(screen.getByTestId('system-status-trigger'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryFailure).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('system-status-popover')).toBeNull();
  });
});
