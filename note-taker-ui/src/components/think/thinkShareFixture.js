export const QUESTION_SHARE_PRIVACY = 'Anyone with the link can read the version you share. A later reading sits beside it once you place it, not inside it. Later private edits stay in the workshop. Library highlights stay private.';

export const CONCEPT_SHARE_PRIVACY = 'Anyone with the link can read the version you share. Later private edits stay in the workshop. Your Library stays private.';

export const THINK_SHARE_REVOKE = 'Copies already taken stay with their holders. This link will go unanswered.';

export const QUESTION_SHARE_COLOPHON = 'This is the version that was published. A later reading sits beside it. Later private edits do not change it.';

export const QUESTION_SHARE_OFFER = 'Only these words leave your side. Your Library stays private. They are not on the page until the author places them.';

export const QUESTION_SHARE_RECEIPT = 'It is with the author. It is not on the page yet.';

export const QUESTION_SHARE_TAKE = 'The reading stays. This sits beside it.';

export const QUESTION_SHARE_PLACE = 'It is not on the page yet.';

export const QUESTION_SHARE_TAKEN_BACK = 'They took this back.';

export const QUESTION_SHARE_TAKE_CHANGED = 'This take was already changed.';

export const QUESTION_SHARE_BRIEF = 'Consensus is optional. Empty stays off the page.';

export const QUESTION_SHARE_HAND = 'A successor opens at the last unresolved question. Alternatives, evidence then, and who decided travel. Empty outcome stays off the page.';

export const QUESTION_SHARE_MANDATE = 'An agent assignment names an owner, scope, tools, budget, stop, and review. The agent pauses when that authority lapses.';

export const QUESTION_SHARE_AGREEMENT = 'What holds';

export const QUESTION_SHARE_OWNER_REMAINDER = 'What you still hold';

export const QUESTION_SHARE_OBSERVATION = 'What could move this';

export const QUESTION_SHARE_UNRESOLVED = 'Still open';

export const QUESTION_SHARE_ALTERNATIVES = 'Alternatives then';

export const QUESTION_SHARE_EVIDENCE_THEN = 'Evidence then';

export const QUESTION_SHARE_UNCERTAINTY = 'What was uncertain';

export const QUESTION_SHARE_REVIEW = 'When to look again';

export const QUESTION_SHARE_OWNER = 'Accountable owner';

export const QUESTION_SHARE_SCOPE = 'Scope';

export const QUESTION_SHARE_TOOLS = 'Tools';

export const QUESTION_SHARE_BUDGET = 'Budget';

export const QUESTION_SHARE_STOP = 'Stop when';

export const QUESTION_SHARE_REVIEW_ROUTE = 'Review route';

export const QUESTION_SHARE_END_MANDATE = 'End this assignment';

export const QUESTION_SHARE_NAME_MANDATE = 'Name this assignment';

export const AGENT_MANDATE_TOOLS = 'Ask about this published question (the public page only).';

export const QUESTION_SHARE_OUTCOME = 'What happened later';

export const QUESTION_SHARE_YOURS = 'With the author';

export const QUESTION_SHARE_WITHDRAW = 'Take this back';

export const questionPresenceLine = (here) => {
  const names = (Array.isArray(here) ? here : [])
    .map((row) => String(row?.by || row || '').trim())
    .filter(Boolean);
  if (!names.length) return '';
  if (names.length === 1) return `${names[0]} is here.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are here.`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]} are here.`;
};

export const CONCEPT_SHARE_COLOPHON = 'This is the version that was published. Later private edits do not change it.';

export const QUESTION_NOT_PUBLISHED = 'This question is not published.';

export const CONCEPT_NOT_PUBLISHED = 'This concept is not published.';

export const questionSnapshot = (over = {}) => ({
  ownerDisplayName: 'Athan',
  publishedAt: '2026-09-13T12:00:00.000Z',
  question: {
    text: 'What survives compounding?',
    status: 'open',
    conceptName: 'Compounding',
    paragraphs: [{ id: 'p1', type: 'paragraph', text: 'Time plus reinvestment beats picking once.' }]
  },
  ...over
});

export const questionContribution = (over = {}) => ({
  id: 'c1',
  by: 'Mara',
  text: 'Same fact, different time horizon.',
  remainder: 'Who pays when the window closes?',
  createdAt: '2026-09-13T16:00:00.000Z',
  ...over
});

export const questionBrief = (over = {}) => ({
  agreement: 'The fact is shared. The horizon is not.',
  remainder: 'The window may close before compounding pays.',
  observation: 'Watch who is still in the room when the cost arrives.',
  by: 'Athan',
  ...over
});

export const questionSuccession = (over = {}) => ({
  unresolved: 'The window may close before compounding pays.',
  alternatives: [questionContribution()],
  evidenceThen: {
    text: 'What survives compounding?',
    paragraphs: [{ id: 'p1', type: 'paragraph', text: 'Time plus reinvestment beats picking once.' }],
    publishedAt: '2026-09-13T12:00:00.000Z'
  },
  uncertainty: 'The window may close before compounding pays.',
  authority: 'Athan',
  review: 'Watch who is still in the room when the cost arrives.',
  held: 'The fact is shared. The horizon is not.',
  handedAt: '2026-09-13T18:00:00.000Z',
  ...over
});

export const questionMandate = (over = {}) => ({
  owner: 'Athan',
  scope: 'This published question.',
  tools: AGENT_MANDATE_TOOLS,
  budget: { asks: 3, remaining: 3, spent: 0 },
  stop: 'Stop when the successor writes what happened later.',
  review: 'Return to this door to end or renew the assignment.',
  status: 'live',
  openedAt: '2026-09-14T00:20:00.000Z',
  ...over
});

export const mandateBudgetLine = (mandate) => {
  const remaining = Number(mandate?.budget?.remaining);
  if (!Number.isFinite(remaining) || remaining < 0) return '';
  if (remaining === 1) return 'One ask remains on this assignment.';
  return `${remaining} asks remain on this assignment.`;
};

export const conceptSnapshot = (over = {}) => ({
  ownerDisplayName: 'Athan',
  publishedAt: '2026-09-13T12:00:00.000Z',
  concept: {
    name: 'Opportunity Cost',
    framing: 'What does this explain?',
    description: 'Tradeoffs over hidden alternatives.',
    hypothesisHtml: '<p>Tradeoffs compound.</p>',
    supports: [{
      id: 's1',
      title: 'Public argument',
      content: 'Choosing one path excludes another.',
      whyItMatters: 'It makes hidden alternatives visible.'
    }],
    contradictions: [{
      id: 'c1',
      title: 'Disruption',
      content: 'Some windows close before the cost is visible.'
    }],
    questions: [{
      id: 'q1',
      title: 'What survives 100 years?'
    }]
  },
  ...over
});
