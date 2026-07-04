import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WikiTranscriptWatchControl, {
  formatTranscriptWatchReceipt
} from './WikiTranscriptWatchControl';
import { armTranscriptWatch } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  armTranscriptWatch: jest.fn()
}));

const entityPage = {
  _id: 'wiki-entity-1',
  title: 'Apple Inc.',
  pageType: 'entity',
  externalWatches: {}
};

const armedPage = {
  ...entityPage,
  externalWatches: {
    transcripts: {
      ticker: 'AAPL',
      status: 'active',
      lastCheckedAt: '2026-06-28T12:00:00.000Z',
      lastTranscriptAt: '2026-06-01T12:00:00.000Z'
    }
  }
};

describe('WikiTranscriptWatchControl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('formats armed receipt copy with ticker and last checked date', () => {
    expect(formatTranscriptWatchReceipt({
      ticker: 'AAPL',
      status: 'active',
      lastCheckedAt: '2026-06-28T12:00:00.000Z',
      lastTranscriptAt: '2026-06-01T12:00:00.000Z'
    })).toMatch(/Transcript watcher armed for AAPL · last checked Jun 28, 2026 · latest call Jun 1, 2026/);
  });

  it('formats queued receipt when first sync is pending', () => {
    expect(formatTranscriptWatchReceipt({
      ticker: 'AAPL',
      status: 'active',
      lastCheckedAt: null
    })).toMatch(/Transcript watcher queued for AAPL · first sync pending/);
  });

  it('does not render on non-entity pages', () => {
    const { container } = render(
      <WikiTranscriptWatchControl pageId="wiki-1" page={{ pageType: 'concept', title: 'Moat' }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows empty state with research disclaimer and ticker input', () => {
    render(<WikiTranscriptWatchControl pageId="wiki-entity-1" page={entityPage} />);

    expect(screen.getByRole('heading', { name: 'Track earnings transcripts' })).toBeInTheDocument();
    expect(screen.getByText(/Research only/i)).toBeInTheDocument();
    expect(screen.getByText(/No trading, brokerage access, or investment advice/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Ticker')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Track transcripts' })).toBeInTheDocument();
  });

  it('arms transcript watch and shows receipt on success', async () => {
    const onPageUpdate = jest.fn();
    armTranscriptWatch.mockResolvedValueOnce({ page: armedPage });

    render(
      <WikiTranscriptWatchControl
        pageId="wiki-entity-1"
        page={entityPage}
        onPageUpdate={onPageUpdate}
      />
    );

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'AAPL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Track transcripts' }));

    await waitFor(() => {
      expect(armTranscriptWatch).toHaveBeenCalledWith('wiki-entity-1', { ticker: 'AAPL' });
    });
    expect(onPageUpdate).toHaveBeenCalledWith(armedPage);
  });

  it('shows API error when arming fails', async () => {
    armTranscriptWatch.mockRejectedValueOnce(new Error('Unknown ticker symbol.'));

    render(<WikiTranscriptWatchControl pageId="wiki-entity-1" page={entityPage} />);

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'ZZZZ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Track transcripts' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown ticker symbol.');
  });

  it('shows provider key missing copy when API reports missing FMP key', async () => {
    armTranscriptWatch.mockRejectedValueOnce(new Error('FMP_API_KEY is required for earnings transcript sync.'));

    render(<WikiTranscriptWatchControl pageId="wiki-entity-1" page={entityPage} />);

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'AAPL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Track transcripts' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Provider API key missing on server/i);
  });

  it('shows armed receipt when watch is already active', () => {
    render(<WikiTranscriptWatchControl pageId="wiki-entity-1" page={armedPage} />);

    expect(screen.getByRole('status')).toHaveTextContent(/Transcript watcher armed for AAPL · last checked Jun 28, 2026/);
    expect(screen.getByRole('button', { name: 'Update watch' })).toBeInTheDocument();
  });

  it('shows stored watch error state', () => {
    render(
      <WikiTranscriptWatchControl
        pageId="wiki-entity-1"
        page={{
          ...entityPage,
          externalWatches: {
            transcripts: {
              ticker: 'AAPL',
              status: 'error',
              errorMessage: 'FMP transcript request failed with HTTP 429.'
            }
          }
        }}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('FMP transcript request failed with HTTP 429.');
  });
});
