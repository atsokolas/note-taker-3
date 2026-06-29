const clean = (value) => String(value || '').trim();

export const resolveOperationRationale = (operation = {}) => {
  const preview = operation?.preview && typeof operation.preview === 'object' ? operation.preview : {};
  const payload = operation?.payload && typeof operation.payload === 'object' ? operation.payload : {};
  const candidates = [
    preview.classificationReason,
    preview.classificationRationale,
    preview.rationale,
    preview.reason,
    payload.classificationReason,
    payload.classificationRationale,
    payload.rationale,
    payload.reason
  ];
  for (const candidate of candidates) {
    const safe = clean(candidate);
    if (safe) return safe;
  }
  return '';
};

const SOURCE_QUALITY_LABELS = {
  strong: 'Strong signal',
  thin: 'Thin source',
  needs_review: 'Needs review',
  needsreview: 'Needs review'
};

export const resolveSourceQualityKey = (operation = {}) => {
  const preview = operation?.preview && typeof operation.preview === 'object' ? operation.preview : {};
  const payload = operation?.payload && typeof operation.payload === 'object' ? operation.payload : {};
  const raw = clean(
    preview.sourceQuality
    || preview.quality
    || preview.qualityLabel
    || payload.sourceQuality
    || payload.quality
    || payload.qualityLabel
  ).toLowerCase();
  if (!raw) return '';
  return raw.replace(/\s+/g, '_').replace(/-/g, '_');
};

export const resolveSourceQualityLabel = (operation = {}) => {
  const key = resolveSourceQualityKey(operation);
  if (!key) return '';
  if (SOURCE_QUALITY_LABELS[key]) return SOURCE_QUALITY_LABELS[key];
  return key
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
};

const readPreviewPayloadValue = (operation = {}, keys = []) => {
  const preview = operation?.preview && typeof operation.preview === 'object' ? operation.preview : {};
  const payload = operation?.payload && typeof operation.payload === 'object' ? operation.payload : {};
  for (const key of keys) {
    const candidate = preview[key] ?? payload[key];
    if (candidate !== undefined && candidate !== null && clean(candidate)) return candidate;
  }
  return '';
};

export const resolveOperationEvidence = (operation = {}) => {
  const evidence = [];
  const confidenceRaw = readPreviewPayloadValue(operation, ['confidence', 'classificationConfidence']);
  const confidence = Number(confidenceRaw);
  if (Number.isFinite(confidence) && confidence > 0) {
    evidence.push(`${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}% confidence`);
  }

  const highlightRaw = readPreviewPayloadValue(operation, ['highlightCount', 'highlights']);
  const highlightCount = Number(highlightRaw);
  if (Number.isFinite(highlightCount) && highlightCount >= 0) {
    evidence.push(`${highlightCount} ${highlightCount === 1 ? 'highlight' : 'highlights'}`);
  }

  const method = clean(readPreviewPayloadValue(operation, ['classificationMethod', 'method']));
  if (method) {
    evidence.push(method === 'llm' ? 'agent classified' : `${method.replace(/_/g, ' ')} classified`);
  }

  return evidence;
};

export const isSelectableStructureOperation = (operation = {}) => {
  if (operation?.isActionable === false) return false;
  const status = clean(operation?.status).toLowerCase();
  return ['pending', 'approved', 'rejected'].includes(status);
};

export const getSelectableStructureOperations = (operations = []) => (
  (Array.isArray(operations) ? operations : []).filter(isSelectableStructureOperation)
);

export const buildBulkOperationStatusUpdates = ({
  operations = [],
  selectedOpIds = [],
  nextStatus = ''
} = {}) => {
  const safeStatus = clean(nextStatus).toLowerCase();
  const selected = new Set(
    (Array.isArray(selectedOpIds) ? selectedOpIds : [])
      .map((value) => clean(value))
      .filter(Boolean)
  );
  if (!safeStatus || selected.size === 0) return [];

  return (Array.isArray(operations) ? operations : [])
    .filter((operation) => selected.has(clean(operation?.opId)))
    .map((operation) => ({
      opId: clean(operation?.opId),
      status: safeStatus
    }))
    .filter((entry) => entry.opId);
};
