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

// Earliest stable alignment. A later repeated word is not a match when an
// earlier one already explains the same proposal word.
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
    const matched = left[i - 1] === right[j - 1] && table[i][j] === table[i - 1][j - 1] + 1;
    if (matched && table[i - 1][j] !== table[i][j]) {
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
  const right = wordSpans(proposal);
  const pairs = lcsPairs(left.map((item) => item.word), right.map((item) => item.word));
  const rightOfLeft = new Map(pairs.map((pair) => [pair.left, pair.right]));
  const cuts = [];
  let run = null;
  const close = () => {
    if (!run || !text(run.text).trim()) {
      run = null;
      return;
    }
    let anchor = -1;
    for (let index = run.wordStart - 1; index >= 0; index -= 1) {
      if (rightOfLeft.has(index)) {
        anchor = rightOfLeft.get(index);
        break;
      }
    }
    cuts.push({
      ...run,
      id: `${run.start}:${run.end}`,
      phrase: run.text.trim(),
      insertAt: anchor < 0 ? 0 : right[anchor].end
    });
    run = null;
  };
  left.forEach((span, index) => {
    if (rightOfLeft.has(index)) {
      close();
      return;
    }
    if (!run) {
      run = { wordStart: index, start: span.start, end: span.end, text: source.slice(span.start, span.end) };
      return;
    }
    run.end = span.end;
    run.text = source.slice(run.start, run.end);
  });
  close();
  return cuts;
};

const placeCut = (proposal, cut, source) => {
  const insertAt = Math.max(0, Math.min(cut.insertAt, proposal.length));
  const phrase = source.slice(cut.start, cut.end);
  const gapBefore = insertAt > 0 && !/\s$/.test(proposal.slice(0, insertAt)) && !/^\s/.test(phrase) ? ' ' : '';
  const gapAfter = insertAt < proposal.length && !/^\s/.test(proposal.slice(insertAt)) && !/\s$/.test(phrase) ? ' ' : '';
  return `${proposal.slice(0, insertAt)}${gapBefore}${phrase}${gapAfter}${proposal.slice(insertAt)}`;
};

export const rescueReadTighterPhrase = (original, alternative, phrase) => {
  const source = text(original);
  const proposal = text(alternative);
  const requested = phrase && typeof phrase === 'object' ? phrase : null;
  const needle = text(requested ? requested.phrase || requested.text : phrase).trim();
  const cuts = readTighterCuts(source, proposal);
  const cut = (requested?.id && cuts.find((item) => item.id === requested.id))
    || cuts.find((item) => item.phrase === needle)
    || cuts.find((item) => item.text.includes(needle) || (needle && needle.includes(item.phrase)));
  if (!cut) return proposal;
  return placeCut(proposal, cut, source);
};

export const renderReadTighterOriginal = (original, alternative) => {
  const source = text(original);
  const cuts = readTighterCuts(source, alternative);
  if (!cuts.length) return [{ kind: 'text', text: source }];
  const parts = [];
  let cursor = 0;
  cuts.forEach((cut) => {
    if (cut.start > cursor) parts.push({ kind: 'text', text: source.slice(cursor, cut.start) });
    parts.push({ kind: 'cut', id: cut.id, text: source.slice(cut.start, cut.end), phrase: cut.phrase });
    cursor = cut.end;
  });
  if (cursor < source.length) parts.push({ kind: 'text', text: source.slice(cursor) });
  return parts;
};
