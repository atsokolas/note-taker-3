import { workSessionFor, resumeWorkSession, releaseWorkSession, forgetWorkSession } from './workSessions';
import { draftKey } from './workSession';
jest.mock('../api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
const token = id => `x.${btoa(JSON.stringify({ id }))}.x`;
beforeEach(() => { forgetWorkSession('owner'); forgetWorkSession('other'); localStorage.clear(); localStorage.setItem('token', token('owner')); });
afterEach(() => { forgetWorkSession('owner'); forgetWorkSession('other'); });
test('route/auth remounts retain memory-only writing for its owner without exposing it to another account', () => {
  const original = workSessionFor(token('owner')), id = original.capture();
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  original.edit(id, { content: 'Only in the original page' }); set.mockRestore();
  expect(original.canLeave()).toBe(false); releaseWorkSession(original);
  localStorage.setItem('token', token('other')); const other = workSessionFor(token('other'));
  expect(other.entries()).toEqual([]); releaseWorkSession(other);
  const renewed = `x.${btoa(JSON.stringify({ id: 'owner', exp: 9999999999 }))}.renewed`;
  localStorage.setItem('token', renewed); const returned = workSessionFor(renewed); resumeWorkSession(returned, renewed);
  expect(returned).toBe(original); expect(returned.entry(id).content).toBe('Only in the original page');
  expect(localStorage.getItem(draftKey('owner'))).toBeNull();
});
