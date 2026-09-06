const { isResearchEditionPage } = require('./wikiProtectedArtifactService');
const {
  WikiClaimBodyPatchError,
  exactClaimText,
  extractPlainText,
  replaceExactClaimText
} = require('./wikiClaimBodyPatchService');

class OpenSentenceAcceptError extends Error {
  constructor(message, status = 409, code = 'stale_claim') {
    super(message);
    this.name = 'OpenSentenceAcceptError';
    this.status = status;
    this.code = code;
  }
}

const CLAIM_TEXT_LIMIT = 2000;
const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const retired = (claim) => claim?.checkInStatus === 'retired' || Boolean(claim?.retiredAt);

const asBodyError = (error) => {
  if (error instanceof WikiClaimBodyPatchError) {
    throw new OpenSentenceAcceptError(
      'The sentence is no longer a single marked line. This proposal was not applied.',
      409,
      error.code || 'claim_body_ambiguous'
    );
  }
  throw error;
};

const wikiAllowsOpenSentence = (page) => {
  if (!page) return false;
  const createdFrom = String(page?.createdFrom?.label || '').trim().toLowerCase();
  const repoWatch = page?.externalWatches?.githubRepo || {};
  if (
    String(page?.pageType || '').toLowerCase() === 'repo'
    || String(page?.repoKey || '').trim()
    || String(repoWatch.owner || '').trim()
    || String(repoWatch.repo || '').trim()
    || String(repoWatch.url || '').trim()
  ) return false;
  if (page?.investmentDossier?.version) return false;
  if (isResearchEditionPage(page)) return false;
  if (/^company-dossier:/.test(createdFrom)) return false;
  const edgar = page?.externalWatches?.edgar || {};
  if (String(edgar.ticker || '').trim() && String(edgar.status || '').toLowerCase() === 'active') {
    return false;
  }
  if (page?.judgment?.kind) return false;
  return true;
};

const planOpenedSentenceAccept = ({ page, claimId, against, text } = {}) => {
  if (!wikiAllowsOpenSentence(page)) {
    throw new OpenSentenceAcceptError(
      'This page does not accept a wording from an opened sentence.',
      409,
      'not_ordinary'
    );
  }
  const id = String(claimId || '').trim();
  const expected = normalize(against);
  const nextText = normalize(text);
  if (!id || !expected || !nextText || nextText === expected) {
    throw new OpenSentenceAcceptError('There is no live proposal to accept.', 400, 'no_proposal');
  }
  if (nextText.length > CLAIM_TEXT_LIMIT) {
    throw new OpenSentenceAcceptError(
      'That wording is too long to accept as a sentence.',
      400,
      'too_long'
    );
  }
  const claims = Array.isArray(page.claims) ? page.claims : [];
  const claim = claims.find((item) => String(item?.claimId || '').trim() === id);
  if (!claim || retired(claim)) {
    throw new OpenSentenceAcceptError('That claim is no longer on the page.', 409, 'vanished_claim');
  }
  let liveLine;
  try {
    liveLine = exactClaimText({ body: page.body, claimId: id });
  } catch (error) {
    asBodyError(error);
  }
  if (liveLine !== expected) {
    throw new OpenSentenceAcceptError(
      'The article moved on. This proposal was not applied.',
      409,
      'stale_claim'
    );
  }
  let body;
  try {
    body = replaceExactClaimText({
      body: page.body,
      claimId: id,
      replacementText: nextText
    });
  } catch (error) {
    asBodyError(error);
  }
  return {
    claimId: id,
    against: expected,
    text: nextText,
    body,
    plainText: extractPlainText(body)
  };
};

const applyOpenedSentenceAccept = ({ page, plan, now = new Date() } = {}) => {
  const claim = (Array.isArray(page.claims) ? page.claims : [])
    .find((item) => String(item?.claimId || '').trim() === plan.claimId);
  if (!claim) {
    throw new OpenSentenceAcceptError('That claim is no longer on the page.', 409, 'vanished_claim');
  }
  page.body = plan.body;
  page.plainText = plan.plainText;
  claim.text = plan.text;
  claim.checkInStatus = 'revised';
  claim.lastCheckedAt = now;
  claim.history = Array.isArray(claim.history) ? claim.history : [];
  claim.history.push({
    at: now,
    event: 'revised',
    action: 'revised',
    support: claim.support || 'unsupported',
    text: plan.text,
    reason: 'Owner accepted a proposed wording from an opened sentence.',
    actorType: 'user',
    disposition: 'accepted'
  });
  page.markModified?.('body');
  page.markModified?.('plainText');
  page.markModified?.('claims');
  return page;
};

module.exports = {
  OpenSentenceAcceptError,
  wikiAllowsOpenSentence,
  planOpenedSentenceAccept,
  applyOpenedSentenceAccept
};
