import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WikiEdgarWatchControl, {
  formatEdgarWatchReceipt,
  isCompanyDossierPage
} from './WikiEdgarWatchControl';
import { armEdgarWatch } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  armEdgarWatch: jest.fn()
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
    edgar: {
      ticker: 'AAPL',
      cik: '0000320193',
      companyName: 'Apple Inc.',
      status: 'active',
      lastCheckedAt: '2026-06-28T12:00:00.000Z'
    }
  }
};

describe('WikiEdgarWatchControl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detects company dossier pages by entity pageType', () => {
    expect(isCompanyDossierPage({ pageType: 'entity' })).toBe(true);
    expect(isCompanyDossierPage({ pageType: 'concept' })).toBe(false);
  });

  it('formats armed receipt copy with ticker and last checked date', () => {
    expect(formatEdgarWatchReceipt({
      ticker: 'AAPL',
      lastCheckedAt: '2026-06-28T12:00:00.000Z'
    })).toMatch(/EDGAR watcher armed for AAPL · last filing checked Jun 28, 2026/);
  });

  it('does not render on non-entity pages', () => {
    const { container } = render(
      <WikiEdgarWatchControl pageId="wiki-1" page={{ pageType: 'concept', title: 'Moat' }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows empty state with research disclaimer and ticker input', () => {
    render(<WikiEdgarWatchControl pageId="wiki-entity-1" page={entityPage} />);

    expect(screen.getByRole('heading', { name: 'Track SEC filings' })).toBeInTheDocument();
    expect(screen.getByText(/Research only/i)).toBeInTheDocument();
    expect(screen.getByText(/No trading, brokerage access, or investment advice/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Ticker or CIK')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Track SEC filings' })).toBeInTheDocument();
  });

  it('arms EDGAR watch and shows receipt on success', async () => {
    const onPageUpdate = jest.fn();
    armEdgarWatch.mockResolvedValueOnce({ page: armedPage });

    render(
      <WikiEdgarWatchControl
        pageId="wiki-entity-1"
        page={entityPage}
        onPageUpdate={onPageUpdate}
      />
    );

    fireEvent.change(screen.getByLabelText('Ticker or CIK'), { target: { value: 'AAPL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Track SEC filings' }));

    await waitFor(() => {
      expect(armEdgarWatch).toHaveBeenCalledWith('wiki-entity-1', { ticker: 'AAPL', cik: '' });
    });
    expect(onPageUpdate).toHaveBeenCalledWith(armedPage);
  });

  it('shows API error when arming fails', async () => {
    armEdgarWatch.mockRejectedValueOnce(new Error('Unknown ticker symbol.'));

    render(<WikiEdgarWatchControl pageId="wiki-entity-1" page={entityPage} />);

    fireEvent.change(screen.getByLabelText('Ticker or CIK'), { target: { value: 'ZZZZ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Track SEC filings' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown ticker symbol.');
  });

  it('shows armed receipt when watch is already active', () => {
    render(<WikiEdgarWatchControl pageId="wiki-entity-1" page={armedPage} />);

    expect(screen.getByRole('status')).toHaveTextContent(/EDGAR watcher armed for AAPL · last filing checked Jun 28, 2026/);
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update watch' })).toBeInTheDocument();
  });

  it('shows stored watch error state', () => {
    render(
      <WikiEdgarWatchControl
        pageId="wiki-entity-1"
        page={{
          ...entityPage,
          externalWatches: {
            edgar: {
              ticker: 'AAPL',
              status: 'error',
              errorMessage: 'SEC rate limit exceeded.'
            }
          }
        }}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('SEC rate limit exceeded.');
  });
});
