const PUBLIC_PROOF_PRIVACY_STATEMENT = (
  'This public page includes the maintained article and public references. Private highlights, backlinks, notes, library context, and agent state stay private.'
);

const PUBLIC_PROOF_GRADES = Object.freeze({
  PROVEN: 'proven',
  CANDIDATE: 'candidate',
  ACCEPTANCE_IN_PROGRESS: 'acceptance_in_progress',
  ILLUSTRATIVE: 'illustrative'
});

const DEFAULT_PUBLIC_PROOF_SLOTS = Object.freeze([
  {
    key: 'alphabet',
    label: 'Company dossier',
    title: 'Alphabet is Berkshire Hathaway 2.0',
    envKey: 'PUBLIC_PROOF_ALPHABET_PAGE',
    exactTitles: [
      'Alphabet is Berkshire Hathaway 2.0',
      'Alphabet is Berkshire Hathaway 2.0 – Investing Notes'
    ]
  },
  {
    key: 'margin-of-safety',
    label: 'Concept dossier',
    title: 'Margin of Safety in Value Investing',
    envKey: 'PUBLIC_PROOF_MARGIN_OF_SAFETY_PAGE',
    exactTitles: ['Margin of Safety in Value Investing', 'Margin of Safety']
  },
  {
    key: 'circle-of-competence',
    label: 'Concept dossier',
    title: 'Circle of Competence',
    envKey: 'PUBLIC_PROOF_CIRCLE_OF_COMPETENCE_PAGE',
    exactTitles: ['Circle of Competence']
  },
  {
    key: 'market-map',
    label: 'Market map',
    title: 'Market map',
    envKey: 'PUBLIC_PROOF_MARKET_MAP_PAGE',
    titlePattern: /\bmarket map\b/i
  },
  {
    key: 'live-question',
    label: 'Live question',
    title: 'Live question',
    envKey: 'PUBLIC_PROOF_LIVE_QUESTION_PAGE',
    pageType: 'question'
  },
  {
    key: 'noeis-repo',
    label: 'Repository wiki',
    title: 'The Noeis GitHub repo wiki',
    envKey: 'PUBLIC_PROOF_NOEIS_REPO_PAGE',
    repoIdentity: 'atsokolas/note-taker-3'
  }
]);

const clean = (value = '', limit = 500) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const asDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const asPlain = (value = {}) => (
  value && typeof value.toObject === 'function'
    ? value.toObject({ virtuals: false })
    : value || {}
);

const pageId = (page = {}) => clean(page._id || page.id, 120);

const pageReviewedAt = (page = {}) => (
  asDate(page.lastReviewedAt)
  || asDate(page.freshness?.lastMaintainedAt)
  || asDate(page.aiState?.quality?.checkedAt)
  || asDate(page.aiState?.lastDraftedAt)
);

const activeWatch = (watch = {}) => clean(watch.status, 40) === 'active';

const buildClock = (page = {}) => {
  const watches = page.externalWatches || {};
  const repo = watches.githubRepo || {};
  const edgar = watches.edgar || {};
  const transcripts = watches.transcripts || {};
  const hasRepo = activeWatch(repo) && clean(repo.owner) && clean(repo.repo);
  const hasEdgar = activeWatch(edgar) && (clean(edgar.ticker) || clean(edgar.cik));
  const hasTranscripts = activeWatch(transcripts) && clean(transcripts.ticker);

  if (hasRepo) {
    return {
      type: 'github',
      label: 'GitHub default-branch and release monitoring'
    };
  }
  if (hasEdgar && hasTranscripts) {
    return {
      type: 'sec_edgar_and_earnings_transcript',
      label: 'SEC filings and earnings transcripts'
    };
  }
  if (hasEdgar) return { type: 'sec_edgar', label: 'SEC filings' };
  if (hasTranscripts) return { type: 'earnings_transcript', label: 'Earnings transcripts' };
  if (Array.isArray(page.sourceRefs) && page.sourceRefs.length > 0) {
    return { type: 'reading', label: 'Reading and accepted source maintenance' };
  }
  return { type: 'manual', label: 'Accepted editorial review' };
};

const buildCurrentThrough = (page = {}, reviewedAt = pageReviewedAt(page)) => {
  const repo = page.externalWatches?.githubRepo || {};
  const publishedHeadSha = clean(repo.publishedHeadSha, 80);
  if (publishedHeadSha) {
    const owner = clean(repo.owner, 120);
    const repoName = clean(repo.repo, 120);
    return {
      label: `Commit ${publishedHeadSha.slice(0, 7)}`,
      at: asDate(repo.lastPublishedAt),
      ref: owner && repoName
        ? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/commit/${encodeURIComponent(publishedHeadSha)}`
        : ''
    };
  }

  const accepted = asPlain(page.freshness?.acceptedThrough);
  if (clean(accepted.sourceEventId) && clean(accepted.title)) {
    return {
      label: clean(accepted.title, 160),
      at: asDate(accepted.sourceUpdatedAt || accepted.acceptedAt),
      ref: clean(accepted.url, 1000)
    };
  }

  if (reviewedAt) {
    return {
      label: 'Last accepted review',
      at: reviewedAt,
      ref: ''
    };
  }
  return null;
};

const buildLatestMaterialEvent = (page = {}) => {
  const changeLog = Array.isArray(page.aiState?.changeLog) ? page.aiState.changeLog : [];
  const latest = changeLog
    .map(entry => ({ entry, at: asDate(entry?.createdAt) }))
    .filter(item => item.at)
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (latest) {
    const summary = clean(latest.entry.text || latest.entry.title, 240);
    if (summary) {
      return {
        type: clean(latest.entry.type, 60) || 'maintenance',
        summary,
        at: latest.at
      };
    }
  }

  const summary = clean(page.aiState?.maintenanceSummary, 240);
  const at = asDate(page.aiState?.lastDraftedAt) || asDate(page.freshness?.lastMaintainedAt);
  if (summary && at) return { type: 'maintenance', summary, at };

  const accepted = asPlain(page.freshness?.acceptedThrough);
  const acceptedAt = asDate(accepted.acceptedAt);
  const acceptedTitle = clean(accepted.title, 180);
  if (clean(accepted.sourceEventId, 180) && acceptedTitle && acceptedAt) {
    return {
      type: 'accepted_source_maintenance',
      summary: `Accepted ${acceptedTitle} into the maintained page.`,
      at: acceptedAt
    };
  }
  return null;
};

const buildPublicMaintenanceProof = (input = {}) => {
  const page = asPlain(input);
  const reviewedAt = pageReviewedAt(page);
  return {
    clock: buildClock(page),
    currentThrough: buildCurrentThrough(page, reviewedAt),
    lastReviewedAt: reviewedAt,
    latestMaterialEvent: buildLatestMaterialEvent(page),
    sourceCount: Array.isArray(page.sourceRefs) ? page.sourceRefs.length : Number(page.sourceCount || 0),
    claimCount: Array.isArray(page.claims) ? page.claims.length : Number(page.claimCount || 0),
    privacyStatement: PUBLIC_PROOF_PRIVACY_STATEMENT
  };
};

const defaultProofGrade = (slot = {}) => {
  if (slot.key === 'alphabet') return PUBLIC_PROOF_GRADES.ACCEPTANCE_IN_PROGRESS;
  if (slot.key === 'noeis-repo') return PUBLIC_PROOF_GRADES.CANDIDATE;
  return PUBLIC_PROOF_GRADES.ILLUSTRATIVE;
};

const buildPublicProofGrade = ({ slot = {}, page = {}, maintenanceProof = null } = {}) => {
  const configured = asPlain(page.publicProof);
  const requestedGrade = clean(configured.grade, 40);
  const proof = maintenanceProof || buildPublicMaintenanceProof(page);
  const acceptedAt = asDate(configured.acceptedAt);
  const acceptedEventId = clean(configured.acceptedEventId, 180);
  const acceptedClockTypes = new Set(
    (Array.isArray(configured.acceptedClocks) ? configured.acceptedClocks : [])
      .filter(clock => (
        clean(clock?.type, 60)
        && clean(clock?.sourceEventId, 180)
        && clean(clock?.revisionId, 180)
        && asDate(clock?.acceptedAt)
      ))
      .map(clock => clean(clock.type, 60))
  );
  const requiredClocks = slot.key === 'alphabet'
    ? { secEdgar: acceptedClockTypes.has('sec_edgar') }
    : slot.key === 'noeis-repo'
      ? { github: acceptedClockTypes.has('github') }
      : {};
  const optionalClocks = {
    earningsTranscript: acceptedClockTypes.has('earnings_transcript')
  };
  const hasRequiredClockAcceptance = slot.key === 'alphabet'
    ? requiredClocks.secEdgar
    : slot.key === 'noeis-repo'
      ? requiredClocks.github
      : true;
  const hasAcceptedVersion = Boolean(
    clean(proof.currentThrough?.ref, 1000)
    || clean(page.freshness?.acceptedThrough?.sourceEventId, 180)
  );
  const hasEvidence = Number(proof.sourceCount || 0) > 0 && Number(proof.claimCount || 0) > 0;
  const hasMaterialEvent = Boolean(proof.latestMaterialEvent?.at && clean(proof.latestMaterialEvent?.summary, 240));
  const canBeProven = requestedGrade === PUBLIC_PROOF_GRADES.PROVEN
    && acceptedAt
    && acceptedEventId
    && hasAcceptedVersion
    && hasEvidence
    && hasMaterialEvent
    && hasRequiredClockAcceptance;
  const grade = canBeProven
    ? PUBLIC_PROOF_GRADES.PROVEN
    : requestedGrade === PUBLIC_PROOF_GRADES.ACCEPTANCE_IN_PROGRESS
      ? PUBLIC_PROOF_GRADES.ACCEPTANCE_IN_PROGRESS
      : requestedGrade === PUBLIC_PROOF_GRADES.ILLUSTRATIVE
        ? PUBLIC_PROOF_GRADES.ILLUSTRATIVE
        : defaultProofGrade(slot);
  const comparisonUrl = slot.key === 'noeis-repo'
    ? `/share/wiki/${encodeURIComponent(pageId(page) || clean(page.slug, 180))}/comparison`
    : '';
  const defaultReason = {
    [PUBLIC_PROOF_GRADES.PROVEN]: 'An explicit public-proof acceptance record is backed by an accepted authoritative source version, evidence, claims, and a material maintenance event.',
    [PUBLIC_PROOF_GRADES.CANDIDATE]: 'The object has a live source clock, but its claim-level maintenance event has not yet passed public-proof acceptance.',
    [PUBLIC_PROOF_GRADES.ACCEPTANCE_IN_PROGRESS]: 'The object remains under editorial and maintenance acceptance and must not be presented as proven.',
    [PUBLIC_PROOF_GRADES.ILLUSTRATIVE]: 'The object illustrates the maintained knowledge system but does not yet prove the full maintenance loop.'
  };
  return {
    grade,
    label: grade.split('_').map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' '),
    reason: grade === requestedGrade && clean(configured.reason, 320)
      ? clean(configured.reason, 320)
      : defaultReason[grade],
    acceptedAt: grade === PUBLIC_PROOF_GRADES.PROVEN ? acceptedAt : null,
    comparisonUrl,
    criteria: {
      explicitlyAccepted: Boolean(canBeProven),
      acceptedVersion: hasAcceptedVersion,
      materialEvent: hasMaterialEvent,
      sourceGrounded: hasEvidence,
      ...(['alphabet', 'noeis-repo'].includes(slot.key) ? { requiredClocks } : {}),
      ...(slot.key === 'alphabet' ? { optionalClocks } : {})
    }
  };
};

const configuredIdentifier = (slot = {}, env = process.env) => clean(env?.[slot.envKey], 180);

const repoIdentityFor = (page = {}) => {
  const watch = page.externalWatches?.githubRepo || {};
  const owner = clean(watch.owner).toLowerCase();
  const repo = clean(watch.repo).toLowerCase();
  return owner && repo ? `${owner}/${repo}` : '';
};

const slotMatchesPage = ({ slot = {}, page = {}, identifier = '' } = {}) => {
  if (!page || page.visibility !== 'shared' || page.status === 'archived') return false;
  if (identifier) {
    return [pageId(page), clean(page.slug, 180)].includes(identifier);
  }
  const title = clean(page.title, 300);
  if (Array.isArray(slot.exactTitles) && slot.exactTitles.includes(title)) return true;
  if (slot.titlePattern && slot.titlePattern.test(title)) return true;
  if (slot.pageType && clean(page.pageType, 60) === slot.pageType) return true;
  if (slot.repoIdentity && repoIdentityFor(page) === slot.repoIdentity) return true;
  return false;
};

const explicitlyProvenAlphabetPage = ({ slot = {}, page = {} } = {}) => {
  if (slot.key !== 'alphabet') return false;
  if (!page || page.visibility !== 'shared' || page.status !== 'published') return false;
  if (!/\balphabet\b/i.test(clean(page.title, 300))) return false;
  return buildPublicProofGrade({ slot, page }).grade === PUBLIC_PROOF_GRADES.PROVEN;
};

const selectPublicProofPages = ({ pages = [], slots = DEFAULT_PUBLIC_PROOF_SLOTS, env = process.env } = {}) => {
  const used = new Set();
  return slots.map((slot) => {
    const identifier = configuredIdentifier(slot, env);
    const acceptedAlphabetPage = pages
      .filter(candidate => !used.has(pageId(candidate)) && explicitlyProvenAlphabetPage({ slot, page: candidate }))
      .sort((left, right) => (
        (asDate(right.publicProof?.acceptedAt)?.getTime() || 0)
        - (asDate(left.publicProof?.acceptedAt)?.getTime() || 0)
      ))[0];
    const page = acceptedAlphabetPage || pages.find(candidate => (
      !used.has(pageId(candidate))
      && slotMatchesPage({ slot, page: candidate, identifier })
    ));
    if (!page) return null;
    used.add(pageId(page));
    return { slot, page };
  }).filter(Boolean);
};

const compactRegistryPage = ({ page = {}, serializedPage = {}, maintenanceProof = null } = {}) => ({
  title: clean(serializedPage.title || page.title, 300),
  plainText: clean(serializedPage.plainText || page.plainText, 420),
  sourceRefs: (Array.isArray(serializedPage.sourceRefs) ? serializedPage.sourceRefs : [])
    .slice(0, 8)
    .map(source => ({
      title: clean(source?.title, 240),
      url: clean(source?.url, 1000)
    }))
    .filter(source => source.title || source.url),
  maintenanceProof
});

const serializePublicProofEntry = ({ slot = {}, page = {}, serializePage, compact = false } = {}) => {
  const serializedPage = typeof serializePage === 'function' ? serializePage(page) : null;
  if (!serializedPage) return null;
  const maintenanceProof = serializedPage.maintenanceProof || buildPublicMaintenanceProof(page);
  const proofGrade = buildPublicProofGrade({ slot, page, maintenanceProof });
  return {
    slot: slot.key,
    label: slot.label,
    title: clean(serializedPage.title || page.title, 300) || slot.title,
    publicUrl: `/share/wiki/${encodeURIComponent(pageId(page) || clean(page.slug, 180))}`,
    page: compact ? compactRegistryPage({ page, serializedPage, maintenanceProof }) : serializedPage,
    maintenanceProof,
    proofGrade
  };
};

module.exports = {
  DEFAULT_PUBLIC_PROOF_SLOTS,
  PUBLIC_PROOF_PRIVACY_STATEMENT,
  PUBLIC_PROOF_GRADES,
  buildPublicMaintenanceProof,
  buildPublicProofGrade,
  compactRegistryPage,
  selectPublicProofPages,
  serializePublicProofEntry,
  slotMatchesPage
};
