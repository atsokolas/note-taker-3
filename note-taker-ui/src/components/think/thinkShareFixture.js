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

export const QUESTION_SHARE_TAKE_RECORDS = 'Take these records';

export const QUESTION_SHARE_BRING_RECORDS = 'Bring records in';

export const QUESTION_SHARE_RECORDS_HINT = 'This file is the successor record and the named assignment. Remaining asks, the live companion, and the private Library stay here.';

export const QUESTION_SHARE_RECORDS_FOOTER = 'This file is the successor record and the named assignment. It does not take the live companion, remaining asks on this door, who is here, the private Library, or unplaced readings.';

export const SHARE_RECORD_KIND = 'question-share-records';

export const SHARE_RECORD_VERSION = 1;

export const QUESTION_SHARE_BRIEF = 'Consensus is optional. Empty stays off the page.';

export const QUESTION_SHARE_HAND = 'A successor opens at the last unresolved question. Alternatives, evidence then, and who decided travel. Empty outcome stays off the page.';

export const QUESTION_SHARE_ARCHIVE = 'What happened sits beside what was considered then. The other future is not something this record can know.';

export const QUESTION_SHARE_MANDATE = 'An agent assignment names an owner, scope, tools, budget, stop, and review. The agent pauses when that authority lapses.';

export const QUESTION_SHARE_AGREEMENT = 'What holds';

export const QUESTION_SHARE_OWNER_REMAINDER = 'What you still hold';

export const QUESTION_SHARE_OBSERVATION = 'What could move this';

export const QUESTION_SHARE_UNRESOLVED = 'Still open';

export const QUESTION_SHARE_ALTERNATIVES = 'Alternatives then';

export const QUESTION_SHARE_NEARLY = 'What we nearly did';

export const QUESTION_SHARE_ARCHIVE_SILENCE = 'The other future is not in this record.';

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

const asRecordLine = (value) => String(value || '').trim();

export const questionShareSuccessionOf = (snapshot) => {
  const succession = snapshot?.succession && typeof snapshot.succession === 'object'
    ? snapshot.succession
    : null;
  if (!succession) return null;
  const unresolved = asRecordLine(succession.unresolved);
  const alternatives = (Array.isArray(succession.alternatives) ? succession.alternatives : [])
    .filter((item) => asRecordLine(item?.by) && asRecordLine(item?.text));
  const evidenceThen = succession.evidenceThen && typeof succession.evidenceThen === 'object'
    ? succession.evidenceThen
    : null;
  if (!unresolved || !alternatives.length || !asRecordLine(evidenceThen?.text)) return null;
  return {
    unresolved,
    alternatives,
    evidenceThen: {
      text: asRecordLine(evidenceThen.text),
      paragraphs: Array.isArray(evidenceThen.paragraphs)
        ? evidenceThen.paragraphs.filter((block) => asRecordLine(block?.text))
        : [],
      publishedAt: evidenceThen.publishedAt
    },
    uncertainty: asRecordLine(succession.uncertainty),
    authority: asRecordLine(succession.authority),
    review: asRecordLine(succession.review),
    held: asRecordLine(succession.held),
    outcome: asRecordLine(succession.outcome),
    handedAt: succession.handedAt
  };
};

export const questionShareArchiveOf = (succession) => {
  const happened = asRecordLine(succession?.outcome);
  const nearly = Array.isArray(succession?.alternatives)
    ? succession.alternatives.filter((item) => asRecordLine(item?.by) && asRecordLine(item?.text))
    : [];
  if (!happened || !nearly.length) return null;
  return { nearly, happened };
};

export const questionShareMandateOf = (snapshot) => {
  const mandate = snapshot?.mandate && typeof snapshot.mandate === 'object'
    ? snapshot.mandate
    : null;
  if (!mandate) return null;
  const owner = asRecordLine(mandate.owner);
  const scope = asRecordLine(mandate.scope);
  const tools = asRecordLine(mandate.tools);
  const stop = asRecordLine(mandate.stop);
  const review = asRecordLine(mandate.review);
  const asks = Number(mandate.budget?.asks);
  if (!owner || !scope || !tools || !stop || !review || !asks) return null;
  const remaining = Number(mandate.budget?.remaining);
  const spent = Number(mandate.budget?.spent) || 0;
  const paused = mandate.status === 'paused' || Boolean(asRecordLine(mandate.pause)) || remaining <= 0;
  return {
    owner,
    scope,
    tools,
    budget: {
      asks,
      remaining: Number.isFinite(remaining) ? remaining : asks - spent,
      spent
    },
    stop,
    review,
    status: paused ? 'paused' : 'live',
    pause: asRecordLine(mandate.pause),
    openedAt: mandate.openedAt
  };
};

export const questionShareRecordsOf = (snapshot) => {
  const succession = questionShareSuccessionOf(snapshot);
  const mandate = questionShareMandateOf(snapshot);
  if (!succession && !mandate) return null;
  return {
    ...(succession ? { succession } : {}),
    ...(mandate ? { mandate } : {})
  };
};

const shareRecordSlug = (value) => (
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'question-records'
);

export const buildQuestionShareRecords = (snapshot, { slug = '', now } = {}) => {
  const records = questionShareRecordsOf(snapshot);
  if (!records) return null;
  const key = asRecordLine(slug);
  return {
    kind: SHARE_RECORD_KIND,
    version: SHARE_RECORD_VERSION,
    exportedAt: now || new Date().toISOString(),
    door: {
      slug: key,
      ...(key ? { path: `/share/questions/${key}` } : {})
    },
    ...records
  };
};

const shareRecordDay = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const buildQuestionShareRecordsMarkdown = (bundle) => {
  if (!bundle) return '';
  const succession = bundle.succession;
  const mandate = bundle.mandate;
  const lines = [];
  if (succession?.unresolved) {
    lines.push(`# ${succession.unresolved}`, '');
    if (succession.authority) {
      const when = shareRecordDay(succession.handedAt);
      lines.push(when
        ? `${succession.authority} handed this on ${when}.`
        : `${succession.authority} handed this on.`);
      lines.push('');
    }
    if (succession.held) lines.push('## What holds', '', succession.held, '');
    const archived = questionShareArchiveOf(succession);
    lines.push(archived ? `## ${QUESTION_SHARE_NEARLY}` : `## ${QUESTION_SHARE_ALTERNATIVES}`, '');
    (Array.isArray(succession.alternatives) ? succession.alternatives : []).forEach((reading) => {
      if (!reading?.by || !reading?.text) return;
      lines.push(`### ${reading.by}`, '', reading.text);
      if (reading.remainder) lines.push('', `Still holds: ${reading.remainder}`);
      lines.push('');
    });
    if (archived) {
      lines.push(`## ${QUESTION_SHARE_OUTCOME}`, '', archived.happened, '', QUESTION_SHARE_ARCHIVE_SILENCE, '');
    }
    if (succession.evidenceThen?.text) {
      lines.push('## Evidence then', '', succession.evidenceThen.text, '');
    }
    if (succession.uncertainty && succession.uncertainty !== succession.unresolved) {
      lines.push('## What was uncertain', '', succession.uncertainty, '');
    }
    if (succession.review) lines.push('## When to look again', '', succession.review, '');
  } else {
    lines.push('# An agent assignment', '');
  }
  if (mandate?.owner) {
    lines.push('## An agent assignment', '');
    lines.push(`Accountable owner: ${mandate.owner}`);
    lines.push(`Scope: ${mandate.scope}`);
    lines.push(`Tools: ${mandate.tools}`);
    const asks = Number(mandate.budget?.asks) || 0;
    lines.push(`Budget: ${asks === 1 ? 'One ask' : `${asks} asks`}`);
    lines.push(`Stop when: ${mandate.stop}`);
    lines.push(`Review route: ${mandate.review}`);
    if (mandate.pause) lines.push('', mandate.pause);
    lines.push('');
  }
  lines.push('---', '', QUESTION_SHARE_RECORDS_FOOTER);
  if (bundle.door?.path) {
    lines.push('', `The public door was ${bundle.door.path}.`);
  }
  const fence = {
    kind: SHARE_RECORD_KIND,
    version: SHARE_RECORD_VERSION,
    ...(bundle.exportedAt ? { exportedAt: bundle.exportedAt } : {}),
    door: bundle.door || { slug: '' },
    ...(succession ? { succession } : {}),
    ...(mandate ? { mandate } : {})
  };
  lines.push('', '```json', JSON.stringify(fence, null, 2), '```', '');
  return lines.join('\n');
};

export const downloadQuestionShareRecords = (snapshot, slug) => {
  const bundle = buildQuestionShareRecords(snapshot, { slug });
  if (!bundle || typeof document === 'undefined') return false;
  const markdown = buildQuestionShareRecordsMarkdown(bundle);
  const filename = `${shareRecordSlug(bundle.succession?.unresolved || 'agent-assignment')}.md`;
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return true;
};

export const shareRecordReceipt = (records) => {
  if (!records) return '';
  const bits = [];
  if ((records.retained || []).includes('successor') || (records.restored || []).includes('succession')) {
    bits.push(records.sameDoor
      ? 'The successor record returned to this door.'
      : 'The successor record can sit here. The public address does not transfer.');
  }
  if ((records.retained || []).includes('mandate') || (records.restored || []).includes('mandate')) {
    bits.push('The named assignment returned. Remaining asks stay with this door.');
  }
  (Array.isArray(records.collisions) ? records.collisions : []).forEach((line) => {
    if (asRecordLine(line)) bits.push(line);
  });
  return bits.join(' ');
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
