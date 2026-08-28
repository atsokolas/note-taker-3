import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WikiCreationComposer from './WikiCreationComposer';

jest.mock('./WikiBuildPageComposer', () => (props) => (
  <div>
    General Wiki form
    <button type="button" onClick={() => props.onBusyChange(true)}>Start Wiki</button>
  </div>
));
jest.mock('./WikiRepoCreateComposer', () => () => <div>Repository Wiki form</div>);
jest.mock('./WikiCompanyDossierComposer', () => (props) => (
  <div>Investment Dossier form · embedded {String(props.embedded)}</div>
));

test('offers Wiki, Repo wiki, and Investment dossier as peer creation modes', () => {
  render(<WikiCreationComposer />);

  const wikiTab = screen.getByRole('button', { name: 'Wiki' });
  const repoTab = screen.getByRole('button', { name: 'Repo wiki' });
  const dossierTab = screen.getByRole('button', { name: 'Investment dossier' });

  expect(wikiTab).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('General Wiki form')).toBeInTheDocument();

  fireEvent.click(repoTab);
  expect(repoTab).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Repository Wiki form')).toBeInTheDocument();
  expect(screen.getByText(/public GitHub repository/i)).toBeInTheDocument();

  fireEvent.click(dossierTab);
  expect(dossierTab).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Investment Dossier form · embedded true')).toBeInTheDocument();
  expect(screen.getByText(/free SEC filings and your judgment/i)).toBeInTheDocument();

  fireEvent.click(wikiTab);
  fireEvent.click(screen.getByRole('button', { name: 'Start Wiki' }));
  expect(repoTab).toBeDisabled();
  expect(dossierTab).toBeDisabled();
});

test('keeps each composer mounted while switching modes', () => {
  render(<WikiCreationComposer />);

  fireEvent.click(screen.getByRole('button', { name: 'Investment dossier' }));
  const dossier = screen.getByText(/Investment Dossier form/);
  fireEvent.click(screen.getByRole('button', { name: 'Wiki' }));
  fireEvent.click(screen.getByRole('button', { name: 'Investment dossier' }));

  expect(dossier).toBeInTheDocument();
});
