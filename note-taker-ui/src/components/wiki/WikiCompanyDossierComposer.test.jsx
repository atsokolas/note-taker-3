import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as router from 'react-router-dom';
import { createCompanyDossier } from '../../api/wiki';
import { SystemStatusProvider } from '../../system/SystemStatusContext';
import WikiCompanyDossierComposer from './WikiCompanyDossierComposer';

jest.mock('../../api/wiki', () => ({ createCompanyDossier: jest.fn() }));

test('creates a human-owned company dossier and opens first-head build review', async () => {
  const navigate = jest.fn();
  jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
  createCompanyDossier.mockResolvedValue({
    action: 'created',
    company: { ticker: 'AMD' },
    page: { _id: 'page-amd' },
    receipt: { title: 'Created AMD investment dossier.', summary: 'SEC filing watch armed.' }
  });
  const controls = { setLatestReceipt: jest.fn() };
  render(
    <MemoryRouter>
      <SystemStatusProvider value={controls}>
        <WikiCompanyDossierComposer />
      </SystemStatusProvider>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: /create a maintained company dossier/i }));
  fireEvent.change(screen.getByLabelText('Company ticker'), { target: { value: 'amd' } });
  fireEvent.change(screen.getByLabelText('Starting investment judgment'), {
    target: { value: 'AMD can gain durable share if its accelerator roadmap and software improve.' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create dossier' }));
  await waitFor(() => expect(createCompanyDossier).toHaveBeenCalledWith({
    ticker: 'AMD',
    startingJudgment: 'AMD can gain durable share if its accelerator roadmap and software improve.',
    requiredReturn: 0.1,
    horizonYears: 5
  }));
  expect(navigate).toHaveBeenCalledWith('/wiki/workspace?page=page-amd&build=1', { replace: false });
  expect(controls.setLatestReceipt).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Created AMD investment dossier.'
  }));
});
