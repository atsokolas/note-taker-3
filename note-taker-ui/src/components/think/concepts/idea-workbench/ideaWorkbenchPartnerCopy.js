const clean = (value = '') => String(value || '').trim();

const normalizeSentence = (value = '', terminal = '.') => {
  const safe = clean(value).replace(/\.{3,}/g, '…').replace(/…+$/g, '');
  if (!safe) return '';
  if (/[.!?]$/.test(safe)) return safe;
  return `${safe}${terminal}`;
};

const shortenLabel = (value = '', limit = 60) => {
  const safe = clean(value);
  if (!safe) return '';
  if (safe.length <= limit) return safe;
  const sliced = safe.slice(0, limit).trimEnd();
  const boundary = sliced.lastIndexOf(' ');
  return clean(boundary > 24 ? sliced.slice(0, boundary) : sliced);
};

const splitSentences = (value = '') => (
  clean(value)
    .replace(/\s+/g, ' ')
    .match(/[^.!?…]+(?:[.!?…]+|$)/g) || []
).map((part) => clean(part)).filter(Boolean);

const pickSentence = (value = '', fallback = '', maxLength = 180, terminal = '.') => {
  const sentences = splitSentences(value)
    .map(part => normalizeSentence(part, terminal))
    .filter(Boolean);
  const complete = sentences.find(part => /[.!?]$/.test(part));
  if (complete && complete.length <= maxLength) return complete;
  if (complete) return complete;

  const safe = clean(value);
  if (!safe) return normalizeSentence(fallback, terminal);
  if (safe.length <= maxLength) return normalizeSentence(safe, terminal);

  const sliced = safe.slice(0, maxLength).trimEnd();
  const boundary = sliced.lastIndexOf(' ');
  return normalizeSentence(boundary > 24 ? sliced.slice(0, boundary) : sliced, terminal);
};

const cardSentence = (card, fallback = '', maxLength = 180, terminal = '.') => (
  pickSentence(
    card?.content || card?.summary || card?.title || '',
    fallback,
    maxLength,
    terminal
  )
);

const cardLabel = (card, fallback = 'the clearest lead') => {
  const label = shortenLabel(card?.title || card?.source || card?.type || '', 56);
  return label ? `"${label}"` : fallback;
};

const summarizeCount = (count, noun) => (
  count === 1 ? `1 ${noun}` : `${count} ${noun}s`
);

const sentenceForKind = (kind, cards = []) => {
  const leadCard = cards[0] || null;
  if (kind === 'support') {
    return `The clearest footing is ${cardSentence(leadCard, 'the draft works better when the evidence stays visible.')}`;
  }
  if (kind === 'contradiction') {
    return `The sharpest pressure is ${cardSentence(leadCard, 'the draft still needs a strong contradiction that tests its main claim.')}`;
  }
  if (kind === 'question') {
    return `The sharpest open question is ${cardSentence(leadCard, 'what evidence would actually weaken this concept?', 180, '?')}`;
  }
  if (kind === 'refresh') {
    return `The first place to look is ${cardSentence(leadCard, 'newer library material may have shifted the balance of the concept.')}`;
  }
  return `The first place to look is ${cardSentence(leadCard, 'nearby material may sharpen this concept if it stays tightly scoped.')}`;
};

export const buildWorkbenchDraftMessage = ({
  kind = 'support',
  cards = [],
  provenance = 'your archive',
  unavailableReason = ''
} = {}) => {
  const safeCards = Array.isArray(cards) ? cards.filter(Boolean) : [];
  if (!safeCards.length) return '';

  const count = safeCards.length;
  const opening = {
    support: `I prepared ${summarizeCount(count, 'support point')} from ${provenance}.`,
    contradiction: `I prepared ${summarizeCount(count, 'tension point')} from ${provenance}.`,
    related: `I prepared ${summarizeCount(count, 'nearby source')} from ${provenance}.`,
    question: `I prepared ${summarizeCount(count, 'open question')} from ${provenance}.`,
    refresh: `I prepared ${summarizeCount(count, 'newer source')} from ${provenance}.`
  }[kind] || `I prepared ${summarizeCount(count, 'lead')} from ${provenance}.`;

  const closing = {
    support: 'Review the draft before anything lands in the concept.',
    contradiction: 'Keep the draft separate until you decide how the concept should answer it.',
    related: 'Bring these in only if they sharpen the concept instead of widening it.',
    question: 'Keep them beside the concept until one earns the next pass.',
    refresh: 'Review the new material before it changes the concept.'
  }[kind] || 'Review the draft before you apply it.';

  return [
    normalizeSentence(unavailableReason),
    opening,
    sentenceForKind(kind, safeCards),
    closing
  ].filter(Boolean).join(' ');
};

export const buildWorkbenchRestructureReply = (cards = []) => {
  const safeCards = Array.isArray(cards) ? cards.filter(Boolean) : [];
  if (!safeCards.length) return '';

  if (safeCards.length === 1) {
    return `Done. I moved ${cardLabel(safeCards[0])} into support so the draft has firmer footing.`;
  }

  if (safeCards.length === 2) {
    return `Done. I moved ${cardLabel(safeCards[0])} into support and held ${cardLabel(safeCards[1], 'the next lead')} aside as tension.`;
  }

  return `Done. I sorted the latest leads: ${cardLabel(safeCards[0])} into support, ${cardLabel(safeCards[1], 'the second lead')} into tension, and ${cardLabel(safeCards[2], 'the third lead')} into open questions.`;
};

export const buildWorkbenchChatReply = ({
  intent = 'next-step',
  card = null
} = {}) => {
  if (intent === 'support') {
    return `The strongest current support is this: ${cardSentence(card, 'making the evidence visible helps the draft become more testable.')}`;
  }
  if (intent === 'contradiction') {
    return `The biggest weak point is this: ${cardSentence(card, 'the draft still has not shown when structure helps and when it starts to constrain discovery.')}`;
  }
  return 'The next useful move is to pull one more concrete piece of material into the workspace, then classify it before rewriting the hypothesis.';
};

export default buildWorkbenchDraftMessage;
