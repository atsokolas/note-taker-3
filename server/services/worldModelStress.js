/**
 * Stage 6 — World-model stress tests.
 *
 * Tracing paper over the assumptions, not a dashboard of gauges. Each
 * scenario names what it turned. Generated ink is labeled. The human
 * chooses whether posture changes. Provenance and uncertainty stay visible.
 */

const KINDS = Object.freeze(['alternative_future', 'counterevidence', 'base_rate']);
const CHOICES = Object.freeze(['keep', 'change']);
const POSTURES = Object.freeze(['investigate', 'watch', 'act', 'avoid', 'no_action', 'closed']);

class WorldModelStressError extends Error {
  constructor(message, code = 'invalid_scenario') {
    super(message);
    this.name = 'WorldModelStressError';
    this.code = code;
  }
}

const clean = (value = '', limit = 400) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};
const list = (value) => (Array.isArray(value) ? value : []);
const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const iso = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const assumptionsOf = (page = {}) => list(page?.judgment?.assumptions).map((row, index) => ({
  id: idOf(row.id || row.assumptionId) || `assumption:${index}`,
  text: clean(row.text || row, 400)
})).filter((row) => row.text);

const draftScenario = ({
  page,
  kind = 'alternative_future',
  modifiedAssumptions = [],
  generated = true,
  proposedPosture = '',
  uncertainty = '',
  provenance = {},
  now = new Date()
} = {}) => {
  if (!KINDS.includes(String(kind || ''))) {
    throw new WorldModelStressError('Name the stress as an alternative future, counterevidence, or a changed base rate.');
  }
  const named = list(modifiedAssumptions).map((row) => ({
    id: idOf(row.id),
    from: clean(row.from, 400),
    to: clean(row.to, 400)
  })).filter((row) => row.from || row.to);
  if (!named.length) {
    throw new WorldModelStressError('A scenario must name the assumption it turns.');
  }
  const posture = POSTURES.includes(String(proposedPosture || '')) ? proposedPosture : '';
  return {
    kind,
    generated: Boolean(generated),
    generatedLabel: generated ? 'Generated. Not yet a decision.' : 'Written by you.',
    modifiedAssumptions: named,
    proposedPosture: posture,
    uncertainty: clean(uncertainty, 400) || 'Hypothetical. The live case is unchanged until you choose.',
    provenance: {
      source: clean(provenance.source, 240),
      at: iso(provenance.at || now),
      labeled: true
    },
    choice: null,
    chosenAt: null,
    createdAt: iso(now)
  };
};

const choosePosture = (scenario, { choice, now = new Date() } = {}) => {
  if (!scenario) throw new WorldModelStressError('There is no tracing paper to choose.');
  if (!CHOICES.includes(String(choice || ''))) {
    throw new WorldModelStressError('Keep the live posture, or change it. The paper does not choose.');
  }
  return {
    ...scenario,
    choice,
    chosenAt: iso(now),
    liveChanged: choice === 'change'
  };
};

const overlayLine = (scenario, page = {}) => {
  const claim = clean(page?.judgment?.currentJudgment || page?.title, 240);
  const turned = list(scenario?.modifiedAssumptions)
    .map((row) => row.to || row.from)
    .filter(Boolean)
    .join('; ');
  if (!turned) return '';
  if (scenario.kind === 'counterevidence') {
    return `If ${turned}, the held sentence is pressed.`;
  }
  if (scenario.kind === 'base_rate') {
    return `If the base rate is ${turned}, ${claim || 'this sentence'} is read again.`;
  }
  return `If ${turned}, ${claim || 'this sentence'} is read on tracing paper.`;
};

const serializeOverlay = (scenarios = [], page = {}) => {
  const rows = list(scenarios).map((row) => ({
    ...row,
    generatedLabel: row.generated ? 'Generated. Not yet a decision.' : (row.generatedLabel || 'Written by you.'),
    line: overlayLine(row, page)
  }));
  return {
    live: {
      claim: clean(page?.judgment?.currentJudgment, 8000),
      assumptions: assumptionsOf(page),
      posture: clean(page?.judgment?.decisionPosture, 40)
    },
    sheets: rows,
    silent: rows.length === 0
  };
};

module.exports = {
  CHOICES,
  KINDS,
  POSTURES,
  WorldModelStressError,
  assumptionsOf,
  choosePosture,
  draftScenario,
  overlayLine,
  serializeOverlay
};
