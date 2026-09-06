const crypto = require('crypto');

const clone = value => JSON.parse(JSON.stringify(value ?? null));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const id = value => String(value?._id || value?.id || value || '').trim();
const list = value => Array.isArray(value) ? value : [];

class WikiClaimBodyPatchError extends Error {
  constructor(message, code = 'claim_body_invalid') {
    super(message);
    this.name = 'WikiClaimBodyPatchError';
    this.code = code;
  }
}

const bodyHash = body => digest(body || null);

const extractPlainText = node => {
  if (!node) return '';
  if (typeof node === 'string') return clean(node);
  if (Array.isArray(node)) return clean(node.map(extractPlainText).filter(Boolean).join(' '));
  if (typeof node !== 'object') return '';
  return clean([
    typeof node.text === 'string' ? node.text : '',
    extractPlainText(node.content)
  ].filter(Boolean).join(' '));
};

const claimMark = (node, claimId) => list(node?.marks).find(mark => (
  mark?.type === 'claim' && String(mark?.attrs?.claimId || '').trim() === claimId
));

const findRanges = (node, claimId, path = []) => {
  if (!node || typeof node !== 'object') return [];
  const content = list(node.content);
  const ranges = [];
  let start = -1;
  const flush = (end) => {
    if (start < 0) return;
    ranges.push({ parentPath: path, start, end, nodes: content.slice(start, end + 1) });
    start = -1;
  };
  content.forEach((child, index) => {
    const marked = child?.type === 'text' && Boolean(claimMark(child, claimId));
    if (marked && start < 0) start = index;
    if (!marked) flush(index - 1);
  });
  flush(content.length - 1);
  content.forEach((child, index) => {
    ranges.push(...findRanges(child, claimId, [...path, 'content', index]));
  });
  return ranges;
};

const replaceAtPath = (doc, range) => {
  const next = clone(doc);
  let parent = next;
  range.parentPath.forEach(part => { parent = parent?.[part]; });
  if (!parent || !Array.isArray(parent.content)) {
    throw new WikiClaimBodyPatchError('Claim mark parent is unavailable.', 'claim_body_invalid');
  }
  parent.content.splice(
    range.start,
    range.end - range.start + 1,
    { type: '__noeis_claim_patch_target__' }
  );
  return next;
};

const rangeText = range => clean(range.nodes.map(node => node.text || '').join(''));
const unique = values => [...new Set(values)];
const normalizedIndexes = values => unique(list(values)
  .map(Number)
  .filter(value => Number.isInteger(value) && value > 0));

const ALLOWED_CLAIM_ATTRS = new Set([
  'claimId', 'support', 'citationIndexes', 'contradictionIndexes'
]);

const assertRangeShape = (range, claimId) => range.nodes.map(node => {
  const marks = list(node?.marks);
  const claimMarks = marks.filter(mark => mark?.type === 'claim');
  if (claimMarks.length !== 1 || String(claimMarks[0]?.attrs?.claimId || '').trim() !== claimId) {
    throw new WikiClaimBodyPatchError('Every target fragment must contain exactly one target claim mark.', 'claim_body_ambiguous');
  }
  const unexpectedAttrs = Object.keys(claimMarks[0]?.attrs || {})
    .filter(key => !ALLOWED_CLAIM_ATTRS.has(key));
  if (unexpectedAttrs.length) {
    throw new WikiClaimBodyPatchError('Claim mark contains unreviewed attributes.', 'claim_body_unbounded');
  }
  return {
    ...clone(node),
    text: '__noeis_claim_text__',
    marks: marks.map(mark => mark?.type === 'claim'
      ? { type: 'claim', attrs: { claimId: '__noeis_claim_id__' } }
      : clone(mark))
  };
});

const rangeAttrs = (range, claimId) => {
  const marks = range.nodes.map(node => claimMark(node, claimId));
  if (marks.some(mark => !mark)) {
    throw new WikiClaimBodyPatchError('Every target fragment must retain its exact claim mark.', 'claim_body_invalid');
  }
  const signatures = unique(marks.map(mark => JSON.stringify({
    support: mark?.attrs?.support || 'unsupported',
    citationIndexes: normalizedIndexes(mark?.attrs?.citationIndexes),
    contradictionIndexes: normalizedIndexes(mark?.attrs?.contradictionIndexes)
  })));
  if (signatures.length !== 1) {
    throw new WikiClaimBodyPatchError('Target claim fragments have inconsistent mark metadata.', 'claim_body_ambiguous');
  }
  return JSON.parse(signatures[0]);
};

const resolveIndexes = ({ indexes, sourceRefs, citations }) => indexes.map(index => {
  if (index > sourceRefs.length || index > citations.length) {
    throw new WikiClaimBodyPatchError('Claim mark contains an unresolved citation index.', 'unresolved_evidence');
  }
  const citation = citations[index - 1];
  const source = sourceRefs[index - 1];
  const citationId = id(citation);
  const sourceId = id(citation?.sourceRefId || source);
  if (!citationId || !sourceId || !sourceRefs.some(ref => id(ref) === sourceId)) {
    throw new WikiClaimBodyPatchError('Claim mark citation does not resolve to bounded evidence.', 'unresolved_evidence');
  }
  return { citationId, sourceId };
});

const sameSet = (left, right) => {
  const a = unique(list(left).map(id).filter(Boolean)).sort();
  const b = unique(list(right).map(id).filter(Boolean)).sort();
  return JSON.stringify(a) === JSON.stringify(b);
};

const validateMarkEvidence = ({ attrs, proposedClaim, sourceRefs, citations }) => {
  const support = proposedClaim?.support === 'contradicted' ? 'conflicted' : (proposedClaim?.support || 'unsupported');
  if (attrs.support !== support) {
    throw new WikiClaimBodyPatchError('Claim mark support disagrees with the proposed claim.', 'claim_body_mismatch');
  }
  const supporting = resolveIndexes({ indexes: attrs.citationIndexes, sourceRefs, citations });
  const contradicting = resolveIndexes({ indexes: attrs.contradictionIndexes, sourceRefs, citations });
  if (!sameSet(supporting.map(row => row.citationId), proposedClaim?.citationIds)
    || !sameSet(supporting.map(row => row.sourceId), proposedClaim?.sourceRefIds)
    || !sameSet(contradicting.map(row => row.citationId), proposedClaim?.contradictedByCitationIds)) {
    throw new WikiClaimBodyPatchError('Claim mark evidence disagrees with the proposed claim.', 'claim_body_mismatch');
  }
};

const buildClaimBodyPatch = ({
  beforeBody,
  afterBody,
  targetClaimId,
  beforeClaim,
  proposedClaim,
  afterSourceRefs = [],
  afterCitations = []
} = {}) => {
  const claimId = String(targetClaimId || '').trim();
  if (!claimId || beforeBody?.type !== 'doc' || afterBody?.type !== 'doc') {
    throw new WikiClaimBodyPatchError('Claim body patch requires two TipTap documents and a claim identity.', 'claim_body_invalid');
  }
  const beforeRanges = findRanges(beforeBody, claimId);
  const afterRanges = findRanges(afterBody, claimId);
  if (!beforeRanges.length || !afterRanges.length) {
    throw new WikiClaimBodyPatchError('The target claim is not marked in both documents.', 'claim_body_unmarked');
  }
  if (beforeRanges.length !== 1 || afterRanges.length !== 1) {
    throw new WikiClaimBodyPatchError('The target claim mark is ambiguous or disjoint.', 'claim_body_ambiguous');
  }
  const beforeRange = beforeRanges[0];
  const afterRange = afterRanges[0];
  if (JSON.stringify(beforeRange.parentPath) !== JSON.stringify(afterRange.parentPath)) {
    throw new WikiClaimBodyPatchError('The target claim moved to another body location.', 'claim_body_unbounded');
  }
  const beforeShape = assertRangeShape(beforeRange, claimId);
  const afterShape = assertRangeShape(afterRange, claimId);
  if (JSON.stringify(beforeShape) !== JSON.stringify(afterShape)) {
    throw new WikiClaimBodyPatchError('Candidate changes inline structure outside reviewed claim semantics.', 'claim_body_unbounded');
  }
  if (!clean(rangeText(beforeRange)) || !clean(rangeText(afterRange))) {
    throw new WikiClaimBodyPatchError('The target claim mark must contain visible text.', 'claim_body_invalid');
  }
  if (rangeText(beforeRange) !== clean(beforeClaim?.text)
    || rangeText(afterRange) !== clean(proposedClaim?.text)) {
    throw new WikiClaimBodyPatchError('Marked body text disagrees with the claim ledger.', 'claim_body_mismatch');
  }
  const beforeWithoutTarget = replaceAtPath(beforeBody, beforeRange);
  const afterWithoutTarget = replaceAtPath(afterBody, afterRange);
  if (JSON.stringify(beforeWithoutTarget) !== JSON.stringify(afterWithoutTarget)) {
    throw new WikiClaimBodyPatchError('Candidate changes prose or structure outside the target claim.', 'claim_body_unbounded');
  }
  const attrs = rangeAttrs(afterRange, claimId);
  validateMarkEvidence({
    attrs,
    proposedClaim,
    sourceRefs: list(afterSourceRefs),
    citations: list(afterCitations)
  });
  const beforePlainText = extractPlainText(beforeBody);
  const afterPlainText = extractPlainText(afterBody);
  return {
    body: clone(afterBody),
    plainText: afterPlainText,
    manifest: {
      version: 1,
      claimId,
      parentPath: clone(beforeRange.parentPath),
      beforeRangeHash: digest(beforeRange.nodes),
      afterRangeHash: digest(afterRange.nodes),
      baseBodyHash: bodyHash(beforeBody),
      afterBodyHash: bodyHash(afterBody),
      basePlainTextHash: digest(beforePlainText),
      afterPlainTextHash: digest(afterPlainText)
    }
  };
};

const inspectExactClaimAnchors = ({ body, claims = [], requireSingleTextNode = false } = {}) => {
  if (body?.type !== 'doc') {
    throw new WikiClaimBodyPatchError('Claim anchors require a TipTap document.', 'claim_body_invalid');
  }
  const activeClaims = list(claims).filter(claim => (
    String(claim?.claimId || '').trim()
    && claim?.checkInStatus !== 'retired'
    && !claim?.retiredAt
  ));
  if (!activeClaims.length) {
    throw new WikiClaimBodyPatchError('No active claim anchors are available.', 'claim_body_unmarked');
  }
  return activeClaims.map(claim => {
    const claimId = String(claim.claimId).trim();
    const ranges = findRanges(body, claimId);
    if (ranges.length !== 1 || (requireSingleTextNode && ranges[0].nodes.length !== 1)) {
      throw new WikiClaimBodyPatchError('Every active claim must have one exact body anchor.', 'claim_body_ambiguous');
    }
    assertRangeShape(ranges[0], claimId);
    if (rangeText(ranges[0]) !== clean(claim.text)) {
      throw new WikiClaimBodyPatchError('Claim anchor text disagrees with the ledger.', 'claim_body_mismatch');
    }
    return { claimId, parentPath: clone(ranges[0].parentPath), text: rangeText(ranges[0]) };
  });
};

const locateExactClaimNode = ({ body, claimId } = {}) => {
  const anchors = findRanges(body, String(claimId || '').trim());
  if (anchors.length !== 1 || anchors[0].nodes.length !== 1) {
    throw new WikiClaimBodyPatchError('Exact claim replacement requires one single-node claim anchor.', 'claim_body_ambiguous');
  }
  assertRangeShape(anchors[0], String(claimId || '').trim());
  return anchors[0];
};

const exactClaimText = ({ body, claimId } = {}) => rangeText(locateExactClaimNode({ body, claimId }));

const replaceExactClaimText = ({ body, claimId, replacementText } = {}) => {
  const anchor = locateExactClaimNode({ body, claimId });
  const next = clone(body);
  let parent = next;
  anchor.parentPath.forEach((part) => { parent = parent?.[part]; });
  const node = parent?.content?.[anchor.start];
  if (!node) throw new WikiClaimBodyPatchError('Claim anchor is unavailable.', 'claim_body_invalid');
  node.text = clean(replacementText);
  return next;
};

const replaceExactClaimRange = ({ body, claimId, replacementText, support, citationIndexes, contradictionIndexes } = {}) => {
  const next = replaceExactClaimText({ body, claimId, replacementText });
  const anchor = locateExactClaimNode({ body: next, claimId });
  let parent = next;
  anchor.parentPath.forEach((part) => { parent = parent?.[part]; });
  const node = parent?.content?.[anchor.start];
  const targetMark = node.marks.find((mark) => mark?.type === 'claim');
  targetMark.attrs = {
    claimId: String(claimId).trim(),
    support,
    citationIndexes: normalizedIndexes(citationIndexes),
    contradictionIndexes: normalizedIndexes(contradictionIndexes)
  };
  return next;
};

module.exports = {
  WikiClaimBodyPatchError,
  bodyHash,
  buildClaimBodyPatch,
  exactClaimText,
  extractPlainText,
  inspectExactClaimAnchors,
  replaceExactClaimRange,
  replaceExactClaimText
};
