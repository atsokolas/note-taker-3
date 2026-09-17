const clean = (value = '', limit = 4000) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const id = value => clean(value?._id || value?.id || value, 240);
const list = value => Array.isArray(value) ? value : [];
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const iso = value => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const readMany = async query => {
  if (!query) return [];
  const rows = typeof query.lean === 'function' ? await query.lean() : await query;
  return list(rows).map(plain);
};
const readOne = async query => {
  if (!query) return null;
  const row = typeof query.lean === 'function' ? await query.lean() : await query;
  return row ? plain(row) : null;
};

class JudgmentObservationLineageError extends Error {
  constructor(message, status = 400, code = 'JUDGMENT_LINEAGE_INVALID') {
    super(message);
    this.name = 'JudgmentObservationLineageError';
    this.status = status;
    this.code = code;
  }
}

const sourceDate = (event, key) => (
  event?.metadata?.[key]
  || event?.metadata?.provenance?.[key]
  || null
);

const serializeAccount = ({ event, member }) => ({
  sourceEventId: id(event),
  role: clean(member?.role, 24) || 'account',
  note: clean(member?.note, 600),
  title: clean(event?.title, 500),
  summary: clean(event?.summary, 2000),
  excerpt: clean(event?.text, 6000),
  url: clean(event?.url, 2000),
  sourceType: clean(event?.sourceType, 80),
  provider: clean(event?.provider, 120),
  sourceVersion: clean(member?.sourceVersion || event?.metadata?.sourceVersion, 240),
  observedAt: iso(sourceDate(event, 'observedAt')),
  publishedAt: iso(sourceDate(event, 'publishedAt')),
  availableAt: iso(sourceDate(event, 'availableAt')),
  sourceUpdatedAt: iso(event?.sourceUpdatedAt),
  recordedAt: iso(event?.createdAt)
});

const serializeFamily = ({ family, eventById }) => {
  const members = list(family?.members);
  const accounts = members.flatMap(member => {
    const event = eventById.get(id(member?.sourceEventId));
    return event ? [serializeAccount({ event, member })] : [];
  });
  return {
    familyId: clean(family?.familyId, 160),
    label: clean(family?.label, 500),
    status: clean(family?.status, 24),
    proposedBy: clean(family?.proposedBy, 24),
    acceptedAt: iso(family?.acceptedAt),
    version: Number(family?.__v) || 0,
    documentCount: members.length,
    accounts,
    unavailableCount: Math.max(0, members.length - accounts.length),
    partial: accounts.length !== members.length
  };
};

const normalizeMembers = members => {
  const seen = new Set();
  return list(members).flatMap(member => {
    const sourceEventId = id(member?.sourceEventId);
    if (!sourceEventId || seen.has(sourceEventId)) return [];
    seen.add(sourceEventId);
    return [{
      sourceEventId,
      role: ['origin', 'derivative', 'account', 'unknown'].includes(member?.role) ? member.role : 'account',
      note: clean(member?.note, 600),
      sourceVersion: clean(member?.sourceVersion, 240)
    }];
  });
};

const proposeObservationLineage = async ({
  JudgmentObservationLineage, WikiSourceEvent, userId, familyId, label, members, proposedBy = 'user'
} = {}) => {
  if (!JudgmentObservationLineage?.findOne || !JudgmentObservationLineage?.findOneAndUpdate || !WikiSourceEvent?.find) {
    throw new JudgmentObservationLineageError('Observation lineage is unavailable.', 503, 'JUDGMENT_LINEAGE_UNAVAILABLE');
  }
  const key = clean(familyId, 160);
  const normalized = normalizeMembers(members);
  if (!key || normalized.length < 2) {
    throw new JudgmentObservationLineageError('A lineage proposal needs an identity and at least two source events.');
  }
  const eventIds = normalized.map(member => member.sourceEventId);
  const ownedEvents = await readMany(WikiSourceEvent.find({ _id: { $in: eventIds }, userId }));
  if (new Set(ownedEvents.map(event => id(event))).size !== eventIds.length) {
    throw new JudgmentObservationLineageError('Every source event must belong to this owner.', 403, 'JUDGMENT_LINEAGE_SOURCE_FORBIDDEN');
  }
  const existing = await readOne(JudgmentObservationLineage.findOne({ userId, familyId: key }));
  if (existing && existing.status !== 'proposed') {
    throw new JudgmentObservationLineageError('Recorded lineage cannot be overwritten by a proposal.', 409, 'JUDGMENT_LINEAGE_RECORDED');
  }
  const family = await readOne(JudgmentObservationLineage.findOneAndUpdate(
    { userId, familyId: key, status: 'proposed' },
    {
      $set: {
        label: clean(label, 500),
        members: normalized,
        proposedBy: ['user', 'agent', 'system'].includes(proposedBy) ? proposedBy : 'agent'
      },
      $setOnInsert: { userId, familyId: key, status: 'proposed' }
    },
    { new: true, upsert: !existing, setDefaultsOnInsert: true }
  ));
  return { familyId: key, status: 'proposed', version: Number(family?.__v) || 0 };
};

const reviewObservationLineage = async ({
  JudgmentObservationLineage, userId, familyId, expectedVersion, action
} = {}) => {
  if (!JudgmentObservationLineage?.findOne || !JudgmentObservationLineage?.findOneAndUpdate) {
    throw new JudgmentObservationLineageError('Observation lineage is unavailable.', 503, 'JUDGMENT_LINEAGE_UNAVAILABLE');
  }
  const key = clean(familyId, 160);
  const nextStatus = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : '';
  if (!key || !nextStatus || !Number.isInteger(Number(expectedVersion)) || Number(expectedVersion) < 0) {
    throw new JudgmentObservationLineageError('A current proposal version and valid review action are required.');
  }
  const existing = await readOne(JudgmentObservationLineage.findOne({ userId, familyId: key }));
  if (!existing) throw new JudgmentObservationLineageError('Lineage proposal not found.', 404, 'JUDGMENT_LINEAGE_NOT_FOUND');
  if (existing.status === nextStatus) {
    return { familyId: key, status: nextStatus, version: Number(existing.__v) || 0 };
  }
  if (existing.status !== 'proposed' || Number(existing.__v || 0) !== Number(expectedVersion)) {
    throw new JudgmentObservationLineageError('This lineage proposal changed. Reopen it before recording.', 409, 'JUDGMENT_LINEAGE_STALE');
  }
  const now = new Date();
  const reviewed = await readOne(JudgmentObservationLineage.findOneAndUpdate(
    { userId, familyId: key, status: 'proposed', __v: Number(expectedVersion) },
    {
      $set: nextStatus === 'accepted'
        ? { status: nextStatus, acceptedAt: now, rejectedAt: null }
        : { status: nextStatus, rejectedAt: now, acceptedAt: null },
      $inc: { __v: 1 }
    },
    { new: true }
  ));
  if (!reviewed) throw new JudgmentObservationLineageError('This lineage proposal changed. Reopen it before recording.', 409, 'JUDGMENT_LINEAGE_STALE');
  return { familyId: key, status: nextStatus, version: Number(reviewed.__v) || Number(expectedVersion) + 1 };
};

const readObservationLineage = async ({
  JudgmentObservationLineage,
  WikiSourceEvent,
  userId,
  sourceEventId
} = {}) => {
  const eventId = id(sourceEventId);
  if (!eventId || !JudgmentObservationLineage?.find || !WikiSourceEvent?.find) {
    return { state: 'unknown', families: [], proposals: [] };
  }

  const families = await readMany(JudgmentObservationLineage.find({
    userId,
    'members.sourceEventId': eventId,
    status: { $in: ['accepted', 'proposed'] }
  }));
  if (!families.length) return { state: 'unknown', families: [], proposals: [] };

  const eventIds = Array.from(new Set(families.flatMap(family => (
    list(family?.members).map(member => id(member?.sourceEventId)).filter(Boolean)
  ))));
  const events = await readMany(WikiSourceEvent.find({ _id: { $in: eventIds }, userId }));
  const eventById = new Map(events.map(event => [id(event), event]));
  const accepted = families
    .filter(family => family.status === 'accepted')
    .map(family => serializeFamily({ family, eventById }));
  const proposals = families
    .filter(family => family.status === 'proposed')
    .map(family => serializeFamily({ family, eventById }));

  return {
    state: accepted.length > 1 ? 'mixed' : accepted.length === 1 ? 'accepted' : proposals.length ? 'proposed' : 'unknown',
    families: accepted,
    proposals
  };
};

module.exports = {
  JudgmentObservationLineageError,
  proposeObservationLineage,
  readObservationLineage,
  reviewObservationLineage,
  serializeAccount,
  serializeFamily
};
