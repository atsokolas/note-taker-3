const DAY = 24 * 60 * 60 * 1000;

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const list = value => Array.isArray(value) ? value : [];
const id = value => String(value?._id || value?.id || value || '').trim();
const time = value => {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(parsed) ? null : parsed;
};
const bornAtFor = page => page?.judgment?.bornAt || page?.judgment?.startedAt || page?.createdAt || null;

const buildJudgmentMirror = async ({ WikiPage, WikiRevision, userId, now = new Date() } = {}) => {
  const pagesQuery = WikiPage.find({
    userId,
    status: { $ne: 'archived' },
    'judgment.currentJudgment': { $type: 'string', $ne: '' }
  }).select('_id title createdAt judgment.currentJudgment judgment.status judgment.bornAt judgment.startedAt judgment.resolutionCriteria judgment.resolutionHorizonAt judgment.resolutionSetAt judgment.verdicts').sort({ 'judgment.bornAt': 1, createdAt: 1 });
  const pages = await (pagesQuery.lean ? pagesQuery.lean() : pagesQuery);
  const pageIds = list(pages).map(page => page._id).filter(Boolean);
  const revisionsQuery = pageIds.length && WikiRevision?.find
    ? WikiRevision.find({ userId, pageId: { $in: pageIds }, snapshotPrunedAt: null })
      .select('pageId before.judgment.currentJudgment after.judgment.currentJudgment createdAt')
    : null;
  const revisions = revisionsQuery ? await (revisionsQuery.lean ? revisionsQuery.lean() : revisionsQuery) : [];
  const revised = new Set();
  list(revisions).forEach(revision => {
    const before = clean(revision?.before?.judgment?.currentJudgment);
    const after = clean(revision?.after?.judgment?.currentJudgment);
    if (before && after && before !== after) revised.add(id(revision.pageId));
  });

  const nowMs = now.getTime();
  const active = list(pages).filter(page => !['parked', 'closed', 'archived'].includes(clean(page?.judgment?.status)));
  const ages = active.map(page => time(bornAtFor(page))).filter(value => value !== null).map(value => Math.max(0, nowMs - value));
  const verdicts = list(pages).flatMap(page => list(page?.judgment?.verdicts).map(verdict => ({
    ...verdict,
    pageId: id(page),
    claim: clean(page?.judgment?.currentJudgment),
    title: clean(page?.title)
  })));
  verdicts.sort((left, right) => (time(right.recordedAt) || 0) - (time(left.recordedAt) || 0));
  const verdictRecord = ['held_up', 'broke', 'partly', 'unresolvable'].reduce((record, result) => ({
    ...record,
    [result]: verdicts.filter(verdict => verdict.result === result).length
  }), {});
  const due = list(pages).filter(page => {
    const horizon = time(page?.judgment?.resolutionHorizonAt);
    const setAt = time(page?.judgment?.resolutionSetAt) || 0;
    const latestVerdict = Math.max(0, ...list(page?.judgment?.verdicts).map(verdict => time(verdict.recordedAt) || 0));
    return horizon !== null && horizon <= nowMs && latestVerdict < setAt;
  }).map(page => ({
    pageId: id(page), title: clean(page.title), claim: clean(page.judgment.currentJudgment),
    criteria: clean(page.judgment.resolutionCriteria), horizonAt: page.judgment.resolutionHorizonAt
  }));

  return {
    generatedAt: now.toISOString(),
    metrics: {
      claimsHeld: active.length,
      averageHoldDays: ages.length ? Math.round((ages.reduce((sum, value) => sum + value, 0) / ages.length) / DAY) : null,
      revisionRate: pages.length ? Number((revised.size / pages.length).toFixed(2)) : null,
      verdictRecord,
      counterevidenceResponseDays: null
    },
    coverage: {
      totalClaims: pages.length,
      storedBirthDates: pages.filter(page => time(page?.judgment?.bornAt) !== null).length,
      resolutionCriteria: pages.filter(page => clean(page?.judgment?.resolutionCriteria)).length,
      claimsWithVerdicts: pages.filter(page => list(page?.judgment?.verdicts).length).length,
      responseTimeClaims: 0
    },
    due,
    verdicts: verdicts.slice(0, 100)
  };
};

module.exports = { bornAtFor, buildJudgmentMirror };
