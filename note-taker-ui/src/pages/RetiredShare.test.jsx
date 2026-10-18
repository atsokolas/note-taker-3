import React from 'react';
import { render, screen } from '@testing-library/react';
import api from '../api';
import RetiredShare, { NO_LONGER_SHARED } from './RetiredShare';

// The router is stubbed to the surface this page uses, as in SharedConcept.test.
jest.mock('react-router-dom', () => ({
  Link: ({ to, children, className }) => <a href={to} className={className}>{children}</a>,
  Navigate: ({ to, replace }) => <output data-testid="redirect" data-replace={String(replace)}>{to}</output>,
  useParams: () => ({ slug: 'old-slug' })
}), { virtual: true });
jest.mock('../api', () => ({ get: jest.fn() }));

it('opens the shared wiki page the piece settled into, replacing the old address', async () => {
  api.get.mockResolvedValueOnce({ data: { to: '/share/wiki/page-1' } });
  render(<RetiredShare kind="notebooks" />);
  const redirect = await screen.findByTestId('redirect');
  expect(redirect).toHaveTextContent('/share/wiki/page-1');
  expect(redirect).toHaveAttribute('data-replace', 'true');
  expect(api.get).toHaveBeenCalledWith('/api/public/retired/notebooks/old-slug');
});

it('says in one calm line that the piece is no longer shared, and nothing more', async () => {
  api.get.mockRejectedValueOnce({ response: { status: 410 } });
  const { container } = render(<RetiredShare kind="volumes" />);
  expect(await screen.findByText(NO_LONGER_SHARED)).toBeInTheDocument();
  expect(container.querySelectorAll('p')).toHaveLength(2);
  expect(screen.getByRole('link', { name: 'Noeis' })).toHaveAttribute('href', '/');
});

it('shows the same line when the answer names nowhere to go', async () => {
  api.get.mockResolvedValueOnce({ data: {} });
  render(<RetiredShare kind="notebooks" />);
  expect(await screen.findByText(NO_LONGER_SHARED)).toBeInTheDocument();
  expect(screen.queryByTestId('redirect')).not.toBeInTheDocument();
});
