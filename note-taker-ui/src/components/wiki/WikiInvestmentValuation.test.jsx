import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { refreshInvestmentValuation } from '../../api/wiki';
import { SystemStatusProvider } from '../../system/SystemStatusContext';
import WikiInvestmentValuation from './WikiInvestmentValuation';

jest.mock('../../api/wiki', () => ({
  refreshInvestmentValuation: jest.fn()
}));

const controls = {
  setBackgroundWork: jest.fn(),
  setLatestReceipt: jest.fn(),
  setRecoverableFailure: jest.fn(),
  clearRecoverableFailure: jest.fn()
};

const page = {
  _id: 'page-cost',
  title: 'Costco investment dossier',
  investmentDossier: {
    version: 2,
    hurdle: { annualReturn: 0.1, horizonYears: 5 },
    valuation: { status: 'awaiting_inputs' }
  },
  sourceRefs: [{
    _id: 'filing-1',
    title: 'Costco FY2025 10-K',
    url: 'https://www.sec.gov/example'
  }]
};

const valuation = {
  status: 'complete',
  asOf: '2026-07-24T00:00:00.000Z',
  unitScale: 'millions',
  price: 950,
  dilutedShares: 443,
  enterpriseValue: 410000,
  currentOperatingMultiple: 45,
  operatingBase: {
    metric: 'free_cash_flow',
    period: 'FY2025',
    value: 9100,
    derivation: 'Operating cash flow less capital expenditures.'
  },
  hurdle: { annualReturn: 0.1, horizonYears: 5, terminalMultiples: [25, 30] },
  scenarios: [
    { terminalMultiple: 25, requiredOperatingValue: 27100, requiredCagr: 0.244 },
    { terminalMultiple: 30, requiredOperatingValue: 22580, requiredCagr: 0.199 }
  ],
  sources: [{ title: 'Exchange price page', url: 'https://example.com/price' }]
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('submits explicit market and operating inputs without changing the owner hurdle', async () => {
  const onPageUpdate = jest.fn();
  refreshInvestmentValuation.mockResolvedValue({
    page: { ...page, investmentDossier: { ...page.investmentDossier, valuation } },
    receipt: {
      title: 'Refreshed COST implied expectations.',
      summary: 'The SEC filing clock was not changed.'
    }
  });
  render(
    <SystemStatusProvider value={controls}>
      <WikiInvestmentValuation page={page} pageId="page-cost" onPageUpdate={onPageUpdate} />
    </SystemStatusProvider>
  );
  const disclosure = screen.getByText('Add dated market inputs');
  expect(disclosure.closest('details')).not.toHaveAttribute('open');
  fireEvent.click(disclosure);
  expect(screen.getByRole('option', { name: 'Revenue' })).toBeInTheDocument();
  expect(screen.getByLabelText('Price as of')).toHaveClass('noeis-form-control');
  expect(screen.getByLabelText('Calculation scale')).toHaveClass('noeis-form-control');

  fireEvent.change(screen.getByLabelText('Price as of'), { target: { value: '2026-07-24' } });
  fireEvent.change(screen.getByLabelText('Share price'), { target: { value: '950' } });
  fireEvent.change(screen.getByLabelText('Diluted shares (millions)'), { target: { value: '443' } });
  fireEvent.change(screen.getByLabelText('Operating period'), { target: { value: 'FY2025' } });
  fireEvent.change(screen.getByLabelText('Operating base (millions)'), { target: { value: '9100' } });
  fireEvent.change(screen.getByLabelText('Operating-base derivation'), {
    target: { value: 'Operating cash flow less capital expenditures.' }
  });
  fireEvent.change(screen.getByLabelText('Market source title'), { target: { value: 'Exchange price page' } });
  fireEvent.change(screen.getByLabelText('Market source URL'), { target: { value: 'https://example.com/price' } });
  fireEvent.click(screen.getByRole('button', { name: 'Calculate expectations' }));

  await waitFor(() => expect(refreshInvestmentValuation).toHaveBeenCalledWith('page-cost', {
    asOf: '2026-07-24',
    price: 950,
    dilutedShares: 443,
    netCashOrDebt: 0,
    unitScale: 'millions',
    operatingMetric: 'free_cash_flow',
    operatingPeriod: 'FY2025',
    operatingBase: 9100,
    operatingDerivation: 'Operating cash flow less capital expenditures.',
    operatingSourceRefId: 'filing-1',
    terminalMultiples: [15, 20, 25, 30],
    marketSourceTitle: 'Exchange price page',
    marketSourceUrl: 'https://example.com/price'
  }));
  expect(onPageUpdate).toHaveBeenCalled();
  expect(controls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Refreshed COST implied expectations.'
  }));
});

test('renders a public-safe expectations table without edit controls', () => {
  render(<WikiInvestmentValuation valuation={valuation} readOnly />);
  expect(screen.getByRole('heading', { name: 'Implied expectations' })).toBeInTheDocument();
  expect(screen.getByText('What the current price requires')).toBeInTheDocument();
  expect(screen.getByText('24.4%')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Exchange price page' })).toHaveAttribute('href', 'https://example.com/price');
  expect(screen.queryByText('Refresh assumptions')).not.toBeInTheDocument();
});

test('hides an incomplete public valuation', () => {
  const { container } = render(
    <WikiInvestmentValuation valuation={{ status: 'awaiting_inputs' }} readOnly />
  );
  expect(container).toBeEmptyDOMElement();
});

test('keeps incomplete private expectations compact until inputs are requested', () => {
  render(
    <SystemStatusProvider value={controls}>
      <WikiInvestmentValuation page={page} pageId="page-cost" />
    </SystemStatusProvider>
  );

  expect(screen.getByText('Awaiting dated market inputs')).toBeInTheDocument();
  const disclosure = screen.getByText('Add dated market inputs');
  expect(disclosure.closest('details')).not.toHaveAttribute('open');
});
