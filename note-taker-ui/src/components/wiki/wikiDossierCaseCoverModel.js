import { normalizeSpaces } from '../../utils/editorialText';

const dateLabel = (value, fallback = 'Not dated') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const researchState = (page = {}) => {
  const candidateStatus = normalizeSpaces(page?.aiState?.candidateStatus).toLowerCase();
  if (candidateStatus === 'awaiting_first_head_acceptance') {
    return {
      value: 'First head awaiting review',
      detail: 'The generated article has not replaced trusted research.',
      action: 'review'
    };
  }
  if (candidateStatus === 'awaiting_maintenance_acceptance') {
    return {
      value: 'Research update awaiting review',
      detail: 'The accepted page is unchanged until you approve the candidate.',
      action: 'review'
    };
  }
  if (page?.aiState?.errorCode === 'WIKI_DOSSIER_EVIDENCE_INCOMPLETE') {
    return {
      value: 'Evidence incomplete',
      detail: normalizeSpaces(page?.aiState?.lastError) || 'More source coverage is required before drafting.',
      action: 'maintain'
    };
  }
  if (page?.aiState?.draftStatus === 'error' || page?.aiState?.errorCode === 'WIKI_CANDIDATE_REJECTED') {
    return {
      value: 'Research needs attention',
      detail: normalizeSpaces(page?.aiState?.lastCandidateSummary || page?.aiState?.lastError) || 'The last research pass did not settle.',
      action: 'maintain'
    };
  }
  if (page?.investmentDossier?.firstHead?.status === 'accepted') {
    return {
      value: 'Accepted research head',
      detail: 'Fresh evidence becomes a reviewable candidate; it never rewrites this page silently.',
      action: 'maintain'
    };
  }
  if (page?.investmentDossier?.researchPlan?.status === 'decision_ready') {
    return {
      value: 'Research ready for judgment',
      detail: 'The required evidence and analysis modules are present.',
      action: 'maintain'
    };
  }
  return {
    value: 'Research in progress',
    detail: 'The dossier is maintained in Wiki until its evidence is ready for review.',
    action: 'maintain'
  };
};

const lastMaterialChange = (page = {}) => {
  const comparison = page?.investmentDossier?.lastMaintenanceComparison || {};
  if (comparison.version) {
    return {
      value: normalizeSpaces(comparison.headline) || 'Accepted research changed',
      detail: dateLabel(comparison.generatedAt, 'Accepted change; date unavailable')
    };
  }
  const acceptedAt = page?.freshness?.acceptedThrough?.acceptedAt
    || page?.freshness?.lastMaintainedAt
    || page?.investmentDossier?.firstHead?.acceptedAt;
  return {
    value: acceptedAt ? 'No decision-relevant rewrite recorded' : 'No accepted change yet',
    detail: acceptedAt ? `Last accepted review ${dateLabel(acceptedAt)}` : 'The first trusted research head has not been recorded.'
  };
};

const expectedFiling = (page = {}) => {
  const watch = page?.externalWatches?.edgar || {};
  const status = normalizeSpaces(watch.status).toLowerCase();
  if (status === 'error') {
    return {
      value: 'SEC watch needs attention',
      detail: normalizeSpaces(watch.lastError) || 'The watcher is configured but its latest check failed.'
    };
  }
  const active = status === 'active'
    || Boolean(normalizeSpaces(watch.ticker || watch.cik));
  if (!active) {
    return {
      value: 'Not watched',
      detail: 'Arm the free SEC watcher to make filings part of the research clock.'
    };
  }
  const forms = Array.isArray(watch.forms) && watch.forms.length
    ? watch.forms.map(form => normalizeSpaces(form).toUpperCase()).filter(Boolean)
    : ['10-Q', '10-K'];
  const primaryForms = forms.filter(form => ['10-Q', '10-K', '20-F', '6-K'].includes(form));
  const label = (primaryForms.length ? primaryForms : forms).slice(0, 2).join(' or ');
  return {
    value: `Next ${label || 'SEC filing'}`,
    detail: watch.nextCheckAt
      ? `Watcher checks again ${dateLabel(watch.nextCheckAt)}.`
      : watch.lastCheckedAt
        ? `Watching continuously; last checked ${dateLabel(watch.lastCheckedAt)}.`
        : 'Watching continuously; the company has not announced a date here.'
  };
};

export const buildDossierCaseCover = ({ page = {}, shareBlocked = false } = {}) => {
  const research = researchState(page);
  const valuation = page?.investmentDossier?.valuation || {};
  const valuationDate = valuation.asOf || valuation.priceAsOf;
  const tracked = Boolean(page?.judgment?.kind);
  const shared = normalizeSpaces(page?.visibility).toLowerCase() === 'shared';
  const materialChange = lastMaterialChange(page);
  const filing = expectedFiling(page);

  return {
    research,
    tracked,
    facts: [
      {
        id: 'research',
        label: 'Research state',
        value: research.value,
        detail: research.detail,
        tone: research.action === 'review' ? 'attention' : 'neutral'
      },
      {
        id: 'judgment',
        label: 'Judgment',
        value: tracked ? 'Tracked as an active case' : 'Not tracked',
        detail: tracked
          ? 'Belief, posture, decisions, and outcomes live in Judgment.'
          : 'Research can remain useful without becoming an active decision.'
      },
      {
        id: 'change',
        label: 'Last material change',
        value: materialChange.value,
        detail: materialChange.detail
      },
      {
        id: 'valuation',
        label: 'Valuation date',
        value: dateLabel(valuationDate),
        detail: valuationDate
          ? 'The detailed valuation keeps its inputs and source bindings below.'
          : 'No dated market snapshot has been accepted.'
      },
      {
        id: 'filing',
        label: 'Next expected filing',
        value: filing.value,
        detail: filing.detail
      },
      {
        id: 'visibility',
        label: 'Visibility',
        value: shareBlocked ? 'Private · sharing blocked' : shared ? 'Public' : 'Private',
        detail: shared && !shareBlocked
          ? 'Public readers receive the article and safe references, never the private graph.'
          : shareBlocked
            ? 'Quality review must clear before this dossier can be public.'
            : 'Only you can read this dossier.'
      }
    ]
  };
};

export default buildDossierCaseCover;
