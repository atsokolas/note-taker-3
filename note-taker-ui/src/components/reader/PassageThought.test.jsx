import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PassageThought from './PassageThought';
import { updateHighlight } from '../../api/highlights';
import { canonicalArticleSnapshot } from '../../utils/articlePassageAnchor';
jest.mock('../../api/highlights');
let root;
beforeEach(() => {
  root = document.createElement('div');
  root.innerHTML =
    '<p>A source with <mark data-highlight-id="highlight-h1">an exact passage</mark>.</p>';
  document.body.append(root);
});
afterEach(() => root.remove());
const props = () => ({
  articleId: 'a1',
  highlight: { _id: 'h1', text: 'an exact passage', note: 'A private thought' },
  contentRef: { current: root },
  contentHtml: root.innerHTML,
  onSaved: jest.fn(),
  onClose: jest.fn()
});
test('edits the existing highlight note without adding private text to its source anchor', async () => {
  const prior = canonicalArticleSnapshot(root).fullText,
    inputs = props();
  updateHighlight.mockResolvedValue({
    _id: 'h1',
    note: 'A changed private thought'
  });
  render(<PassageThought {...inputs} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Your thought' }), {
    target: { value: 'A changed private thought' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Keep thought' }));
  await waitFor(() => expect(inputs.onClose).toHaveBeenCalled());
  expect(updateHighlight).toHaveBeenCalledWith({
    articleId: 'a1',
    highlightId: 'h1',
    payload: { note: 'A changed private thought' }
  });
  expect(inputs.onSaved).toHaveBeenCalledWith(
    'h1',
    expect.objectContaining({ note: 'A changed private thought' })
  );
  expect(canonicalArticleSnapshot(root).fullText).toBe(prior);
});
test('a failed save retains the draft and supports retry', async () => {
  const inputs = props();
  updateHighlight
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ _id: 'h1' });
  render(<PassageThought {...inputs} />);
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Do not lose this thought' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Keep thought' }));
  await screen.findByRole('alert');
  expect(inputs.onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox')).toHaveValue('Do not lose this thought');
  fireEvent.click(screen.getByRole('button', { name: 'Keep thought' }));
  await waitFor(() => expect(inputs.onClose).toHaveBeenCalled());
});
test('does not move the page when the passage mark is not in the article yet', () => {
  const originalScroll = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = jest.fn();
  const empty = { current: document.createElement('div') };
  const { container } = render(
    <PassageThought
      articleId="a1"
      highlight={{ _id: 'missing', text: 'gone', note: '' }}
      contentRef={empty}
      contentHtml=""
      onSaved={jest.fn()}
      onClose={jest.fn()}
    />
  );
  expect(container.querySelector('.article-passage-thought')).toBeNull();
  expect(screen.queryByRole('textbox', { name: 'Your thought' })).not.toBeInTheDocument();
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  Element.prototype.scrollIntoView = originalScroll;
});
