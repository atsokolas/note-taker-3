const crypto = require('crypto');
const {
  sanitizeReceiptForStorage,
  serializeStoredReceipt
} = require('./noeisReceiptService');

/* `narrow` is not a softer `accept`. Accepting replaces a belief; narrowing
   keeps it and bounds it. The write is the same sentence either way — what
   differs is the record, and the record is the point: a year from now the
   difference between "I changed my mind" and "I kept this but scoped it" is
   the whole of what the casebook knows. */
const ACTIONS = new Set(['accept', 'narrow', 'preserve', 'reject', 'defer']);
const TERMINAL = new Set(['accepted', 'narrowed', 'preserved', 'rejected']);

const clean = (value = '', limit = 8000) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const id = value => clean(value?._id || value?.id || value, 100);
const plain = value => (value?.toObject ? value.toObject() : value);

class JudgmentChangeProposalError extends Error {
  constructor(message, statusCode = 409, code = 'JUDGMENT_CHANGE_PROPOSAL_INVALID') {
    super(message);
    this.name = 'JudgmentChangeProposalError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const proposalKey = ({ pageId, before, after }) => crypto
  .createHash('sha256')
  .update(JSON.stringify([clean(pageId, 100), clean(before), clean(after)]))
  .digest('hex')
  .slice(0, 24);

/* A passage that may bear on a held sentence rides the same proposal: the
   sentence is `before`, the verbatim passage is `after`, and `change:
   'evidence'` says the reader is asked to file it, not to adopt it. One per
   view per source, so its identity is the page and the article. */
const readingKey = ({ pageId, articleId }) => proposalKey({ pageId, before: 'evidence', after: clean(articleId, 100) });
const readingReceiptId = ({ pageId, articleId }) => `judgment-change-proposal:${clean(pageId, 100)}:${readingKey({ pageId, articleId })}`;

const buildReadingProposal = ({ page, article, stance, quote, eventId = '', now = new Date() } = {}) => {
  const pageId = id(page);
  const before = clean(page?.judgment?.currentJudgment);
  const after = clean(quote, 1200);
  const articleId = id(article);
  if (!pageId || !before || !after || !articleId || !['support', 'challenge'].includes(stance)) {
    throw new JudgmentChangeProposalError('A reading proposal needs a held sentence, a source, and a verdict.', 400);
  }
  const proposalId = readingKey({ pageId, articleId });
  const sourceLabel = clean(article?.title, 500) || 'A source you saved';
  return {
    id: readingReceiptId({ pageId, articleId }),
    kind: 'judgment_change_proposal',
    source: 'judgment',
    sourceLabel,
    status: 'pending',
    title: stance === 'support' ? 'A passage that argues for what you hold' : 'A passage that argues against what you hold',
    summary: after,
    provenance: {
      pageId,
      proposalId,
      before,
      after,
      change: 'evidence',
      stance,
      articleId,
      author: clean(article?.author, 200),
      publishedAt: article?.publicationDate || article?.createdAt || null,
      eventId: clean(eventId, 100),
      proposedAt: now
    },
    touched: [{ type: 'wiki_page', id: pageId, title: clean(page?.title, 240) }],
    nextAction: { type: 'open_judgment', id: pageId, title: 'File the passage or set it aside' },
    createdAt: now
  };
};

const isReading = proposal => clean(proposal?.provenance?.change, 24) === 'evidence';

const buildJudgmentChangeProposal = ({ page, proposedJudgment, now = new Date() } = {}) => {
  const pageId = id(page);
  const before = clean(page?.judgment?.currentJudgment);
  const after = clean(proposedJudgment);
  if (!pageId || !before) {
    throw new JudgmentChangeProposalError('This page does not hold a judgment to revise.', 409);
  }
  if (!after) {
    throw new JudgmentChangeProposalError('A proposed judgment must be a sentence.', 400);
  }
  if (after === before) {
    throw new JudgmentChangeProposalError('The proposed judgment is unchanged.', 409);
  }
  const proposalId = proposalKey({ pageId, before, after });
  return {
    id: `judgment-change-proposal:${pageId}:${proposalId}`,
    kind: 'judgment_change_proposal',
    source: 'judgment',
    sourceLabel: 'Your held sentence',
    status: 'pending',
    title: 'Review a change to what you hold',
    summary: after,
    provenance: {
      pageId,
      proposalId,
      before,
      after,
      proposedAt: now
    },
    touched: [{ type: 'wiki_page', id: pageId, title: clean(page?.title, 240) }],
    nextAction: { type: 'open_judgment', id: pageId, title: 'Review the proposed change' },
    createdAt: now
  };
};

const assertBinding = ({ receipt, page }) => {
  const stored = serializeStoredReceipt(receipt);
  const pageId = id(page);
  if (!stored || stored.kind !== 'judgment_change_proposal') {
    throw new JudgmentChangeProposalError('The judgment change proposal was not found.', 404);
  }
  if (id(stored.provenance?.pageId) !== pageId) {
    throw new JudgmentChangeProposalError('The proposal does not belong to this judgment.', 409);
  }
  const before = clean(stored.provenance?.before);
  const after = clean(stored.provenance?.after);
  const expectedId = isReading(stored)
    ? readingKey({ pageId, articleId: stored.provenance?.articleId })
    : proposalKey({ pageId, before, after });
  if (!before || !after || clean(stored.provenance?.proposalId, 100) !== expectedId) {
    throw new JudgmentChangeProposalError('The proposal identity is incomplete or corrupt.', 409);
  }
  return stored;
};

const planJudgmentChangeDisposition = ({ receipt, page, action, now = new Date(), deferUntil = null } = {}) => {
  const selected = clean(action, 24).toLowerCase();
  if (!ACTIONS.has(selected)) {
    throw new JudgmentChangeProposalError('Choose accept, narrow, preserve, reject, or defer.', 400);
  }
  const stored = assertBinding({ receipt, page });
  const priorAction = clean(stored.provenance?.disposition, 24);
  if (TERMINAL.has(stored.status) || stored.status === 'deferred') {
    if (priorAction === selected) return { receipt: stored, replay: true, judgment: null };
    throw new JudgmentChangeProposalError('This proposal was already resolved differently.', 409);
  }
  if (stored.status !== 'pending') {
    throw new JudgmentChangeProposalError('This proposal is not awaiting review.', 409);
  }
  const current = clean(page?.judgment?.currentJudgment);
  const before = clean(stored.provenance.before);
  if (current !== before && !isReading(stored)) {
    throw new JudgmentChangeProposalError(
      'What you hold has changed since this proposal was made. Review the newer sentence instead.',
      409,
      'JUDGMENT_CHANGE_PROPOSAL_STALE'
    );
  }

  /* A passage is filed through the evidence route; here it can only be
     dismissed, and the dismissal is a line in the record. */
  if (isReading(stored) && selected !== 'reject') {
    throw new JudgmentChangeProposalError('File this passage for or against, or mark it not relevant.', 400);
  }

  const status = {
    accept: 'accepted',
    narrow: 'narrowed',
    preserve: 'preserved',
    reject: 'rejected',
    defer: 'deferred'
  }[selected];
  const deferredUntil = selected === 'defer'
    ? (deferUntil ? new Date(deferUntil) : new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)))
    : null;
  if (deferredUntil && Number.isNaN(deferredUntil.getTime())) {
    throw new JudgmentChangeProposalError('The defer-until date is invalid.', 400);
  }
  const after = clean(stored.provenance.after);
  const nextReceipt = {
    ...stored,
    status,
    summary: {
      accept: `Accepted: ${after}`,
      narrow: `Narrowed: ${after}`,
      preserve: `Preserved: ${before}`,
      reject: `Rejected: ${after}`,
      defer: `Deferred: ${after}`
    }[selected],
    provenance: {
      ...stored.provenance,
      disposition: selected,
      resolvedAt: now,
      ...(deferredUntil ? { deferredUntil } : {})
    },
    completedAt: now
  };

  const writes = selected === 'accept' || selected === 'narrow';
  const judgment = isReading(stored)
    ? {
      ...plain(page.judgment),
      decisions: [
        ...(Array.isArray(page?.judgment?.decisions) ? page.judgment.decisions.map(plain) : []),
        {
          decisionId: `reading-${clean(stored.provenance.proposalId, 100)}`,
          summary: `Not relevant: a passage from ${clean(stored.sourceLabel, 500) || 'a source you saved'}.`,
          decidedAt: now,
          status: 'taken',
          createdBy: 'user'
        }
      ]
    }
    : writes
    ? {
      ...plain(page.judgment),
      currentJudgment: after,
      decisions: [
        ...(Array.isArray(page?.judgment?.decisions) ? page.judgment.decisions.map(plain) : []),
        {
          decisionId: `judgment-change-${clean(stored.provenance.proposalId, 100)}`,
          summary: selected === 'narrow'
            ? `Narrowed what I hold: ${after}`
            : `Changed what I hold: ${after}`,
          decidedAt: now,
          status: 'taken',
          createdBy: 'user'
        }
      ]
    }
    : null;

  return {
    receipt: sanitizeReceiptForStorage(nextReceipt),
    replay: false,
    judgment
  };
};

module.exports = {
  JudgmentChangeProposalError,
  assertBinding,
  buildJudgmentChangeProposal,
  buildReadingProposal,
  isReading,
  readingReceiptId,
  planJudgmentChangeDisposition,
  proposalKey
};
