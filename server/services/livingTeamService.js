/**
 * Persist the living-team overlay. Members keep their own WikiPages.
 * This file writes seats, receipts, and walks — never a merged judgment.
 */

const { persistNoeisReceipt, serializeStoredReceipt } = require('./noeisReceiptService');
const {
  approvalReceipt,
  authorityAt,
  can,
  handoffWalk,
  hostSeat,
  overlayDissent,
  overlayPosition,
  positionVersion,
  safeLabel,
  seatFor,
  serializeTeam,
  supersedeApprovals,
  uniqueRoles
} = require('./livingTeam');

class LivingTeamError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'LivingTeamError';
    this.status = status;
    this.code = code;
  }
}

const clean = (value = '', limit = 400) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const id = (value) => String(value?._id || value?.id || value || '').trim();
const plain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);
const list = (value) => (Array.isArray(value) ? value : []);
const resolveQuery = (query) => (query?.then ? query : Promise.resolve(query));

const requireModels = ({ WikiPage, CaseTeam }) => {
  if (!WikiPage || !CaseTeam) {
    throw new LivingTeamError('The living team is unavailable.', 503, 'unavailable');
  }
};

const loadPage = async (WikiPage, pageId) => {
  if (!pageId || !WikiPage?.findOne) return null;
  let query = WikiPage.findOne({ _id: pageId, status: { $ne: 'archived' } });
  if (query?.lean) query = query.lean();
  return resolveQuery(query);
};

const findTeam = async (CaseTeam, hostPageId) => {
  if (!CaseTeam?.findOne) return null;
  let query = CaseTeam.findOne({ hostPageId });
  return resolveQuery(query);
};

const locateTeam = async ({ WikiPage, CaseTeam, pageId, userId }) => {
  const page = await loadPage(WikiPage, pageId);
  if (!page) throw new LivingTeamError('This case was not found.', 404, 'not_found');
  let team = await findTeam(CaseTeam, id(page));
  if (team) return { page, hostPage: page, team };
  if (CaseTeam?.findOne) {
    const asMember = await resolveQuery(CaseTeam.findOne({
      $or: [
        { 'members.pageId': id(page) },
        { 'members.userId': userId }
      ]
    }));
    if (asMember && list(asMember.members).some((row) => (
      !row.revokedAt && (id(row.pageId) === id(page) || id(row.userId) === id(userId))
    ))) {
      const hostPage = await loadPage(WikiPage, id(asMember.hostPageId)) || page;
      return { page, hostPage, team: asMember };
    }
  }
  return { page, hostPage: page, team: null };
};

const pagesFor = async (WikiPage, team, hostPage) => {
  const ids = new Set([id(hostPage)]);
  list(team?.members).forEach((member) => {
    if (id(member.pageId)) ids.add(id(member.pageId));
  });
  const map = { [id(hostPage)]: hostPage };
  if (!WikiPage?.find) return map;
  const missing = [...ids].filter((key) => key && key !== id(hostPage));
  if (!missing.length) return map;
  let query = WikiPage.find({ _id: { $in: missing }, status: { $ne: 'archived' } });
  if (query?.lean) query = query.lean();
  const rows = await resolveQuery(query);
  list(rows).forEach((page) => {
    map[id(page)] = page;
  });
  return map;
};

const lineagePageFor = async ({ CasebookLineage, WikiPage, hostPageId, userId }) => {
  if (!CasebookLineage?.findOne) return null;
  const row = await resolveQuery(CasebookLineage.findOne({
    userId,
    originPageId: hostPageId,
    action: { $in: ['fork', 'adopt'] },
    childPageId: { $ne: null }
  }));
  if (!row?.childPageId) return null;
  const page = await loadPage(WikiPage, id(row.childPageId));
  if (!page || id(page.userId) !== id(userId)) return null;
  return page;
};

const ensureTeam = async ({ CaseTeam, hostPage, now }) => {
  const existing = await findTeam(CaseTeam, id(hostPage));
  if (existing) return existing;
  const host = hostSeat({ hostUserId: hostPage.userId, hostPageId: id(hostPage) }, hostPage);
  const created = await CaseTeam.create({
    hostPageId: id(hostPage),
    hostUserId: id(hostPage.userId),
    hostLabel: safeLabel(hostPage?.judgment?.ownerLabel, ''),
    mandate: { purpose: '', exposure: 'least', allowed: [], denied: [] },
    members: [{
      userId: host.userId,
      pageId: host.pageId,
      label: host.label,
      roles: ['administer'],
      mandate: { exposure: 'least' },
      grantedAt: now,
      grantedBy: host.userId
    }],
    approvals: [],
    handoffs: [],
    audit: [],
    createdAt: now
  });
  return created;
};

const requireAdminister = async ({ WikiPage, CaseTeam, userId, pageId, now }) => {
  const located = await locateTeam({ WikiPage, CaseTeam, pageId, userId });
  let { hostPage, team } = located;
  if (!team) {
    if (id(located.page.userId) !== id(userId)) {
      throw new LivingTeamError('This case does not name you to administer.', 403, 'forbidden');
    }
    team = await ensureTeam({ CaseTeam, hostPage: located.page, now });
    hostPage = located.page;
  }
  const actor = seatFor(plain(team), userId, hostPage);
  if (!can(actor, 'administer', team.mandate)) {
    throw new LivingTeamError(authorityAt(actor, 'administer', team.mandate).label, 403, 'forbidden');
  }
  return { hostPage, team, actor, page: located.page };
};

const auditLine = ({ actorId, action, summary, receiptId, at }) => ({
  at,
  actorId,
  action,
  summary: clean(summary, 400),
  receiptId: clean(receiptId, 128)
});

const persistReceipt = async ({
  NoeisReceipt, userId, kind, title, summary, page, requestId, action, extra = {}
}) => {
  if (!NoeisReceipt) return null;
  const receipt = await persistNoeisReceipt({
    NoeisReceipt,
    userId,
    receipt: {
      id: `living-team:v1:${id(page)}:${action}:${requestId || kind}`,
      kind,
      source: 'wiki',
      sourceLabel: 'Judgment',
      status: 'completed',
      completedAt: extra.at || new Date(),
      title,
      summary,
      touched: [{ type: 'wiki_page', id: id(page), title: page.title }],
      provenance: {
        version: 1,
        action,
        pageId: id(page),
        requestId: clean(requestId, 80),
        ...extra
      }
    }
  });
  return receipt || serializeStoredReceipt(null);
};

const readTeam = async ({
  WikiPage, CaseTeam, userId, pageId, since = null
} = {}) => {
  requireModels({ WikiPage, CaseTeam });
  const located = await locateTeam({ WikiPage, CaseTeam, pageId, userId });
  const { page, hostPage } = located;
  let team = located.team;
  if (!team && id(page.userId) !== id(userId)) {
    throw new LivingTeamError('This case does not name you to observe.', 403, 'forbidden');
  }
  const overlay = team || {
    hostPageId: id(hostPage),
    hostUserId: id(hostPage.userId),
    hostLabel: safeLabel(hostPage?.judgment?.ownerLabel, ''),
    mandate: { exposure: 'least' },
    members: [],
    approvals: [],
    handoffs: [],
    audit: []
  };
  const pagesById = await pagesFor(WikiPage, overlay, hostPage);
  pagesById[id(page)] = page;
  return serializeTeam({
    team: plain(overlay),
    hostPage,
    pagesById,
    viewerId: userId,
    since
  });
};

const grantSeat = async ({
  WikiPage, CaseTeam, CasebookLineage, NoeisReceipt,
  userId, pageId, memberUserId, memberPageId = '', roles = ['observe'],
  label = '', requestId = '', now = () => new Date()
} = {}) => {
  requireModels({ WikiPage, CaseTeam });
  const actedAt = now();
  const { hostPage, team } = await requireAdminister({
    WikiPage, CaseTeam, userId, pageId, now: actedAt
  });
  let page = null;
  if (id(memberPageId)) {
    page = await loadPage(WikiPage, id(memberPageId));
    if (!page) throw new LivingTeamError('That page was not found.', 404, 'not_found');
  }
  const memberId = id(memberUserId) || id(page?.userId);
  if (!memberId) throw new LivingTeamError('Name who may sit in this room.', 400, 'member_required');
  if (memberId === id(hostPage.userId)) {
    throw new LivingTeamError('The author already sits here.', 409, 'already_host');
  }
  if (page && id(page.userId) !== memberId) {
    throw new LivingTeamError('That page does not belong to the person you named.', 422, 'page_not_theirs');
  }
  if (!page) {
    page = await lineagePageFor({
      CasebookLineage, WikiPage, hostPageId: id(hostPage), userId: memberId
    });
  }
  const held = uniqueRoles(roles.length ? roles : ['observe']);
  if (!held.length) throw new LivingTeamError('Name a role this case understands.', 400, 'invalid_role');
  const existing = list(team.members).find((member) => id(member.userId) === memberId && !member.revokedAt);
  const seat = {
    userId: memberId,
    pageId: id(page) || id(memberPageId),
    label: safeLabel(label || page?.judgment?.ownerLabel, ''),
    roles: held.includes('observe') ? held : ['observe', ...held],
    mandate: { exposure: 'least' },
    grantedAt: actedAt,
    grantedBy: id(userId)
  };
  if (existing) {
    existing.roles = seat.roles;
    existing.pageId = seat.pageId || existing.pageId;
    existing.label = seat.label || existing.label;
    existing.grantedAt = actedAt;
    existing.grantedBy = id(userId);
  } else {
    team.members.push(seat);
  }
  const receipt = await persistReceipt({
    NoeisReceipt,
    userId,
    kind: 'living_team_role_granted',
    title: 'A right was named',
    summary: `${seat.label || 'A reader'} may ${held.join(', ')} on this case.`,
    page: hostPage,
    requestId,
    action: 'grant',
    extra: { at: actedAt, memberUserId: memberId, roles: seat.roles }
  });
  team.audit.push(auditLine({
    actorId: id(userId),
    action: 'grant',
    summary: `${seat.label || 'A reader'} was named to ${held.join(', ')}.`,
    receiptId: receipt?.id,
    at: actedAt
  }));
  team.markModified?.('members');
  team.markModified?.('audit');
  if (typeof team.save === 'function') await team.save();
  const view = await readTeam({ WikiPage, CaseTeam, userId, pageId });
  return { team: view, receipt, seat };
};

const revokeSeat = async ({
  WikiPage, CaseTeam, NoeisReceipt, userId, pageId, memberUserId, requestId = '', now = () => new Date()
} = {}) => {
  requireModels({ WikiPage, CaseTeam });
  const actedAt = now();
  const { hostPage, team } = await requireAdminister({
    WikiPage, CaseTeam, userId, pageId, now: actedAt
  });
  const member = list(team.members).find((row) => id(row.userId) === id(memberUserId) && !row.revokedAt);
  if (!member) throw new LivingTeamError('That reader is not in this room.', 404, 'not_found');
  if (id(member.userId) === id(hostPage.userId)) {
    throw new LivingTeamError('The author’s seat is not revoked. Hand the case on instead.', 409, 'host_seat');
  }
  member.revokedAt = actedAt;
  const receipt = await persistReceipt({
    NoeisReceipt,
    userId,
    kind: 'living_team_role_revoked',
    title: 'A right was lifted',
    summary: `${safeLabel(member.label, 'A reader')} no longer sits in this room.`,
    page: hostPage,
    requestId,
    action: 'revoke',
    extra: { at: actedAt, memberUserId: memberUserId }
  });
  team.audit.push(auditLine({
    actorId: id(userId),
    action: 'revoke',
    summary: `${safeLabel(member.label, 'A reader')} left the overlay. Their page is untouched.`,
    receiptId: receipt?.id,
    at: actedAt
  }));
  team.markModified?.('members');
  team.markModified?.('audit');
  if (typeof team.save === 'function') await team.save();
  return { team: await readTeam({ WikiPage, CaseTeam, userId, pageId }), receipt };
};

const approveVersion = async ({
  WikiPage, CaseTeam, NoeisReceipt, userId, pageId, conditions = '', requestId = '', now = () => new Date()
} = {}) => {
  requireModels({ WikiPage, CaseTeam });
  const actedAt = now();
  const located = await locateTeam({ WikiPage, CaseTeam, pageId, userId });
  const { page } = located;
  let { hostPage, team } = located;
  if (!team) {
    if (id(page.userId) !== id(userId)) {
      throw new LivingTeamError('This case does not name you to observe.', 403, 'forbidden');
    }
    team = await ensureTeam({ CaseTeam, hostPage: page, now: actedAt });
    hostPage = page;
  }
  const actor = seatFor(plain(team), userId, hostPage);
  const authority = authorityAt(actor, 'approve', team.mandate);
  if (!authority.allowed) throw new LivingTeamError(authority.label, 403, 'forbidden');
  const objectPage = page;
  const hash = positionVersion(objectPage);
  team.approvals = supersedeApprovals(list(team.approvals), hash);
  const receiptRow = approvalReceipt({
    actor: { userId, label: actor.label },
    authority,
    object: { kind: 'position', pageId: id(objectPage), versionHash: hash },
    conditions,
    at: actedAt
  });
  team.approvals.push(receiptRow);
  const stored = await persistReceipt({
    NoeisReceipt,
    userId,
    kind: 'living_team_approval',
    title: 'A version was approved',
    summary: authority.label,
    page: hostPage,
    requestId,
    action: 'approve',
    extra: {
      at: actedAt,
      versionHash: hash,
      conditions: clean(conditions, 800),
      authority: authority.source
    }
  });
  team.audit.push(auditLine({
    actorId: id(userId),
    action: 'approve',
    summary: `${actor.label || 'A signer'} approved this version.`,
    receiptId: stored?.id || receiptRow.receiptId,
    at: actedAt
  }));
  team.markModified?.('approvals');
  team.markModified?.('audit');
  if (typeof team.save === 'function') await team.save();
  return {
    team: await readTeam({ WikiPage, CaseTeam, userId, pageId }),
    receipt: stored,
    approval: receiptRow
  };
};

const handOffCase = async ({
  WikiPage, CaseTeam, CasebookLineage, NoeisReceipt,
  userId, pageId, toUserId, toPageId = '', toLabel = '', requestId = '', now = () => new Date()
} = {}) => {
  requireModels({ WikiPage, CaseTeam });
  const actedAt = now();
  const { hostPage, team, actor } = await requireAdminister({
    WikiPage, CaseTeam, userId, pageId, now: actedAt
  });
  const successorId = id(toUserId);
  if (!successorId) throw new LivingTeamError('Name who receives this case.', 400, 'member_required');
  let successorPage = null;
  if (id(toPageId)) {
    successorPage = await loadPage(WikiPage, id(toPageId));
    if (!successorPage || id(successorPage.userId) !== successorId) {
      throw new LivingTeamError('The successor’s page must stay theirs.', 422, 'page_not_theirs');
    }
  } else {
    successorPage = await lineagePageFor({
      CasebookLineage, WikiPage, hostPageId: id(hostPage), userId: successorId
    });
  }
  const pagesById = await pagesFor(WikiPage, team, hostPage);
  const fromPosition = overlayPosition({
    member: actor,
    page: hostPage,
    viewer: actor,
    caseMandate: team.mandate
  });
  const members = list(team.members).filter((row) => !row.revokedAt).map((member) => overlayPosition({
    member,
    page: pagesById[id(member.pageId)] || (id(member.pageId) === id(hostPage) ? hostPage : null),
    viewer: actor,
    caseMandate: team.mandate
  })).filter(Boolean);
  const walk = handoffWalk({
    from: actor,
    to: {
      userId: successorId,
      pageId: id(successorPage) || id(toPageId),
      label: safeLabel(toLabel || successorPage?.judgment?.ownerLabel, '')
    },
    fromPosition,
    dissent: overlayDissent(members),
    at: actedAt
  });
  const existing = list(team.members).find((row) => id(row.userId) === successorId && !row.revokedAt);
  if (existing) {
    existing.roles = uniqueRoles([...existing.roles, 'administer']);
    existing.pageId = walk.to.pageId || existing.pageId;
    existing.label = walk.to.label || existing.label;
  } else {
    team.members.push({
      userId: successorId,
      pageId: walk.to.pageId,
      label: walk.to.label,
      roles: ['administer'],
      mandate: { exposure: 'least' },
      grantedAt: actedAt,
      grantedBy: id(userId)
    });
  }
  team.handoffs.push(walk);
  const stored = await persistReceipt({
    NoeisReceipt,
    userId,
    kind: 'living_team_handoff',
    title: 'The case was handed on',
    summary: `${walk.from.label} handed posture, rights, questions, dissent, and triggers to ${walk.to.label || 'a successor'}.`,
    page: hostPage,
    requestId,
    action: 'handoff',
    extra: { at: actedAt, toUserId: successorId, fromPageId: id(hostPage), toPageId: walk.to.pageId }
  });
  team.audit.push(auditLine({
    actorId: id(userId),
    action: 'handoff',
    summary: stored?.summary || 'The case was handed on. Departed authorship is intact.',
    receiptId: stored?.id,
    at: actedAt
  }));
  team.markModified?.('members');
  team.markModified?.('handoffs');
  team.markModified?.('audit');
  if (typeof team.save === 'function') await team.save();
  return {
    team: await readTeam({ WikiPage, CaseTeam, userId, pageId }),
    walk,
    receipt: stored
  };
};

const setMandate = async ({
  WikiPage, CaseTeam, NoeisReceipt, userId, pageId, purpose = '', exposure = 'least',
  allowed = [], denied = [], requestId = '', now = () => new Date()
} = {}) => {
  requireModels({ WikiPage, CaseTeam });
  const actedAt = now();
  const { hostPage, team } = await requireAdminister({
    WikiPage, CaseTeam, userId, pageId, now: actedAt
  });
  team.mandate = {
    purpose: clean(purpose, 400),
    exposure: ['least', 'authored', 'full'].includes(String(exposure)) ? exposure : 'least',
    allowed: list(allowed),
    denied: list(denied)
  };
  const receipt = await persistReceipt({
    NoeisReceipt,
    userId,
    kind: 'living_team_mandate',
    title: 'The case mandate moved',
    summary: team.mandate.purpose || 'Least-exposure remains the default.',
    page: hostPage,
    requestId,
    action: 'mandate',
    extra: { at: actedAt, exposure: team.mandate.exposure }
  });
  team.audit.push(auditLine({
    actorId: id(userId),
    action: 'mandate',
    summary: team.mandate.purpose || 'The mandate was named.',
    receiptId: receipt?.id,
    at: actedAt
  }));
  team.markModified?.('mandate');
  team.markModified?.('audit');
  if (typeof team.save === 'function') await team.save();
  return { team: await readTeam({ WikiPage, CaseTeam, userId, pageId }), receipt };
};

module.exports = {
  LivingTeamError,
  approveVersion,
  grantSeat,
  handOffCase,
  readTeam,
  revokeSeat,
  setMandate
};
