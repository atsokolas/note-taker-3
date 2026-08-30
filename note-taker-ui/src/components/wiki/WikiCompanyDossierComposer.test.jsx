import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import { createCompanyDossier, trackCompanyDossierInJudgment } from '../../api/wiki';
import { SystemStatusProvider } from '../../system/SystemStatusContext';
import WikiCompanyDossierComposer from './WikiCompanyDossierComposer';

jest.mock('../../api/wiki', () => ({
  createCompanyDossier: jest.fn(),
  trackCompanyDossierInJudgment: jest.fn()
}));

const fillDossierForm = () => {
  fireEvent.click(screen.getByRole('button', { name: /create an investment dossier/i }));
  fireEvent.change(screen.getByLabelText('Company ticker'), { target: { value: 'amd' } });
  fireEvent.change(screen.getByLabelText('Starting investment judgment'), {
    target: { value: 'AMD can gain durable share if its accelerator roadmap and software improve.' }
  });
};

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('opens directly when embedded in the Wiki creation chooser', () => {
  render(
    <MemoryRouter>
      <WikiCompanyDossierComposer embedded />
    </MemoryRouter>
  );

  expect(screen.queryByRole('button', { name: /create an investment dossier/i })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Company ticker')).toBeInTheDocument();
  expect(screen.getByLabelText('Starting investment judgment')).toBeInTheDocument();
  expect(screen.getByText(/enters Judgment only when you choose to track it/i)).toBeInTheDocument();
});

test('creates a human-owned company dossier and opens first-head build review', async () => {
  const navigate = jest.fn();
  jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
  createCompanyDossier.mockResolvedValue({
    action: 'created',
    company: { ticker: 'AMD' },
    page: { _id: 'page-amd' },
    receipt: { title: 'Created AMD investment dossier.', summary: 'SEC filing watch armed.' }
  });
  const controls = {
    setLatestReceipt: jest.fn(),
    setBackgroundWork: jest.fn(),
    setRecoverableFailure: jest.fn(),
    clearRecoverableFailure: jest.fn()
  };
  render(
    <MemoryRouter>
      <SystemStatusProvider value={controls}>
        <WikiCompanyDossierComposer />
      </SystemStatusProvider>
    </MemoryRouter>
  );
  fillDossierForm();
  fireEvent.click(screen.getByRole('button', { name: 'Create dossier' }));
  await waitFor(() => expect(createCompanyDossier).toHaveBeenCalledWith({
    ticker: 'AMD',
    startingJudgment: 'AMD can gain durable share if its accelerator roadmap and software improve.',
    requiredReturn: 0.1,
    horizonYears: 5
  }));
  expect(navigate).toHaveBeenCalledWith('/wiki/workspace?page=page-amd&build=1', { replace: false });
  expect(trackCompanyDossierInJudgment).not.toHaveBeenCalled();
  expect(controls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Created AMD investment dossier.',
    status: 'completed'
  }));
});

test('opens a partial creation without starting an evidence-free first build', async () => {
  const navigate = jest.fn();
  jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
  createCompanyDossier.mockResolvedValue({
    action: 'created',
    company: { ticker: 'AMD' },
    page: { _id: 'page-amd' },
    watchResult: { watchError: 'SEC temporarily unavailable' },
    receipt: {
      status: 'partial',
      title: 'Created AMD investment dossier.',
      summary: 'The private dossier was saved. The SEC filing check needs retry.'
    }
  });
  const controls = {
    setLatestReceipt: jest.fn(),
    setBackgroundWork: jest.fn(),
    setRecoverableFailure: jest.fn(),
    clearRecoverableFailure: jest.fn()
  };
  render(
    <MemoryRouter>
      <SystemStatusProvider value={controls}>
        <WikiCompanyDossierComposer />
      </SystemStatusProvider>
    </MemoryRouter>
  );
  fillDossierForm();
  fireEvent.click(screen.getByRole('button', { name: 'Create dossier' }));

  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/wiki/workspace?page=page-amd', { replace: false }));
  expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining('&build=1'), expect.anything());
  expect(controls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
    status: 'completed_with_warnings'
  }));
  expect(screen.getByRole('status')).toHaveTextContent('SEC filing check needs retry');
});

test('shows a changed-input conflict without navigating or discarding the new judgment', async () => {
  const navigate = jest.fn();
  jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
  createCompanyDossier.mockRejectedValue({
    response: {
      data: {
        code: 'DOSSIER_INPUT_CONFLICT',
        error: 'AMD already has an active dossier with a different owner judgment or return hurdle.'
      }
    }
  });
  const controls = {
    setLatestReceipt: jest.fn(),
    setBackgroundWork: jest.fn(),
    setRecoverableFailure: jest.fn(),
    clearRecoverableFailure: jest.fn()
  };
  render(
    <MemoryRouter>
      <SystemStatusProvider value={controls}>
        <WikiCompanyDossierComposer />
      </SystemStatusProvider>
    </MemoryRouter>
  );
  fillDossierForm();
  fireEvent.click(screen.getByRole('button', { name: 'Create dossier' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('different owner judgment');
  expect(navigate).not.toHaveBeenCalled();
  expect(controls.setRecoverableFailure).toHaveBeenCalledWith(expect.objectContaining({
    stage: 'Existing dossier conflict',
    retryable: false
  }));
});

test('declines a foreign filer inline and preserves the entered judgment', async () => {
  const navigate = jest.fn();
  jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
  createCompanyDossier.mockRejectedValue({
    response: {
      data: {
        code: 'DOSSIER_FOREIGN_FILER_UNSUPPORTED',
        error: 'ASML files as a foreign private issuer (20-F). Noeis dossiers currently support US domestic filers (10-K/10-Q). Foreign-filer support is coming.'
      }
    }
  });
  const controls = {
    setLatestReceipt: jest.fn(),
    setBackgroundWork: jest.fn(),
    setRecoverableFailure: jest.fn(),
    clearRecoverableFailure: jest.fn()
  };
  render(
    <MemoryRouter>
      <SystemStatusProvider value={controls}>
        <WikiCompanyDossierComposer />
      </SystemStatusProvider>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create an investment dossier' }));
  fireEvent.change(screen.getByLabelText('Company ticker'), { target: { value: 'ASML' } });
  fireEvent.change(screen.getByLabelText('Starting investment judgment'), {
    target: { value: 'ASML has durable lithography economics but geopolitical concentration matters.' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create dossier' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('foreign private issuer (20-F)');
  expect(screen.getByLabelText('Starting investment judgment')).toHaveValue(
    'ASML has durable lithography economics but geopolitical concentration matters.'
  );
  expect(navigate).not.toHaveBeenCalled();
  expect(controls.setRecoverableFailure).toHaveBeenCalledWith(expect.objectContaining({
    stage: 'Filer not supported yet',
    retryable: false
  }));
});
