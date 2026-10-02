const text = (value) => String(value || '');

/** Plain paragraph prose only — keeps, links, citations, and lists stay on manual wording. */
export const readTighterSupport = (piece) => {
  const nodes = piece?.nodes || [];
  if (nodes.length !== 1) {
    return { supported: false, reason: 'Read tighter works on one paragraph at a time. Try another wording for passages with a source block attached.' };
  }
  const head = nodes[0];
  if (head?.type !== 'paragraph') {
    return { supported: false, reason: 'Read tighter is for plain paragraphs. Lists and source blocks can use Try another wording.' };
  }
  const inline = Array.isArray(head.content) ? head.content : [];
  if (!inline.length) return { supported: true };
  if (inline.some((node) => node?.type !== 'text')) {
    return { supported: false, reason: 'This paragraph has links or embedded references. Try another wording so marks stay intact.' };
  }
  if (inline.some((node) => (node?.marks || []).length > 0)) {
    return { supported: false, reason: 'Styled or linked text cannot be trimmed safely here. Try another wording on the selection you need.' };
  }
  return { supported: true };
};

const wordSpans = (value) => {
  const spans = [];
  const re = /\S+/g;
  let match = re.exec(text(value));
  while (match) {
    spans.push({ word: match[0], start: match.index, end: match.index + match[0].length });
    match = re.exec(text(value));
  }
  return spans;
};

const lcsPairs = (left, right) => {
  const rows = left.length;
  const cols = right.length;
  const table = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(0));
  for (let i = 1; i <= rows; i += 1) {
    for (let j = 1; j <= cols; j += 1) {
      table[i][j] = left[i - 1] === right[j - 1]
        ? table[i - 1][j - 1] + 1
        : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }
  const pairs = [];
  let i = rows;
  let j = cols;
  while (i > 0 && j > 0) {
    if (left[i - 1] === right[j - 1]) {
      pairs.unshift({ left: i - 1, right: j - 1 });
      i -= 1;
      j -= 1;
    } else if (table[i - 1][j] >= table[i][j - 1]) i -= 1;
    else j -= 1;
  }
  return pairs;
};

/** Removed word runs in the original — descriptive only, never auto-applied. */
export const readTighterCuts = (original, alternative) => {
  const source = text(original);
  const proposal = text(alternative);
  if (!proposal.trim() || source === proposal) return [];
  const left = wordSpans(source);
  const rightWords = wordSpans(proposal).map((item) => item.word);
  const pairs = lcsPairs(left.map((item) => item.word), rightWords);
  const matchedLeft = new Set(pairs.map((item) => item.left));
  const cuts = [];
  let run = null;
  left.forEach((span, index) => {
    if (matchedLeft.has(index)) {
      if (run) {
        cuts.push(run);
        run = null;
      }
      return;
    }
    if (!run) run = { start: span.start, end: span.end, text: source.slice(span.start, span.end) };
    else {
      run.end = span.end;
      run.text = source.slice(run.start, run.end);
    }
  });
  if (run) cuts.push(run);
  return cuts.filter((item) => text(item.text).trim());
};

const charOffsetAfterWords = (value, wordCount) => {
  if (wordCount <= 0) return 0;
  let seen = 0;
  const re = /\S+/g;
  let match = re.exec(text(value));
  while (match) {
    seen += 1;
    if (seen === wordCount) return match.index + match[0].length;
    match = re.exec(text(value));
  }
  return text(value).length;
};

export const rescueReadTighterPhrase = (original, alternative, phrase) => {
  const source = text(original);
  const proposal = text(alternative);
  const needle = text(phrase).trim();
  if (!needle) return proposal;
  const cuts = readTighterCuts(source, proposal);
  const cut = cuts.find((item) => item.text.includes(needle) || needle.includes(item.text.trim()));
  if (!cut) return proposal;
  const leftWords = wordSpans(source.slice(0, cut.start)).length;
  const insertAt = charOffsetAfterWords(proposal, leftWords);
  const gapBefore = insertAt > 0 && !/\s$/.test(proposal.slice(0, insertAt)) ? ' ' : '';
  const gapAfter = insertAt < proposal.length && !/^\s/.test(proposal.slice(insertAt)) ? ' ' : '';
  return `${proposal.slice(0, insertAt)}${gapBefore}${source.slice(cut.start, cut.end)}${gapAfter}${proposal.slice(insertAt)}`;
};

export const renderReadTighterOriginal = (original, alternative) => {
  const source = text(original);
  const cuts = readTighterCuts(source, alternative);
  if (!cuts.length) return [{ kind: 'text', text: source }];
  const parts = [];
  let cursor = 0;
  cuts.forEach((cut) => {
    if (cut.start > cursor) parts.push({ kind: 'text', text: source.slice(cursor, cut.start) });
    parts.push({ kind: 'cut', text: source.slice(cut.start, cut.end), phrase: source.slice(cut.start, cut.end).trim() });
    cursor = cut.end;
  });
  if (cursor < source.length) parts.push({ kind: 'text', text: source.slice(cursor) });
  return parts;
};
