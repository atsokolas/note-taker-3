const clean = value => String(value || '').trim();
const list = value => Array.isArray(value) ? value : [];
const id = value => String(value?._id || value?.id || value || '').trim();

const artifactInRevision = ({ revision, field, receiptId }) => (
  list(revision?.after?.judgment?.[field]).find(row => clean(row?.receiptId) === receiptId)
);

const auditJudgmentLedgerJourney = ({ page, revisions = [], receipts = [], mirror } = {}) => {
  const judgment = page?.judgment || {};
  const criteria = list(judgment.resolutionHistory).at(-1) || null;
  const verdict = list(judgment.verdicts).at(-1) || null;
  const revisionsById = new Map(list(revisions).map(row => [id(row), row]));
  const receiptsById = new Map(list(receipts).map(row => [clean(row?.receiptId || row?.id), row]));
  const criteriaRevision = revisionsById.get(id(criteria?.revisionId));
  const verdictRevision = revisionsById.get(id(verdict?.revisionId));
  const criteriaReceipt = receiptsById.get(clean(criteria?.receiptId));
  const verdictReceipt = receiptsById.get(clean(verdict?.receiptId));
  const mirrorVerdict = list(mirror?.verdicts).find(row => clean(row?.verdictId) === clean(verdict?.verdictId));
  const result = clean(verdict?.result);

  const checks = {
    exactBirthClock: Boolean(judgment.bornAt),
    criteriaRecorded: Boolean(clean(criteria?.criteria) && criteria?.setAt),
    criteriaRevisionRetained: Boolean(criteriaRevision && artifactInRevision({
      revision: criteriaRevision,
      field: 'resolutionHistory',
      receiptId: clean(criteria?.receiptId)
    })),
    criteriaReceiptRetained: Boolean(
      criteriaReceipt
      && clean(criteriaReceipt?.kind) === 'judgment_resolution_set'
      && id(criteriaReceipt?.provenance?.revisionId) === id(criteria?.revisionId)
      && clean(criteriaReceipt?.provenance?.claimHash) === clean(criteria?.claimHash)
    ),
    verdictRecorded: Boolean(
      clean(verdict?.verdictId)
      && ['held_up', 'broke', 'partly', 'unresolvable'].includes(result)
      && verdict?.recordedAt
      && clean(verdict?.recordHash)
    ),
    verdictEvidenceBound: list(verdict?.evidenceSourceRefIds).length > 0,
    verdictRevisionRetained: Boolean(verdictRevision && artifactInRevision({
      revision: verdictRevision,
      field: 'verdicts',
      receiptId: clean(verdict?.receiptId)
    })),
    verdictReceiptRetained: Boolean(
      verdictReceipt
      && clean(verdictReceipt?.kind) === 'judgment_verdict_recorded'
      && id(verdictReceipt?.provenance?.revisionId) === id(verdict?.revisionId)
      && clean(verdictReceipt?.provenance?.claimHash) === clean(verdict?.claimHash)
    ),
    mirrorIncludesVerdict: Boolean(
      mirrorVerdict
      && id(mirrorVerdict?.pageId) === id(page)
      && clean(mirrorVerdict?.result) === result
    ),
    mirrorCountsVerdict: Number(mirror?.metrics?.verdictRecord?.[result] || 0) > 0
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);

  return {
    passed: failures.length === 0,
    pageId: id(page),
    verdictId: clean(verdict?.verdictId),
    checks,
    failures
  };
};

module.exports = { auditJudgmentLedgerJourney };
