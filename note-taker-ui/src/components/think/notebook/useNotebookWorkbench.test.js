import { act, renderHook } from '@testing-library/react';
import useNotebookWorkbench from './useNotebookWorkbench';
import { updateNotebookWorkbench } from '../../../api/notebook';

jest.mock('../../../api/notebook', () => ({ updateNotebookWorkbench: jest.fn() }));

it('guards a reload until the actual workbench write succeeds', async () => {
  let finish;
  updateNotebookWorkbench.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { result, unmount } = renderHook(() => useNotebookWorkbench({ _id: 'note', workingState: {} }));
  act(() => result.current.update(current => ({ ...current, looseThoughts: [{ id: 'thought', text: 'Keep this.' }] })));
  expect(result.current.saveState).toBe('dirty');
  const leaving = new Event('beforeunload', { cancelable: true });
  act(() => window.dispatchEvent(leaving));
  expect(leaving.defaultPrevented).toBe(true);
  expect(updateNotebookWorkbench).toHaveBeenCalledWith('note', expect.objectContaining({ looseThoughts: [expect.objectContaining({ text: 'Keep this.' })] }), 0);
  await act(async () => finish({ ...result.current.state, revision: 1 }));
  expect(result.current.saveState).toBe('saved');
  const savedLeave = new Event('beforeunload', { cancelable: true });
  act(() => window.dispatchEvent(savedLeave));
  expect(savedLeave.defaultPrevented).toBe(false);
  unmount();
});
