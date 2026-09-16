import {
  anchorForReadingNode,
  previewPassage,
  resolveReadingPlace
} from './articleReadingPlace';
import { canonicalArticleSnapshot } from '../../utils/articlePassageAnchor';
const rootFor = (html) => {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
};
const html =
  '<p>First passage with enough words.</p><p>Same sentence appears here.</p><p>A different surrounding thought.</p><p>Same sentence appears here.</p>';
test('exact anchor survives layout changes and distinguishes repeated passages', () => {
  const root = rootFor(html),
    node = root.lastElementChild;
  const anchor = anchorForReadingNode(root, node);
  const resized = rootFor(`<section style="width:320px">${html}</section>`);
  const result = resolveReadingPlace(resized, { anchor, ratio: 0.9 });
  expect(result.exact).toBe(true);
  expect(result.node).toBe(resized.querySelector('section').lastElementChild);
});
test('changed or ambiguous text returns approximately, without claiming exactness', () => {
  const root = rootFor(html);
  const changed = {
    text: 'A passage that is no longer here.',
    prefix: '',
    suffix: '',
    startOffsetApprox: 30
  };
  expect(resolveReadingPlace(root, { anchor: changed, ratio: 0.5 }).exact).toBe(
    false
  );
  const repeated = {
    text: 'Same sentence appears here.',
    prefix: '',
    suffix: '',
    startOffsetApprox: 5
  };
  expect(
    resolveReadingPlace(root, { anchor: repeated, ratio: 0.5 }).exact
  ).toBe(false);
  expect(resolveReadingPlace(root, { anchor: changed, ratio: 2 })).toBe(null);
});
test('source anchors exclude private controls and Peek resolves the exact matching passage', () => {
  const root = rootFor(html);
  const original = canonicalArticleSnapshot(root).fullText;
  root.firstElementChild.insertAdjacentHTML(
    'afterend',
    '<aside data-reader-control><p>A private thought must never enter source text.</p></aside>'
  );
  expect(canonicalArticleSnapshot(root).fullText).toBe(original);
  expect(previewPassage(root, { query: 'surrounding' }).text).toBe(
    'A different surrounding thought.'
  );
  expect(previewPassage(root, { query: 'private thought' })).toBe(null);
});
