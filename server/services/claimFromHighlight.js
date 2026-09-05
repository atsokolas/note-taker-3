const crypto = require('crypto');
const { wordBoundaryTrim } = require('../lib/editorialText');
const { syncClaimFalsifier } = require('./claimFalsifiability');

/**
 * A belief, born from a sentence you marked.
 *
 * The ledger is what every column on the morning paper reads from — the
 * anniversary, the calibration line, the falsifier watch. And there was no
 * door into it from the Library. A highlight could become a question, a
 * notebook entry, a concept, or a wiki section; it could not become a claim.
 * Claims were authored from scratch inside Judgment, which is the room a
 * reader visits least.
 *
 * So everything built on the ledger rewarded a corpus that had no way of
 * being built. This is the funnel: you mark a sentence, and one gesture later
 * it is a belief with a birthday.
 *
 * Two things are asked at birth, because both are almost impossible to add
 * later. The claim is the reader's own sentence, not the highlight — a
 * highlight is what someone else wrote, and a belief has to be said in your
 * own words or it is a quotation. And what would change your mind, which now
 * writes a real falsifier the watchers can see rather than a note in a field
 * nothing reads.
 */

const clean = (value = '', limit = 800) => wordBoundaryTrim(
  String(value == null ? '' : value).replace(/\s+/g, ' ').trim(),
  { maxLength: limit }
);

class ClaimFromHighlightError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ClaimFromHighlightError';
    this.statusCode = statusCode;
  }
}

/* A title is a claim you can find again in a list. The claim itself is the
   whole sentence; this is how it reads on a shelf. */
const TITLE_LENGTH = 120;

const titleFor = (claim = '') => wordBoundaryTrim(claim, { maxLength: TITLE_LENGTH });

/**
 * Build the page a new belief lives on.
 *
 * A judgment is a page here, so a claim from a highlight is a page too, with
 * the highlight already cited. The citation is the point: a belief that
 * arrives with its evidence attached is the thing this product is for, and
 * every other route into the ledger starts empty.
 */
const buildClaimPage = ({
  userId,
  claim,
  highlight = {},
  resolutionCriteria = '',
  horizon = null,
  slug,
  now = new Date()
} = {}) => {
  const sentence = clean(claim);
  if (!sentence) throw new ClaimFromHighlightError('A claim needs a sentence of your own.');

  const title = titleFor(sentence);
  const excerpt = clean(highlight.text, 1200);
  const sourceTitle = clean(highlight.articleTitle || highlight.title, 300);

  const claimId = `claim_${crypto.randomUUID()}`;
  const page = {
    userId,
    title,
    slug,
    pageType: 'question',
    status: 'draft',
    visibility: 'private',
    sourceScope: 'selected_sources',
    createdFrom: {
      type: 'highlight',
      objectId: highlight._id || highlight.id || null,
      objectIds: [highlight._id || highlight.id].filter(Boolean),
      text: excerpt,
      label: sourceTitle || title
    },
    judgment: {
      currentJudgment: sentence,
      status: 'framing',
      bornAt: now,
      falsifiers: []
    },
    claims: [{
      claimId,
      text: sentence,
      support: 'unsupported',
      checkInStatus: 'unreviewed',
      createdAt: now,
      /* Born today, and said so. Every column that counts a belief's age
         counts from here. */
      bornAt: now,
      history: [{ at: now, event: 'created', text: sentence, actorType: 'user' }],
      verdicts: [],
      resolutionCriteria: clean(resolutionCriteria),
      horizon: horizon ? new Date(horizon) : null
    }],
    /* The highlight, cited. `parentObjectId` carries the article so the
       citation can open the piece rather than the fragment. */
    sourceRefs: (highlight._id || highlight.id) ? [{
      type: 'highlight',
      objectId: highlight._id || highlight.id,
      parentObjectId: highlight.articleId || null,
      title: sourceTitle,
      snippet: excerpt,
      addedBy: 'user'
    }] : []
  };

  /* And the watch, if they answered. Same call the check-in prompt makes, so
     there is one way a criteria answer becomes something watched. */
  syncClaimFalsifier(page, page.claims[0], { now });
  return page;
};

module.exports = {
  ClaimFromHighlightError,
  TITLE_LENGTH,
  buildClaimPage,
  titleFor
};
