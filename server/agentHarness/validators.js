const clean = (value) => String(value || '').trim();

const ANALYSIS_LEAKAGE_PATTERNS = [
  /^\s*the user wants/i,
  /^\s*i need to/i,
  /^\s*we need to/i,
  /^\s*let me/i,
  /evidence analysis\s*:/i,
  /the prompt asks/i
];

const parseJson = (value) => {
  if (value && typeof value === 'object') return value;
  const text = clean(value)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
};

const hasAnalysisLeakage = (value) => (
  ANALYSIS_LEAKAGE_PATTERNS.some((pattern) => pattern.test(clean(value)))
);

const issue = (message) => ({ ok: false, message });

const validateChatResponse = (output) => {
  const text = clean(output);
  if (text.length < 80) return issue('Chat response is too thin.');
  if (hasAnalysisLeakage(text)) return issue('Chat response leaks analysis/meta reasoning.');
  return { ok: true };
};

const requireArray = (obj, key) => {
  if (!Array.isArray(obj?.[key]) || obj[key].length === 0) return `${key} must be a non-empty array.`;
  return '';
};

const requireString = (obj, key) => {
  if (!clean(obj?.[key])) return `${key} must be a non-empty string.`;
  return '';
};

const validators = {
  chat_response: validateChatResponse,
  linked_material_set: (output, quality = {}) => {
    const obj = parseJson(output);
    if (!obj) return issue('Linked material set must be valid JSON.');
    const arrayError = requireArray(obj, 'items');
    if (arrayError) return issue(arrayError);
    const minItems = Number(quality.minItems || 0);
    if (minItems > 0 && obj.items.length < minItems) return issue(`Linked material set must include at least ${minItems} items.`);
    const badItem = obj.items.find((item) => !clean(item?.type) || !clean(item?.title) || !clean(item?.reason));
    if (badItem) return issue('Each linked item must include type, title, and reason.');
    return { ok: true };
  },
  critique_brief: (output) => {
    const obj = parseJson(output);
    if (!obj) return issue('Critique brief must be valid JSON.');
    const required = ['thesis', 'nextTest'];
    const missing = required.map((key) => requireString(obj, key)).find(Boolean);
    if (missing) return issue(missing);
    const weakError = requireArray(obj, 'weakAssumptions');
    if (weakError) return issue(weakError);
    const evidenceError = requireArray(obj, 'missingEvidence');
    if (evidenceError) return issue(evidenceError);
    return { ok: true };
  },
  proposed_content_change: (output) => {
    const obj = parseJson(output);
    if (!obj) return issue('Proposed content change must be valid JSON.');
    const missing = ['changeType', 'title', 'proposedBody', 'rationale'].map((key) => requireString(obj, key)).find(Boolean);
    if (missing) return issue(missing);
    if (!clean(obj?.target?.type) || !clean(obj?.target?.title)) return issue('Target must include type and title.');
    return { ok: true };
  },
  artifact_draft: (output) => {
    const obj = parseJson(output);
    if (!obj) return issue('Artifact draft must be valid JSON.');
    const missing = ['artifactType', 'title', 'body'].map((key) => requireString(obj, key)).find(Boolean);
    if (missing) return issue(missing);
    return { ok: true };
  },
  structure_proposal: (output, quality = {}) => {
    const obj = parseJson(output);
    if (!obj) return issue('Structure proposal must be valid JSON.');
    const missing = ['title', 'summary', 'riskLevel'].map((key) => requireString(obj, key)).find(Boolean);
    if (missing) return issue(missing);
    const operationsError = requireArray(obj, 'operations');
    if (operationsError) return issue(operationsError);
    const unsafeOperation = obj.operations.find((operation) => operation?.requiresApproval !== true);
    if (unsafeOperation) return issue('Every structure operation must require approval.');
    const allowedTypes = new Set(Array.isArray(quality.allowedOperationTypes) ? quality.allowedOperationTypes.map(clean).filter(Boolean) : []);
    if (allowedTypes.size > 0) {
      const unsupported = obj.operations.find((operation) => !allowedTypes.has(clean(operation?.type)));
      if (unsupported) return issue(`Unsupported structure operation type: ${clean(unsupported?.type) || 'unknown'}.`);
    }
    return { ok: true };
  },
  question_set_handoff: (output) => {
    const obj = parseJson(output);
    if (!obj) return issue('Question set/handoff must be valid JSON.');
    const questionsError = requireArray(obj, 'questions');
    if (questionsError) return issue(questionsError);
    if (!clean(obj?.handoff?.title) || !Array.isArray(obj?.handoff?.successCriteria)) {
      return issue('Handoff must include title and successCriteria.');
    }
    return { ok: true };
  },
  hygiene_report: (output) => {
    const obj = parseJson(output);
    if (!obj) return issue('Hygiene report must be valid JSON.');
    const missing = requireString(obj, 'summary');
    if (missing) return issue(missing);
    const nextActionsError = requireArray(obj, 'nextActions');
    if (nextActionsError) return issue(nextActionsError);
    return { ok: true };
  },
  inline_draft_suggestion: (output) => {
    const obj = parseJson(output);
    if (!obj) return issue('Inline draft suggestion must be valid JSON.');
    const missing = ['insertionPoint', 'suggestedText', 'rationale'].map((key) => requireString(obj, key)).find(Boolean);
    if (missing) return issue(missing);
    return { ok: true };
  },
  working_memory_update: (output, quality = {}) => {
    const obj = parseJson(output);
    if (!obj) return issue('Working memory update must be valid JSON.');
    const updatesError = requireArray(obj, 'updates');
    if (updatesError) return issue(updatesError);
    if (clean(obj.writeMode) !== 'commit') return issue('Memory steward must return writeMode=commit.');
    const badUpdate = obj.updates.find((update) => !clean(update?.type) || !clean(update?.text));
    if (badUpdate) return issue('Each memory update must include type and text.');
    const updateTypes = new Set(obj.updates.map((update) => clean(update?.type)));
    const missingType = (Array.isArray(quality.requiredUpdateTypes) ? quality.requiredUpdateTypes : [])
      .map(clean)
      .find((type) => type && !updateTypes.has(type));
    if (missingType) return issue(`Working memory update missing required type: ${missingType}.`);
    return { ok: true };
  }
};

const validateWorkflowOutput = ({ contract = '', output, quality = {} }) => {
  const validator = validators[contract];
  if (!validator) return issue(`Unknown output contract: ${contract}`);
  return validator(output, quality);
};

module.exports = {
  parseJson,
  validateWorkflowOutput,
  hasAnalysisLeakage
};
