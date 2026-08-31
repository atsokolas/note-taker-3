/**
 * Stage 5 — The Living Team.
 *
 * A shared case is an overlay of roles and mandates. Each person's claims,
 * evidence, revisions, and verdicts stay on their own page. The overlay
 * never becomes a denormalized single-user blob. Dissent stays authored.
 * Resolution is another sheet of tracing paper, not a merge.
 */

const crypto = require('crypto');

const ROLES = Object.freeze([
  'observe',
  'research',
  'propose',
  'decide',
  'approve',
  'publish',
  'administer'
]);

const ACTIONS = Object.freeze([
  'observe',
  'research',
  'propose',
  'decide',
  'approve',
  'publish',
  'administer'
]);

const EXPOSURE = Object.freeze(['least', 'authored', 'full']);
const SENTENCE = Object.freeze(['fact', 'inference', 'recommendation', 'unknown']);
const POSTURE = Object.freeze(['investigate', 'watch', 'act', 'avoid', 'no_action', 'closed']);
const CONFIDENCE = Object.freeze(['certain', 'probable', 'uncertain', '']);
const DIFF_AXES = Object.freeze(['assumptions', 'interpretation', 'action']);

const ROLE_RIGHTS = Object.freeze({
  observe: Object.freeze(['observe']),
  research: Object.freeze(['observe', 'research']),
  propose: Object.freeze(['observe', 'research', 'propose']),
  decide: Object.freeze(['observe', 'research', 'propose', 'decide']),
  approve: Object.freeze(['observe', 'research', 'propose', 'approve']),
  publish: Object.freeze(['observe', 'publish']),
  administer: Object.freeze([...ACTIONS])
});

const ROLE_LABEL = Object.freeze({
  observe: 'May read the overlay',
  research: 'May bring evidence',
  propose: 'May propose a reading',
  decide: 'May decide on their own page',
  approve: 'May approve a version',
  publish: 'May seal the public folio',
  administer: 'May name rights'
});

const ACTION_LABEL = Object.freeze({
  observe: 'read the overlay',
  research: 'bring evidence',
  propose: 'propose a reading',
  decide: 'decide on your own page',
  approve: 'approve this version',
  publish: 'seal the public folio',
  administer: 'name rights on this case'
});

const EXPOSURE_LABEL = Object.freeze({
  least: 'The overlay names that minds part, not the private notes.',
  authored: 'Each author sees their own full page; others see claims and assumptions.',
  full: 'The overlay shows assumptions, interpretation, and action. Authorship stays on each page.'
});

const AUTHORITY_LINE = Object.freeze({
  allowed: (action, source) => `You may ${ACTION_LABEL[action] || action}${source ? ` — ${source}` : ''}.`,
  denied: (action) => `This case does not name you to ${ACTION_LABEL[action] || action}.`
});

const looksLikeEmail = (value) => /@/.test(String(value || ''));
const clean = (value = '', limit = 4000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};
const list = (value) => (Array.isArray(value) ? value : []);
const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const plain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);
const iso = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const digest = (value) => crypto
  .createHash('sha256')
  .update(JSON.stringify(canonicalize(value)))
  .digest('hex');

const canonicalize = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      const next = canonicalize(value[key]);
      if (next === undefined) return acc;
      acc[key] = next;
      return acc;
    }, {});
  }
  return String(value);
};

const isRole = (value) => ROLES.includes(String(value || ''));
const isAction = (value) => ACTIONS.includes(String(value || ''));
const isExposure = (value) => EXPOSURE.includes(String(value || ''));
const isSentence = (value) => SENTENCE.includes(String(value || ''));
const isPosture = (value) => POSTURE.includes(String(value || ''));

const uniqueRoles = (values) => {
  const seen = new Set();
  return list(values).map((role) => String(role || '').trim()).filter((role) => {
    if (!isRole(role) || seen.has(role)) return false;
    seen.add(role);
    return true;
  });
};

const uniqueActions = (values) => {
  const seen = new Set();
  return list(values).map((action) => String(action || '').trim()).filter((action) => {
    if (!isAction(action) || seen.has(action)) return false;
    seen.add(action);
    return true;
  });
};

const safeLabel = (value, fallback = '') => {
  const label = clean(value, 80);
  if (!label || looksLikeEmail(label)) return fallback;
  return label;
};

const qualitativeConfidence = (value) => {
  if (CONFIDENCE.includes(String(value || ''))) return String(value || '');
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  if (number >= 0.75) return 'certain';
  if (number >= 0.4) return 'probable';
  if (number > 0) return 'uncertain';
  return '';
};

const exposureOf = (...layers) => {
  const order = { least: 0, authored: 1, full: 2 };
  let current = 'least';
  layers.forEach((layer) => {
    const next = isExposure(layer) ? layer : '';
    if (next && order[next] > order[current]) current = next;
  });
  return current;
};

const rightsFromRoles = (roles = []) => {
  const held = uniqueRoles(roles);
  const rights = new Set();
  held.forEach((role) => {
    list(ROLE_RIGHTS[role]).forEach((right) => rights.add(right));
  });
  return uniqueActions([...rights]);
};

const applyMandate = (rights, mandate = {}) => {
  const allowed = uniqueActions(mandate.allowed);
  const denied = uniqueActions(mandate.denied);
  const named = allowed.length
    ? uniqueActions(rights.filter((right) => allowed.includes(right)))
    : uniqueActions(rights);
  return uniqueActions(named.filter((right) => !denied.includes(right)));
};

const rightsFor = (member = {}, caseMandate = {}) => {
  const roles = uniqueRoles(member.roles);
  if (!roles.length) return [];
  const fromRoles = rightsFromRoles(roles);
  const withCase = applyMandate(fromRoles, caseMandate);
  return applyMandate(withCase, member.mandate);
};

const can = (member, action, caseMandate = {}) => (
  isAction(action) && rightsFor(member, caseMandate).includes(action)
);

const authoritySource = (member = {}, action = '', caseMandate = {}) => {
  const roles = uniqueRoles(member.roles).filter((role) => list(ROLE_RIGHTS[role]).includes(action));
  if (caseMandate.decisionRight && action === 'decide' && idOf(caseMandate.decisionRight) === idOf(member.userId)) {
    return 'this case names you to decide';
  }
  if (caseMandate.publishRight && action === 'publish' && idOf(caseMandate.publishRight) === idOf(member.userId)) {
    return 'this case names you to publish';
  }
  if (roles.includes('administer')) return 'you administer this case';
  if (roles.length === 1) return ROLE_LABEL[roles[0]] || '';
  if (roles.length) return roles.map((role) => ROLE_LABEL[role]).filter(Boolean).join('; ');
  return '';
};

const authorityAt = (member, action, caseMandate = {}) => {
  const allowed = can(member, action, caseMandate);
  const source = authoritySource(member, action, caseMandate);
  return {
    action: isAction(action) ? action : '',
    allowed,
    roles: uniqueRoles(member.roles),
    rights: rightsFor(member, caseMandate),
    source,
    label: allowed
      ? AUTHORITY_LINE.allowed(action, source)
      : AUTHORITY_LINE.denied(action)
  };
};

const activeMembers = (team = {}) => list(team.members).filter((member) => !member.revokedAt);

const hostSeat = (team = {}, hostPage = {}) => {
  const existing = activeMembers(team).find((member) => idOf(member.userId) === idOf(team.hostUserId));
  if (existing) return existing;
  return {
    userId: idOf(team.hostUserId || hostPage.userId),
    pageId: idOf(team.hostPageId || hostPage._id || hostPage.id),
    label: safeLabel(team.hostLabel || hostPage?.judgment?.ownerLabel, 'The author'),
    roles: ['administer'],
    mandate: {},
    grantedAt: iso(team.createdAt || hostPage.createdAt)
  };
};

const seatFor = (team, userId, hostPage) => {
  const host = hostSeat(team, hostPage);
  if (idOf(userId) && idOf(userId) === idOf(host.userId)) return host;
  return activeMembers(team).find((member) => idOf(member.userId) === idOf(userId)) || null;
};

const evidenceLinks = (page = {}, ids = []) => {
  const wanted = new Set(list(ids).map(idOf).filter(Boolean));
  const seen = new Set();
  return list(plain(page)?.sourceRefs).map((source) => {
    const key = idOf(source);
    if (wanted.size && key && !wanted.has(key)) return null;
    const title = clean(source.title || source.citationLabel || source.url, 240);
    const url = /^https?:\/\//i.test(String(source.url || '')) ? clean(source.url, 1000) : '';
    if (!title && !url) return null;
    const stamp = `${title}|${url}`;
    if (seen.has(stamp)) return null;
    seen.add(stamp);
    return { title: title || url, url };
  }).filter(Boolean);
};

const reasonTexts = (rows = []) => list(rows)
  .map((row) => clean(row.text, 800))
  .filter(Boolean);

const assumptionTexts = (rows = []) => list(rows)
  .map((row) => clean(row.text, 800))
  .filter(Boolean);

const unknownQuestions = (rows = []) => list(rows)
  .filter((row) => !row.resolvedAt && String(row.status || 'open') !== 'answered')
  .map((row) => ({
    id: clean(row.unknownId, 80),
    question: clean(row.question, 400)
  }))
  .filter((row) => row.question);

const triggerLines = (page = {}) => {
  const judgment = plain(plain(page)?.judgment) || {};
  const falsifiers = list(judgment.falsifiers)
    .filter((row) => String(row.status || 'unobserved') !== 'retired')
    .map((row) => clean(row.text || row.observableSignal, 400))
    .filter(Boolean);
  const horizon = iso(judgment.resolutionHorizonAt);
  const criterion = clean(judgment.resolutionCriteria, 400);
  const next = clean(judgment.nextReviewTrigger, 400);
  return {
    falsifiers,
    horizon,
    criterion,
    nextReview: next
  };
};

const positionVersion = (page = {}) => {
  const judgment = plain(plain(page)?.judgment) || {};
  return digest({
    pageId: idOf(page),
    claim: clean(judgment.currentJudgment, 8000),
    posture: clean(judgment.decisionPosture, 40),
    assumptions: assumptionTexts(judgment.assumptions),
    why: reasonTexts(judgment.why),
    against: reasonTexts(judgment.against),
    verdicts: list(judgment.verdicts).map((row) => ({
      result: clean(row.result, 40),
      at: iso(row.recordedAt)
    })),
    clocks: list(judgment.clocks).map((row) => ({
      clock: clean(row.clock, 40),
      at: iso(row.occurredAt || row.recordedAt),
      summary: clean(row.summary, 400)
    }))
  });
};

const overlayPosition = ({ member, page, viewer, caseMandate = {} } = {}) => {
  const judgment = plain(plain(page)?.judgment) || {};
  const claim = clean(judgment.currentJudgment, 8000);
  if (!idOf(member?.userId)) return null;
  const self = idOf(viewer?.userId) && idOf(viewer.userId) === idOf(member.userId);
  const viewerRights = rightsFor(viewer || {}, caseMandate);
  const exposure = self
    ? 'full'
    : exposureOf(caseMandate.exposure, member.mandate?.exposure, 'least');
  const maySeeAuthored = self || exposure !== 'least' || viewerRights.includes('decide') || viewerRights.includes('approve') || viewerRights.includes('administer');
  const maySeeFull = self || exposure === 'full' || viewerRights.includes('administer');
  const posture = isPosture(judgment.decisionPosture) ? judgment.decisionPosture : '';
  const latestVerdict = list(judgment.verdicts).slice(-1)[0] || null;
  const position = {
    userId: idOf(member.userId),
    pageId: idOf(member.pageId || page),
    label: safeLabel(member.label || judgment.ownerLabel, self ? 'You' : 'A reader'),
    roles: uniqueRoles(member.roles),
    rights: rightsFor(member, caseMandate),
    claim,
    confidence: qualitativeConfidence(judgment.confidence),
    decisionRight: can(member, 'decide', caseMandate),
    action: {
      posture,
      verdict: latestVerdict ? clean(latestVerdict.result, 40) : '',
      at: iso(latestVerdict?.recordedAt)
    },
    versionHash: page ? positionVersion(page) : '',
    self
  };
  if (!maySeeAuthored) {
    return {
      ...position,
      evidence: [],
      assumptions: [],
      interpretation: claim ? { parted: Boolean(claim), claim } : null,
      unknowns: [],
      triggers: { falsifiers: [], horizon: null, criterion: '', nextReview: '' },
      exposure: 'least'
    };
  }
  position.evidence = evidenceLinks(page, []);
  position.assumptions = assumptionTexts(judgment.assumptions);
  position.interpretation = {
    claim,
    why: maySeeFull ? reasonTexts(judgment.why) : [],
    against: maySeeFull ? reasonTexts(judgment.against) : []
  };
  position.unknowns = unknownQuestions(judgment.unknowns);
  position.triggers = triggerLines(page);
  position.exposure = self ? 'full' : exposure;
  return position;
};

const sameSet = (left = [], right = []) => {
  const a = [...left].map((row) => clean(row, 800)).filter(Boolean).sort();
  const b = [...right].map((row) => clean(row, 800)).filter(Boolean).sort();
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
};

const axisParted = (left, right) => {
  const leftText = clean(typeof left === 'string' ? left : JSON.stringify(left || ''), 2000);
  const rightText = clean(typeof right === 'string' ? right : JSON.stringify(right || ''), 2000);
  return leftText !== rightText;
};

const dissentDiff = (left = {}, right = {}) => {
  const assumptions = {
    axis: 'assumptions',
    parted: !sameSet(left.assumptions, right.assumptions),
    left: list(left.assumptions),
    right: list(right.assumptions)
  };
  const interpretation = {
    axis: 'interpretation',
    parted: axisParted(left.interpretation || left.claim, right.interpretation || right.claim)
      || clean(left.claim, 8000) !== clean(right.claim, 8000),
    left: left.interpretation || { claim: left.claim || '' },
    right: right.interpretation || { claim: right.claim || '' }
  };
  const action = {
    axis: 'action',
    parted: clean(left.action?.posture, 40) !== clean(right.action?.posture, 40)
      || clean(left.action?.verdict, 40) !== clean(right.action?.verdict, 40),
    left: left.action || {},
    right: right.action || {}
  };
  return { assumptions, interpretation, action };
};

const overlayDissent = (positions = []) => {
  const authored = list(positions).filter((row) => row && (row.claim || row.pageId));
  if (authored.length < 2) return [];
  const pairs = [];
  for (let i = 0; i < authored.length; i += 1) {
    for (let j = i + 1; j < authored.length; j += 1) {
      const diff = dissentDiff(authored[i], authored[j]);
      const parted = DIFF_AXES.filter((axis) => diff[axis].parted);
      if (!parted.length) continue;
      pairs.push({
        left: { userId: authored[i].userId, label: authored[i].label, pageId: authored[i].pageId },
        right: { userId: authored[j].userId, label: authored[j].label, pageId: authored[j].pageId },
        parted,
        diff
      });
    }
  }
  return pairs;
};

const resolveDissent = ({
  positions = [],
  standing = {},
  decidedBy = {},
  at = new Date()
} = {}) => {
  const remaining = list(positions).filter((position) => {
    if (!position?.claim) return false;
    if (idOf(position.userId) === idOf(decidedBy.userId)) return false;
    return clean(position.claim, 8000) !== clean(standing.claim, 8000)
      || clean(position.action?.posture, 40) !== clean(standing.posture, 40);
  });
  return {
    overlay: true,
    standing: {
      claim: clean(standing.claim, 8000),
      posture: isPosture(standing.posture) ? standing.posture : '',
      decidedBy: {
        userId: idOf(decidedBy.userId),
        label: safeLabel(decidedBy.label, 'A decision'),
        pageId: idOf(decidedBy.pageId)
      },
      at: iso(at)
    },
    remaining: remaining.map((position) => ({
      userId: position.userId,
      pageId: position.pageId,
      label: position.label,
      claim: position.claim,
      action: position.action
    }))
  };
};

const approvalReceipt = ({
  actor = {},
  authority = {},
  object = {},
  conditions = '',
  at = new Date()
} = {}) => {
  const receipt = {
    actor: {
      userId: idOf(actor.userId),
      label: safeLabel(actor.label, 'A signer')
    },
    authority: {
      action: 'approve',
      allowed: true,
      roles: uniqueRoles(authority.roles || actor.roles),
      source: clean(authority.source || authority.label, 240),
      label: clean(authority.label, 400)
    },
    object: {
      kind: clean(object.kind, 40) || 'position',
      pageId: idOf(object.pageId),
      versionHash: clean(object.versionHash, 128)
    },
    conditions: clean(conditions, 800),
    at: iso(at),
    supersededBy: null
  };
  return { ...receipt, receiptId: digest(receipt) };
};

const supersedeApprovals = (approvals = [], currentHash = '', supersedingId = '') => (
  list(approvals).map((row) => {
    if (row.supersededBy) return row;
    if (!currentHash || clean(row.object?.versionHash, 128) === clean(currentHash, 128)) return row;
    return {
      ...row,
      supersededBy: clean(supersedingId, 128) || `superseded:${clean(row.receiptId || row.object?.versionHash, 128)}`
    };
  })
);

const recordLink = ({ type, id, pageId, label }) => ({
  type: clean(type, 40),
  id: clean(id, 80),
  pageId: idOf(pageId),
  label: clean(label, 240)
});

const briefSentence = (kind, text, record) => {
  const line = clean(text, 800);
  if (!isSentence(kind) || !line) return null;
  return { kind, text: line, record: record || null };
};

const meetingBrief = ({
  team = {},
  positions = [],
  dissent = [],
  approvals = [],
  since = null,
  hostPage = {}
} = {}) => {
  const sinceMs = iso(since) ? new Date(since).getTime() : 0;
  const after = (stamp) => {
    if (!sinceMs) return true;
    const ms = iso(stamp) ? new Date(stamp).getTime() : NaN;
    return Number.isFinite(ms) && ms > sinceMs;
  };
  const sentences = [];
  const hostClaim = clean(plain(hostPage)?.judgment?.currentJudgment, 8000);

  list(team.audit).forEach((row) => {
    if (!after(row.at)) return;
    sentences.push(briefSentence(
      'fact',
      clean(row.summary, 400) || 'A right on this case moved.',
      recordLink({ type: 'audit', id: row.receiptId || row.at, pageId: team.hostPageId, label: 'Role change' })
    ));
  });

  list(positions).forEach((position) => {
    if (position.action?.at && after(position.action.at) && position.action.verdict) {
      sentences.push(briefSentence(
        'fact',
        `${position.label} recorded a verdict.`,
        recordLink({
          type: 'verdict',
          id: position.action.verdict,
          pageId: position.pageId,
          label: position.label
        })
      ));
    }
    list(position.unknowns).forEach((unknown) => {
      sentences.push(briefSentence(
        'unknown',
        unknown.question,
        recordLink({ type: 'unknown', id: unknown.id, pageId: position.pageId, label: position.label })
      ));
    });
  });

  list(dissent).forEach((pair) => {
    const axes = list(pair.parted).join(', ');
    sentences.push(briefSentence(
      'inference',
      `${pair.left.label} and ${pair.right.label} part on ${axes}.`,
      recordLink({
        type: 'dissent',
        id: `${pair.left.pageId}:${pair.right.pageId}`,
        pageId: pair.left.pageId,
        label: axes
      })
    ));
  });

  list(approvals).filter((row) => after(row.at)).forEach((row) => {
    const line = row.supersededBy
      ? `${row.actor.label} had approved a version that has since moved.`
      : `${row.actor.label} approved a version of this case.`;
    sentences.push(briefSentence(
      'fact',
      line,
      recordLink({ type: 'approval', id: row.receiptId, pageId: row.object?.pageId, label: row.actor.label })
    ));
  });

  const needsDecision = list(positions).some((position) => position.decisionRight)
    && list(dissent).length > 0;
  if (needsDecision) {
    sentences.push(briefSentence(
      'recommendation',
      'A standing decision is needed. Remaining dissent should stay authored.',
      recordLink({ type: 'mandate', id: 'decide', pageId: team.hostPageId, label: hostClaim })
    ));
  }

  const material = sentences.filter(Boolean);
  if (!material.length) {
    return {
      silent: true,
      sentences: [],
      title: '',
      summary: ''
    };
  }
  return {
    silent: false,
    title: hostClaim ? `What moved on ${clean(hostClaim, 80)}` : 'What moved',
    summary: material[0].text,
    sentences: material
  };
};

const handoffWalk = ({
  from = {},
  to = {},
  fromPosition = {},
  dissent = [],
  at = new Date()
} = {}) => {
  const posture = fromPosition.action?.posture || '';
  const rights = uniqueActions(fromPosition.rights);
  const questions = list(fromPosition.unknowns);
  const triggers = fromPosition.triggers || {};
  const remaining = list(dissent).filter((pair) => (
    idOf(pair.left?.userId) === idOf(from.userId) || idOf(pair.right?.userId) === idOf(from.userId)
  ));
  const steps = [];
  if (fromPosition.claim) {
    steps.push({
      kind: 'posture',
      title: 'The held sentence',
      text: fromPosition.claim,
      record: recordLink({
        type: 'claim',
        id: fromPosition.pageId,
        pageId: fromPosition.pageId,
        label: fromPosition.label
      })
    });
  }
  if (posture) {
    steps.push({
      kind: 'posture',
      title: 'The posture',
      text: posture,
      record: recordLink({
        type: 'posture',
        id: posture,
        pageId: fromPosition.pageId,
        label: fromPosition.label
      })
    });
  }
  if (rights.length) {
    steps.push({
      kind: 'rights',
      title: 'Rights on this case',
      text: rights.map((right) => ACTION_LABEL[right] || right).join('; '),
      record: recordLink({
        type: 'rights',
        id: from.userId,
        pageId: fromPosition.pageId,
        label: fromPosition.label
      })
    });
  }
  questions.forEach((unknown) => {
    steps.push({
      kind: 'questions',
      title: 'Still open',
      text: unknown.question,
      record: recordLink({
        type: 'unknown',
        id: unknown.id,
        pageId: fromPosition.pageId,
        label: fromPosition.label
      })
    });
  });
  remaining.forEach((pair) => {
    const other = idOf(pair.left?.userId) === idOf(from.userId) ? pair.right : pair.left;
    steps.push({
      kind: 'dissent',
      title: 'Remaining dissent',
      text: `${fromPosition.label || 'This author'} still parts with ${other.label} on ${list(pair.parted).join(', ')}.`,
      record: recordLink({
        type: 'dissent',
        id: other.pageId,
        pageId: other.pageId,
        label: other.label
      })
    });
  });
  list(triggers.falsifiers).forEach((text) => {
    steps.push({
      kind: 'triggers',
      title: 'A trigger',
      text,
      record: recordLink({
        type: 'falsifier',
        id: fromPosition.pageId,
        pageId: fromPosition.pageId,
        label: fromPosition.label
      })
    });
  });
  if (triggers.criterion) {
    steps.push({
      kind: 'triggers',
      title: 'What would change the mind',
      text: triggers.criterion,
      record: recordLink({
        type: 'criterion',
        id: 'resolution',
        pageId: fromPosition.pageId,
        label: fromPosition.label
      })
    });
  }
  if (triggers.horizon) {
    steps.push({
      kind: 'triggers',
      title: 'When to look again',
      text: triggers.horizon,
      record: recordLink({
        type: 'horizon',
        id: triggers.horizon,
        pageId: fromPosition.pageId,
        label: fromPosition.label
      })
    });
  }
  return {
    from: {
      userId: idOf(from.userId),
      pageId: idOf(from.pageId || fromPosition.pageId),
      label: safeLabel(from.label || fromPosition.label, 'The departing author')
    },
    to: {
      userId: idOf(to.userId),
      pageId: idOf(to.pageId),
      label: safeLabel(to.label, 'The successor')
    },
    transferred: {
      posture,
      rights,
      questions: questions.map((row) => row.question),
      dissent: remaining.map((pair) => pair.parted),
      triggers: {
        falsifiers: list(triggers.falsifiers),
        horizon: triggers.horizon || null,
        criterion: triggers.criterion || ''
      }
    },
    walk: steps,
    fromAuthorshipIntact: true,
    at: iso(at)
  };
};

const serializeTeam = ({
  team = {},
  hostPage = {},
  pagesById = {},
  viewerId = '',
  since = null
} = {}) => {
  const host = hostSeat(team, hostPage);
  const mandate = plain(team.mandate) || {};
  const viewer = seatFor(team, viewerId, hostPage) || (
    idOf(viewerId) === idOf(host.userId) ? host : null
  );
  if (!viewer) {
    return {
      visible: false,
      reason: 'This case does not name you to observe.',
      mandate: null,
      members: [],
      positions: [],
      dissent: [],
      approvals: [],
      brief: { silent: true, sentences: [] },
      handoffs: [],
      authority: {}
    };
  }
  const members = [host, ...activeMembers(team).filter((member) => idOf(member.userId) !== idOf(host.userId))];
  const positions = members.map((member) => overlayPosition({
    member,
    page: pagesById[idOf(member.pageId)] || (idOf(member.pageId) === idOf(hostPage) ? hostPage : null),
    viewer,
    caseMandate: mandate
  })).filter(Boolean);
  const dissent = overlayDissent(positions);
  const currentHash = positionVersion(hostPage);
  const approvals = supersedeApprovals(list(team.approvals), currentHash);
  const brief = meetingBrief({
    team,
    positions,
    dissent,
    approvals,
    since,
    hostPage
  });
  const viewerAuthority = ACTIONS.reduce((acc, action) => {
    acc[action] = authorityAt(viewer, action, mandate);
    return acc;
  }, {});
  return {
    visible: true,
    hostPageId: idOf(team.hostPageId || hostPage),
    mandate: {
      purpose: clean(mandate.purpose, 400),
      exposure: isExposure(mandate.exposure) ? mandate.exposure : 'least',
      exposureLabel: EXPOSURE_LABEL[isExposure(mandate.exposure) ? mandate.exposure : 'least'],
      allowed: uniqueActions(mandate.allowed),
      denied: uniqueActions(mandate.denied)
    },
    members: members.map((member) => ({
      userId: idOf(member.userId),
      pageId: idOf(member.pageId),
      label: safeLabel(member.label, idOf(member.userId) === idOf(viewer.userId) ? 'You' : 'A reader'),
      roles: uniqueRoles(member.roles),
      rights: rightsFor(member, mandate),
      self: idOf(member.userId) === idOf(viewer.userId)
    })),
    positions,
    dissent,
    resolution: team.resolution || null,
    approvals,
    brief,
    handoffs: list(team.handoffs),
    audit: can(viewer, 'administer', mandate) ? list(team.audit) : [],
    authority: viewerAuthority,
    viewer: {
      userId: idOf(viewer.userId),
      label: safeLabel(viewer.label, 'You'),
      roles: uniqueRoles(viewer.roles),
      rights: rightsFor(viewer, mandate)
    }
  };
};

module.exports = {
  ACTIONS,
  ACTION_LABEL,
  DIFF_AXES,
  EXPOSURE,
  EXPOSURE_LABEL,
  ROLE_LABEL,
  ROLE_RIGHTS,
  ROLES,
  SENTENCE,
  applyMandate,
  approvalReceipt,
  authorityAt,
  can,
  dissentDiff,
  evidenceLinks,
  handoffWalk,
  hostSeat,
  meetingBrief,
  overlayDissent,
  overlayPosition,
  positionVersion,
  qualitativeConfidence,
  resolveDissent,
  rightsFor,
  safeLabel,
  seatFor,
  serializeTeam,
  supersedeApprovals,
  uniqueRoles
};
