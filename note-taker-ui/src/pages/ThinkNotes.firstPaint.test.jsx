import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ThinkNotes from './ThinkNotes';
import { getNotebookShelf } from '../api/notebook';

jest.mock('../api/notebook', () => ({
  clearNotebookCache: jest.fn(),
  getNotebookShelf: jest.fn()
}));

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() }
}));

jest.mock('../components/think/notebook/NotebookEditor', () => () => <div>Editor</div>);
jest.mock('../components/agent/ThoughtPartnerPanel', () => () => <aside>Partner</aside>);
jest.mock('../surface/NoeisSurfaceContext', () => ({ useNoeisSurface: jest.fn() }));
jest.mock('../motion/columnMotion', () => ({ takeFirstPaint: () => false }));

describe('ThinkNotes first paint', () => {
  it('does not present an unresolved notebook count as zero', async () => {
    let resolveShelf;
    getNotebookShelf.mockReturnValue(new Promise(resolve => { resolveShelf = resolve; }));

    const { container } = render(
      <MemoryRouter initialEntries={['/think?tab=notebook']}>
        <ThinkNotes />
      </MemoryRouter>
    );

    expect(container.querySelector('.room-shelf__count')).toBeNull();
    expect(container.querySelector('.room-shelf__item-meta')).toBeNull();

    await act(async () => {
      resolveShelf([{ _id: 'note-1', title: 'A real note', updatedAt: '2026-08-29T12:00:00.000Z' }]);
    });

    await waitFor(() => expect(container.querySelector('.room-shelf__count')).toHaveTextContent('1'));
    expect(container.querySelector('.room-shelf__item-meta')).toHaveTextContent('1');
  });
});
