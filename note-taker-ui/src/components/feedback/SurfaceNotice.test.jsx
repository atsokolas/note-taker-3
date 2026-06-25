import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SurfaceNotice from './SurfaceNotice';

describe('SurfaceNotice', () => {
  it('renders success notices as polite status updates', () => {
    render(
      <SurfaceNotice variant="success" title="Notion connected">
        <p>Sync pages when you are ready.</p>
      </SurfaceNotice>
    );

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Ready');
    expect(notice).toHaveTextContent('Notion connected');
    expect(notice).toHaveAttribute('aria-live', 'polite');
  });

  it('renders error notices as assertive alerts', () => {
    render(<SurfaceNotice variant="error" title="Sync failed" />);

    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('Needs attention');
    expect(notice).toHaveAttribute('aria-live', 'assertive');
  });

  it('supports quiet recovery actions', () => {
    const onAction = jest.fn();
    render(
      <SurfaceNotice
        variant="recovering"
        title="First pass needed another try"
        actionLabel="Run again"
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
