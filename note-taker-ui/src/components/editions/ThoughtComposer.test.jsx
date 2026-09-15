import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ThoughtComposer from './ThoughtComposer';
import { saveEditionThought } from '../../api/editions';
import { readEditionLocal, writeEditionLocal } from './editionReadingState';
import { articleParagraphs } from './SourcePeek';
jest.mock('../../api/editions', () => ({ saveEditionThought: jest.fn() }));
const tokenFor = id => `a.${btoa(JSON.stringify({ id }))}.b`;
beforeEach(() => { localStorage.clear(); localStorage.setItem('token', tokenFor('owner')); jest.clearAllMocks(); });
it('keeps selected context with a private thought and clears its recoverable draft only after success', async () => {
  const onSaved = jest.fn();
  saveEditionThought.mockResolvedValue({ itemId: 'i', content: 'Worth keeping', quote: 'Selected passage', revision: 1 });
  render(<ThoughtComposer editionId="e" itemId="i" quote="Selected passage" label="Your thought" thoughts={[]} onSaved={onSaved} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Worth keeping' } });
  expect(readEditionLocal('e', 'draft:i').content).toBe('Worth keeping');
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(saveEditionThought).toHaveBeenCalledWith('e', { itemId: 'i', content: 'Worth keeping', quote: 'Selected passage', revision: 0 });
  expect(readEditionLocal('e', 'draft:i')).toBeNull();
});
it('does not discard a draft on a conflicting or failed save', async () => {
  saveEditionThought.mockRejectedValue({ response: { status: 409 } });
  render(<ThoughtComposer editionId="e" itemId="i" label="Your thought" thoughts={[]} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save thought' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('changed elsewhere');
  expect(screen.getByRole('textbox')).toHaveValue('Keep this draft');
  expect(readEditionLocal('e', 'draft:i').content).toBe('Keep this draft');
});
it('isolates device drafts and resume positions across accounts', () => {
  writeEditionLocal('e', 'place', { itemId: 'private' });
  localStorage.setItem('token', tokenFor('other'));
  expect(readEditionLocal('e', 'place')).toBeNull();
  localStorage.setItem('token', tokenFor('owner'));
  expect(readEditionLocal('e', 'place').itemId).toBe('private');
});
it('renders source text safely, excluding executable or hidden payloads', () => {
  expect(articleParagraphs('<p>A real paragraph.</p><script>bad()</script><style>hide</style><iframe>secret</iframe><p><img src=x onerror=bad()>Next.</p>')).toEqual(['A real paragraph.', 'Next.']);
});
