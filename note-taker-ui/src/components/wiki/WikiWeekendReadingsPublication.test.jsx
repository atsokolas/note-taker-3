import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WikiWeekendReadingsPublication, { actionForState } from './WikiWeekendReadingsPublication';

describe('WikiWeekendReadingsPublication', () => {
  it('shows literal private state and requests review', () => {
    const onRequestReview = jest.fn();
    render(<WikiWeekendReadingsPublication onRequestReview={onRequestReview} />);
    expect(screen.getByRole('status')).toHaveTextContent('Private draft — not public');
    fireEvent.click(screen.getByRole('button', { name: 'Request review' }));
    expect(onRequestReview).toHaveBeenCalledTimes(1);
  });

  it('keeps approval and publication as separate actions', () => {
    const onApprove = jest.fn();
    const { rerender } = render(
      <WikiWeekendReadingsPublication
        approvalState={{ code: 'review_requested', label: 'Review requested — still private' }}
        onApprove={onApprove}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve this revision' }));
    expect(onApprove).toHaveBeenCalledTimes(1);

    const onPublish = jest.fn();
    rerender(
      <WikiWeekendReadingsPublication
        approvalState={{ code: 'approved', label: 'Approved revision — not published' }}
        onPublish={onPublish}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Publish approved revision' }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('requires review again when the draft changed after approval', () => {
    expect(actionForState({ code: 'loading' })).toBeNull();
    expect(actionForState({ code: 'stale_approval' })).toEqual({ key: 'review', label: 'Request review of changed draft' });
    expect(actionForState({ code: 'published', draftChangedAfterPublication: true })).toEqual({ key: 'review', label: 'Request review of changed draft' });
  });

  it('shows a published link without another publication button', () => {
    render(
      <WikiWeekendReadingsPublication
        approvalState={{ code: 'published', label: 'Published — revision abc12345' }}
        publicUrl="/share/wiki/weekend-readings-2026-07-19"
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Published — revision abc12345');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open published edition' })).toHaveAttribute('href', '/share/wiki/weekend-readings-2026-07-19');
  });

  it('uses alert semantics for publication failures and disables active actions', () => {
    render(
      <WikiWeekendReadingsPublication
        approvalState={{ code: 'approved', label: 'Approved revision — not published' }}
        busy
        error="Publication receipt could not be stored."
        onPublish={() => {}}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Publication receipt could not be stored.');
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
  });
});
