import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReviewerFixtures from './ReviewerFixtures';
import plan from './reviewerFixturePlan.json';
import { createSetupClient, createFixtureSession, verifySetupIdentity, fixtureReceipt } from './reviewerFixtureSetup';

jest.mock('./reviewerFixtureSetup', () => ({
  createSetupClient: jest.fn(), createFixtureSession: jest.fn(), verifySetupIdentity: jest.fn(value => value),
  fixtureReceipt: jest.fn(() => ({ status: 'persisted_and_read_back', connectorAcceptance: 'not_run' })),
  editionFixturePayload: jest.fn(() => ({ fictional: true })),
  editionFixtureReceipt: jest.fn(() => ({ status: 'persisted_and_read_back', connectorAcceptance: 'not_run' }))
}));
const identity = { userId: plan.edition.ownerId, ownershipVerified: true, holdsActive: true,
  fixtureBindingComplete: false, username: 'Offline fixture reviewer', conceptId: '999999999999999999999999' };
const initial = { identity, sources: [null, null], highlight: null, wiki: null, complete: false };
const complete = { identity, sources: [{ _id: 'source1' }, { _id: 'source2' }], highlight: { _id: 'highlight' }, wiki: { _id: 'wiki' }, complete: true };
let session;
beforeEach(() => {
  jest.clearAllMocks(); verifySetupIdentity.mockImplementation(value => value);
  fixtureReceipt.mockReturnValue({ status: 'persisted_and_read_back', connectorAcceptance: 'not_run' });
  createSetupClient.mockReturnValue({ identity: async () => identity });
  session = { inspect: jest.fn(async () => initial), run: jest.fn(async () => complete) };
  createFixtureSession.mockReturnValue(session);
});
const open = () => {
  const result = render(<MemoryRouter><ReviewerFixtures /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Reviewer concept ID'), { target: { value: identity.conceptId } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify reviewer' }));
  return result;
};

test('private concept is entered explicitly and no request starts on mount', async () => {
  render(<MemoryRouter><ReviewerFixtures /></MemoryRouter>);
  expect(createSetupClient).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Reviewer concept ID')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Reviewer concept ID'), { target: { value: identity.conceptId } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify reviewer' }));
  await screen.findByRole('button', { name: 'Save fictional fixtures' });
  expect(createSetupClient).toHaveBeenCalledWith(expect.any(AbortSignal), { conceptId: identity.conceptId });
});

test('opening only verifies and reads; fixed content is visible and one click exposes truthful receipt', async () => {
  open(); const save = await screen.findByRole('button', { name: 'Save fictional fixtures' });
  await waitFor(() => expect(save).not.toBeDisabled());
  expect(session.run).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Source 1 exact text')).toHaveValue(plan.sources[0].text);
  expect(screen.getByLabelText('Exact reader thought')).toHaveValue(plan.highlight.note);
  fireEvent.click(save);
  expect((await screen.findByLabelText('Verified private setup receipt')).value).toContain('not_run');
  expect(save).toBeDisabled(); expect(session.run).toHaveBeenCalledTimes(1);
});

test('unverified account cannot see content or setup actions', async () => {
  verifySetupIdentity.mockImplementation(() => { throw new Error('identity rejected'); });
  open(); await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Save fictional fixtures' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Source 1 exact text')).not.toBeInTheDocument();
  expect(createFixtureSession).not.toHaveBeenCalled();
});

test('double-click guard and uncertain outcome require read-only check before another run', async () => {
  let reject; session.run.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  open(); const save = await screen.findByRole('button', { name: 'Save fictional fixtures' });
  await waitFor(() => expect(save).not.toBeDisabled());
  fireEvent.click(save); fireEvent.click(save); expect(session.run).toHaveBeenCalledTimes(1);
  reject(Object.assign(new Error('Uncertain write; check saved state.'), { reviewerSetup: true }));
  await screen.findByRole('alert'); expect(save).toBeDisabled();
  session.inspect.mockResolvedValue(complete); fireEvent.click(screen.getByRole('button', { name: 'Check saved state' }));
  await screen.findByLabelText('Verified private setup receipt'); expect(session.run).toHaveBeenCalledTimes(1);
});

test.each(['token', 'refreshToken', null])('session change (%s) aborts and removes fixture actions without resuming the previous account', async key => {
  open(); const save = await screen.findByRole('button', { name: 'Save fictional fixtures' });
  await waitFor(() => expect(save).not.toBeDisabled());
  fireEvent(window, new StorageEvent('storage', { key }));
  expect(await screen.findByRole('alert')).toHaveTextContent('session changed');
  expect(screen.queryByRole('button', { name: 'Save fictional fixtures' })).not.toBeInTheDocument();
  expect(session.run).not.toHaveBeenCalled();
});

test('Edition setup needs an explicit read, then one save exposes its own receipt without changing core setup', async () => {
  const editionState = { ...complete, edition: { profile: null, issue: null, complete: false } };
  const savedEdition = { ...complete, edition: { profile: plan.edition.profile, issue: { _id: 'edition' }, complete: true } };
  session.inspect.mockResolvedValue(complete);
  session.inspectEdition = jest.fn(async () => editionState); session.runEdition = jest.fn(async () => savedEdition);
  open(); const save = await screen.findByRole('button', { name: 'Save fictional Edition' });
  expect(save).toBeDisabled(); expect(session.runEdition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Check Edition setup' }));
  await waitFor(() => expect(save).not.toBeDisabled());
  fireEvent.click(save); await screen.findByLabelText('Verified private Edition receipt');
  expect(save).toBeDisabled(); expect(session.runEdition).toHaveBeenCalledTimes(1); expect(session.run).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Open the private fictional Edition' })).toHaveAttribute('href', '/editions/edition');
  expect(screen.getByLabelText('Verified private setup receipt')).toBeInTheDocument();
});

test('Edition uncertainty keeps read-only reconciliation available and prevents another save', async () => {
  session.inspect.mockResolvedValue(complete);
  session.inspectEdition = jest.fn(async () => ({ ...complete, edition: { profile: null, issue: null, complete: false } }));
  session.runEdition = jest.fn(async () => { throw Object.assign(new Error('Uncertain Edition; check saved state.'), { reviewerSetup: true }); });
  open(); const save = await screen.findByRole('button', { name: 'Save fictional Edition' });
  fireEvent.click(screen.getByRole('button', { name: 'Check Edition setup' }));
  await waitFor(() => expect(save).not.toBeDisabled()); fireEvent.click(save);
  await screen.findByRole('alert'); expect(save).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Check Edition setup' })).not.toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Check Edition setup' }));
  await waitFor(() => expect(session.inspectEdition).toHaveBeenCalledTimes(2));
  expect(session.runEdition).toHaveBeenCalledTimes(1);
});

test('a different verified account gets no Edition action, and a bound reviewer cannot save', async () => {
  createSetupClient.mockReturnValue({ identity: async () => ({ ...identity, userId: '222222222222222222222222' }) });
  session.inspect.mockResolvedValue({ ...initial, identity: { ...identity, userId: '222222222222222222222222' } });
  const foreign = open(); await screen.findByRole('button', { name: 'Save fictional fixtures' });
  expect(screen.queryByRole('button', { name: 'Save fictional Edition' })).not.toBeInTheDocument(); foreign.unmount();
  const boundIdentity = { ...identity, fixtureBindingComplete: true };
  createSetupClient.mockReturnValue({ identity: async () => boundIdentity });
  session.inspect.mockResolvedValue({ ...complete, identity: boundIdentity, edition: { profile: null, issue: null, complete: false } });
  open(); await screen.findByRole('button', { name: 'Save fictional Edition' });
  expect(screen.getByRole('button', { name: 'Save fictional fixtures' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save fictional Edition' })).toBeDisabled();
});
