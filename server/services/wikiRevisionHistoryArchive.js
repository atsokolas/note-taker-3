const { serialize, deserialize } = require('bson');
const { gzipSync, gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');

const FIELD = 'snapshotHistoryArchive';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const decode = bytes => deserialize(bytes, { promoteLongs: false });
const clone = value => decode(serialize(value));

// Only claim histories move. All queryable snapshot fields and identities stay
// in place; the compressed payload remains in the same Mongo document.
const packRevisionHistories = revision => {
  if (revision[FIELD]) throw new Error('Revision histories are already archived');
  const packed = clone(revision);
  const histories = {};
  for (const side of ['before', 'after']) {
    const claims = packed[side]?.claims;
    if (!Array.isArray(claims)) continue;
    histories[side] = claims.map(claim => {
      const claimId = String(claim.claimId || claim._id || '');
      if (!Object.prototype.hasOwnProperty.call(claim, 'history')) return { claimId, present: false };
      const history = claim.history;
      // Keep the key position: legacy receipt hashes use JSON property order.
      claim.history = null;
      return { claimId, present: true, history };
    });
  }
  const bytes = serialize(histories);
  packed[FIELD] = { version: 1, sha256: digest(bytes), bytes: bytes.length,
    data: gzipSync(bytes, { level: 9 }).toString('base64') };
  return packed;
};

const unpackRevisionHistories = revision => {
  const archive = revision[FIELD];
  if (!archive) return revision;
  if (archive.version !== 1 || !Number.isSafeInteger(archive.bytes)
    || archive.bytes < 0 || archive.bytes > 32 * 1024 * 1024) throw new Error('Invalid revision history archive');
  const bytes = gunzipSync(Buffer.from(archive.data, 'base64'), { maxOutputLength: 32 * 1024 * 1024 });
  if (bytes.length !== archive.bytes || digest(bytes) !== archive.sha256) throw new Error('Revision history archive integrity failure');
  const histories = decode(bytes);
  const unpacked = clone(revision);
  for (const side of ['before', 'after']) {
    if (!histories[side]) continue;
    const claims = unpacked[side]?.claims;
    if (!Array.isArray(claims) || claims.length !== histories[side].length) throw new Error('Revision history archive claim binding mismatch');
    histories[side].forEach((entry, index) => {
      if (entry.claimId !== String(claims[index].claimId || claims[index]._id || '')) throw new Error('Revision history archive claim identity mismatch');
      if (entry.present) claims[index].history = entry.history;
    });
  }
  delete unpacked[FIELD];
  return unpacked;
};

const pickTree = (value, tree) => {
  if (tree === true || value == null) return value;
  if (Array.isArray(value)) return value.map(item => pickTree(item, tree));
  if (typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(tree).filter(([key]) => key in value)
    .map(([key, child]) => [key, pickTree(value[key], child)]));
};
const omitPath = (value, [key, ...rest]) => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach(item => omitPath(item, [key, ...rest]));
  if (!rest.length) delete value[key];
  else omitPath(value[key], rest);
};
const projectSnapshots = (row, projection = {}) => {
  const entries = Object.entries(projection).filter(([key]) => key !== '_id' && key !== FIELD);
  const inclusive = entries.some(([, value]) => value === 1 || value === true);
  for (const side of ['before', 'after']) {
    if (inclusive) {
      if (projection[side]) continue;
      const paths = entries.filter(([key, value]) => value && key.startsWith(`${side}.`));
      if (!paths.length) { delete row[side]; continue; }
      const tree = {};
      for (const [key] of paths) {
        const parts = key.split('.').slice(1);
        let node = tree;
        parts.forEach((part, index) => {
          if (index === parts.length - 1) node[part] = true;
          else node = node[part] ||= {};
        });
      }
      row[side] = pickTree(row[side], tree);
    } else {
      for (const [key, value] of entries) {
        if (!value && (key === side || key.startsWith(`${side}.`))) omitPath(row, key.split('.'));
      }
    }
  }
  return row;
};

// Archives are opt-in operator writes. Existing and new unarchived revisions
// retain their representation. Metadata-only queries never fetch the archive.
const revisionHistoryArchivePlugin = schema => {
  schema.add({ [FIELD]: { type: Object, default: undefined, select: false } });
  const projectionKey = Symbol('snapshotProjection');
  schema.pre(['find', 'findOne', 'findOneAndUpdate'], function () {
    const original = Object.fromEntries(Object.entries(this.projection() || {}).map(([key, value]) =>
      key.startsWith('-') ? [key.slice(1), 0] : [key, value]));
    const inclusive = Object.entries(original).some(([key, value]) => key !== '_id' && Boolean(value));
    if (Object.keys(original).length === 1 && original._id === 1) return;
    // Judgment/briefing projections that do not request histories can use the
    // stored fields directly. Never inflate a tiny summary query into full reads.
    const snapshots = !inclusive || Object.keys(original).some(key =>
      /^(before|after)(\.claims(\.history(\.|$).*)?)?$/.test(key));
    if (!snapshots) return;
    for (const [key, value] of Object.entries(original)) {
      if (/^(before|after)(\.|$)/.test(key) && ![0, 1, true, false].includes(value)) {
        throw new Error('Expression projections are unsupported for archived snapshots');
      }
    }
    this[projectionKey] = original;
    const expanded = Object.fromEntries(Object.entries(original).filter(([key]) => !/^(before|after)(\.|$)/.test(key)));
    if (inclusive) Object.assign(expanded, { before: 1, after: 1, [FIELD]: 1 });
    else expanded[`+${FIELD}`] = 1;
    this.projection(expanded);
  });
  schema.post(['find', 'findOne', 'findOneAndUpdate'], function (result) {
    if (!this[projectionKey]) return;
    for (const row of Array.isArray(result) ? result : [result]) {
      if (!row) continue;
      const data = row._doc || row;
      const archived = Boolean(data[FIELD]);
      const restored = projectSnapshots(archived ? unpackRevisionHistories(data) : data, this[projectionKey]);
      for (const side of ['before', 'after']) {
        if (Object.prototype.hasOwnProperty.call(restored, side)) data[side] = restored[side];
        else delete data[side];
      }
      delete data[FIELD];
      if (archived && row.$locals) row.$locals.archivedRevisionHistories = true;
    }
  });
  schema.pre('save', function () {
    if (this.$locals.archivedRevisionHistories && (this.isModified('before') || this.isModified('after'))) {
      throw new Error('Archived revision snapshots are immutable; create a new revision');
    }
  });
  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
    const update = this.getUpdate() || {};
    if (update.$set?.before === null && update.$set?.after === null) {
      update.$unset = { ...update.$unset, [FIELD]: 1 };
    } else if (Object.values(update).some(fields => fields && typeof fields === 'object'
      && Object.keys(fields).some(key => /^(before|after)(\.|$)/.test(key)))) {
      throw new Error('Revision snapshots are immutable; create a new revision');
    }
  });
};

module.exports = { FIELD, packRevisionHistories, unpackRevisionHistories, projectSnapshots, revisionHistoryArchivePlugin };
