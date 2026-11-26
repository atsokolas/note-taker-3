import api from '../api';
import { createKeptPage } from './wiki';

jest.mock('../api', () => ({ __esModule: true, default: { post: jest.fn() } }));

it('makes the page from what you kept, then hands it to Noeis to write around in pencil', async () => {
  api.post.mockImplementation(async path => ({ data: path.endsWith('/ai/draft/async') ? { status: 'maintaining' } : { _id: 'p1' } }));
  expect(await createKeptPage({ title: 'Pricing' })).toEqual({ _id: 'p1' });
  expect(api.post.mock.calls.map(([path]) => path)).toEqual([expect.stringMatching(/\/pages$/), expect.stringMatching(/\/pages\/p1\/ai\/draft\/async$/)]);
});
