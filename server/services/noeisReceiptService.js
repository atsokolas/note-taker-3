const clean = (value = '') => String(value || '').trim();

const toDate = (value = null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const sanitizeTouched = (value = []) => (
  (Array.isArray(value) ? value : [])
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const type = clean(entry.type);
      const id = clean(entry.id);
      const title = clean(entry.title);
      if (!type || !id) return null;
      return { type, id, title };
    })
    .filter(Boolean)
    .slice(0, 24)
);

const sanitizeReceiptForStorage = (receipt = {}) => {
  if (!receipt || typeof receipt !== 'object') return null;
  const receiptId = clean(receipt.id || receipt.receiptId);
  const kind = clean(receipt.kind);
  const source = clean(receipt.source);
  const sourceLabel = clean(receipt.sourceLabel || receipt.sourceLabelOverride || receipt.source);
  const status = clean(receipt.status) || 'completed';
  const completedAt = toDate(receipt.completedAt || receipt.createdAt || new Date());
  if (!receiptId || !kind || !source || !completedAt) return null;
  return {
    receiptId,
    kind,
    source,
    sourceLabel,
    status,
    title: clean(receipt.title),
    summary: clean(receipt.summary),
    metrics: receipt.metrics && typeof receipt.metrics === 'object' ? receipt.metrics : {},
    touched: sanitizeTouched(receipt.touched),
    nextAction: receipt.nextAction && typeof receipt.nextAction === 'object' ? receipt.nextAction : null,
    provenance: receipt.provenance && typeof receipt.provenance === 'object' ? receipt.provenance : null,
    error: receipt.error && typeof receipt.error === 'object' ? receipt.error : null,
    createdAtExternal: toDate(receipt.createdAt),
    completedAt
  };
};

const serializeStoredReceipt = (doc = {}) => {
  if (!doc) return null;
  const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: clean(raw.receiptId || raw.id),
    kind: clean(raw.kind),
    source: clean(raw.source),
    sourceLabel: clean(raw.sourceLabel || raw.source),
    status: clean(raw.status) || 'completed',
    title: clean(raw.title),
    summary: clean(raw.summary),
    metrics: raw.metrics && typeof raw.metrics === 'object' ? raw.metrics : {},
    touched: sanitizeTouched(raw.touched),
    nextAction: raw.nextAction && typeof raw.nextAction === 'object' ? raw.nextAction : null,
    provenance: raw.provenance && typeof raw.provenance === 'object' ? raw.provenance : null,
    error: raw.error && typeof raw.error === 'object' ? raw.error : null,
    createdAt: raw.createdAtExternal || raw.createdAt || null,
    completedAt: raw.completedAt || raw.updatedAt || null
  };
};

const persistNoeisReceipt = async ({
  NoeisReceipt,
  userId = '',
  receipt = null,
  session = null
} = {}) => {
  if (!NoeisReceipt || !userId) return null;
  const safeReceipt = sanitizeReceiptForStorage(receipt);
  if (!safeReceipt) return null;
  const updated = await NoeisReceipt.findOneAndUpdate(
    { userId, receiptId: safeReceipt.receiptId },
    { $set: { ...safeReceipt, userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) }
  );
  return serializeStoredReceipt(updated);
};

module.exports = {
  persistNoeisReceipt,
  sanitizeReceiptForStorage,
  serializeStoredReceipt
};
