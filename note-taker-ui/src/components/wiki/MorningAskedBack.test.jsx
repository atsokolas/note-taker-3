import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MorningAskedBack from './MorningAskedBack';
import { updateReturnQueueEntry } from '../../api/returnQueue';

jest.mock('../../api/returnQueue', () => ({
  updateReturnQueueEntry: jest.fn()
}));

const item = {
  articleId: 'a1',
  queueId: 'q1',
  title: 'The Costco 10-K',
  href: '/library?articleId=a1',
  fromPlacement: 'setAside',
  fromAt: '2026-08-25T09:00:00.000Z',
  reason: 'the margin note on returns'
};

describe('MorningAskedBack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateReturnQueueEntry.mockResolvedValue({ _id: 'q1', status: 'pending' });
  });

  it('prints καιρός and the title, never Reminders or a count', () => {
    render(
      <MemoryRouter>
        <MorningAskedBack askedBack={[item]} pulse />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Asked back')).toHaveTextContent('καιρός');
    expect(screen.getByLabelText('Asked back')).toHaveTextContent('You asked for this back.');
    expect(screen.getByRole('link', { name: 'The Costco 10-K' }))
      .toHaveAttribute('href', '/library?articleId=a1');
    expect(screen.getByLabelText('Asked back')).toHaveClass('is-morning-pulse');
    expect(screen.queryByText(/Reminders/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\(0\)/)).not.toBeInTheDocument();
  });

  it('omits the block when nothing qualifies', () => {
    const { container } = render(
      <MemoryRouter>
        <MorningAskedBack askedBack={[]} />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('reschedules Next week from the notice, not a toast', async () => {
    render(
      <MemoryRouter>
        <MorningAskedBack askedBack={[item]} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    await waitFor(() => expect(updateReturnQueueEntry).toHaveBeenCalledWith(
      'q1',
      expect.objectContaining({ action: 'reschedule' })
    ));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'The Costco 10-K' })).not.toBeInTheDocument());
  });
});
