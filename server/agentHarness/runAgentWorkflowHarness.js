const fs = require('fs/promises');
const path = require('path');

const { chatComplete, getConfig } = require('../ai/hfTextClient');
const { WORKFLOW_SPECS } = require('./workflowSpecs');
const { validateWorkflowOutput, parseJson } = require('./validators');
const { buildServiceDraftForHarnessResult } = require('./serviceAdapters');
const {
  applyFixtureSetToSpecs,
  getAvailableFixtureSets,
  normalizeFixtureSet
} = require('./fixtureSets');
const {
  executeControlledWriteForHarnessResult,
  normalizeWriteMode,
  WRITE_MODES
} = require('./controlledWrites');

const clean = (value) => String(value || '').trim();

const CONTRACT_SCHEMAS = Object.freeze({
  linked_material_set: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'title', 'reason'],
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            reason: { type: 'string' }
          }
        }
      }
    }
  },
  critique_brief: {
    type: 'object',
    additionalProperties: false,
    required: ['thesis', 'weakAssumptions', 'missingEvidence', 'nextTest'],
    properties: {
      thesis: { type: 'string' },
      weakAssumptions: { type: 'array', items: { type: 'string' } },
      missingEvidence: { type: 'array', items: { type: 'string' } },
      nextTest: { type: 'string' }
    }
  },
  proposed_content_change: {
    type: 'object',
    additionalProperties: false,
    required: ['target', 'changeType', 'title', 'proposedBody', 'rationale'],
    properties: {
      target: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'title'],
        properties: {
          type: { type: 'string' },
          title: { type: 'string' }
        }
      },
      changeType: { type: 'string' },
      title: { type: 'string' },
      proposedBody: { type: 'string' },
      rationale: { type: 'string' }
    }
  },
  artifact_draft: {
    type: 'object',
    additionalProperties: false,
    required: ['artifactType', 'title', 'body', 'citations'],
    properties: {
      artifactType: { type: 'string' },
      title: { type: 'string' },
      body: { type: 'string' },
      citations: { type: 'array', items: { type: 'string' } }
    }
  },
  structure_proposal: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'summary', 'riskLevel', 'operations'],
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
      operations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'title', 'requiresApproval'],
          properties: {
            type: { type: 'string', enum: ['create_folder', 'move_item', 'rename_folder', 'merge_folder', 'delete_folder'] },
            title: { type: 'string' },
            requiresApproval: { type: 'boolean', enum: [true] }
          }
        }
      }
    }
  },
  question_set_handoff: {
    type: 'object',
    additionalProperties: false,
    required: ['questions', 'handoff'],
    properties: {
      questions: { type: 'array', items: { type: 'string' } },
      handoff: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'successCriteria'],
        properties: {
          title: { type: 'string' },
          successCriteria: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  },
  hygiene_report: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'staleItems', 'missingLinks', 'contradictions', 'nextActions'],
    properties: {
      summary: { type: 'string' },
      staleItems: { type: 'array', items: { type: 'string' } },
      missingLinks: { type: 'array', items: { type: 'string' } },
      contradictions: { type: 'array', items: { type: 'string' } },
      nextActions: { type: 'array', items: { type: 'string' } }
    }
  },
  inline_draft_suggestion: {
    type: 'object',
    additionalProperties: false,
    required: ['insertionPoint', 'suggestedText', 'rationale'],
    properties: {
      insertionPoint: { type: 'string' },
      suggestedText: { type: 'string' },
      rationale: { type: 'string' }
    }
  },
  working_memory_update: {
    type: 'object',
    additionalProperties: false,
    required: ['updates', 'writeMode'],
    properties: {
      updates: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'text'],
          properties: {
            type: { type: 'string', enum: ['current_focus', 'open_question', 'next_move'] },
            text: { type: 'string' }
          }
        }
      },
      writeMode: { type: 'string', enum: ['commit'] }
    }
  }
});

const buildResponseFormat = (contract) => {
  const schema = CONTRACT_SCHEMAS[contract];
  if (!schema) return null;
  return {
    type: 'json_schema',
    json_schema: {
      name: contract,
      strict: true,
      schema
    }
  };
};

const formatFixture = (fixture = {}) => (
  Object.entries(fixture)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(' | ') : JSON.stringify(value)}`)
    .join('\n')
);

const buildQualityInstruction = (spec = {}) => {
  const quality = spec.quality && typeof spec.quality === 'object' ? spec.quality : {};
  const instructions = [];
  if (Number(quality.minItems || 0) > 0) {
    instructions.push(`Return at least ${Number(quality.minItems)} items.`);
  }
  if (Array.isArray(quality.allowedOperationTypes) && quality.allowedOperationTypes.length > 0) {
    instructions.push(`Allowed operation types: ${quality.allowedOperationTypes.join(', ')}.`);
  }
  if (Array.isArray(quality.requiredUpdateTypes) && quality.requiredUpdateTypes.length > 0) {
    instructions.push(`Return one update for each required type: ${quality.requiredUpdateTypes.join(', ')}.`);
  }
  return instructions.join(' ');
};

const buildMessages = (spec) => {
  const responseInstruction = spec.outputContract === 'chat_response'
    ? 'Return a concise grounded chat answer. Do not mention hidden reasoning.'
    : `Return only JSON matching the ${spec.outputContract} contract.`;
  const safetyInstruction = spec.outputContract === 'structure_proposal'
    ? 'For structure proposals, every operation must set requiresApproval to true; never propose direct mutation. Operation type must be exactly create_folder, move_item, rename_folder, merge_folder, or delete_folder. Use create_folder for folder creation and move_item for moving notes. Do not invent workflow labels such as next_move.'
    : '';
  const qualityInstruction = buildQualityInstruction(spec);
  return [
    {
      role: 'system',
      content: [
        'You are an agent workflow evaluator for a private knowledge workspace.',
        'Use only the provided fixture.',
        'Do not invent sources, titles, or facts.',
        responseInstruction,
        safetyInstruction,
        qualityInstruction
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        `Workflow: ${spec.title}`,
        `User request: ${spec.userRequest}`,
        'Fixture:',
        formatFixture(spec.fixture)
      ].join('\n')
    }
  ];
};

const normalizeOutput = (output) => (
  typeof output === 'string' ? output : JSON.stringify(output)
);

const runMockWorkflow = async (spec) => {
  const startedAt = Date.now();
  const validation = validateWorkflowOutput({
    contract: spec.outputContract,
    output: spec.mockOutput,
    quality: spec.quality
  });
  return {
    id: spec.id,
    title: spec.title,
    route: spec.route,
    outputContract: spec.outputContract,
    fixtureSet: spec.fixtureSet || 'synthetic',
    mode: 'mock',
    ok: validation.ok,
    latencyMs: Date.now() - startedAt,
    model: 'mock',
    provider: 'local',
    validation,
    output: spec.mockOutput
  };
};

const runLiveWorkflow = async (spec) => {
  const startedAt = Date.now();
  const responseFormat = buildResponseFormat(spec.outputContract);
  const config = getConfig();
  const routeCandidates = Array.isArray(config.routeProfiles?.[spec.route]) && config.routeProfiles[spec.route].length > 0
    ? config.routeProfiles[spec.route]
    : [{ model: config.model, provider: config.provider }];
  const attempts = [];
  let lastResult = null;

  for (const candidate of routeCandidates) {
    const completion = await chatComplete({
      modelRoutes: [candidate],
      messages: buildMessages(spec),
      temperature: 0.1,
      maxTokens: spec.outputContract === 'chat_response' ? 180 : 620,
      reasoningEffort: spec.route === 'deep_audit' ? 'medium' : 'low',
      responseFormat
    });
    const rawOutput = normalizeOutput(completion.text);
    const output = responseFormat ? parseJson(rawOutput) || rawOutput : rawOutput;
    const validation = validateWorkflowOutput({
      contract: spec.outputContract,
      output,
      quality: spec.quality
    });
    const result = {
      id: spec.id,
      title: spec.title,
      route: spec.route,
      outputContract: spec.outputContract,
      fixtureSet: spec.fixtureSet || 'synthetic',
      mode: 'live',
      ok: validation.ok,
      latencyMs: Date.now() - startedAt,
      model: completion.model,
      provider: completion.provider,
      validation,
      output,
      attempts
    };
    attempts.push({
      model: completion.model,
      provider: completion.provider,
      ok: validation.ok,
      message: validation.message || ''
    });
    lastResult = result;
    if (validation.ok) return result;
  }

  return lastResult;
};

const summarizeResults = (results = []) => {
  const safeResults = Array.isArray(results) ? results : [];
  const passed = safeResults.filter((result) => result.ok).length;
  const controlledWrites = safeResults
    .map((result) => result.controlledWrite)
    .filter(Boolean);
  return {
    total: safeResults.length,
    passed,
    failed: safeResults.length - passed,
    passRate: safeResults.length ? Number((passed / safeResults.length).toFixed(4)) : 0,
    controlledWrites: {
      total: controlledWrites.length,
      written: controlledWrites.filter((write) => write.written).length,
      skipped: controlledWrites.filter((write) => write.skipped).length,
      failed: controlledWrites.filter((write) => write.ok === false).length
    },
    failures: safeResults
      .filter((result) => !result.ok)
      .map((result) => ({
        id: result.id,
        route: result.route,
        message: result.validation?.message || 'Unknown failure'
      }))
  };
};

const formatMarkdownSummary = ({ results = [], summary = {}, mode = '' } = {}) => {
  const fixtureSet = clean(summary.fixtureSet) || clean(results?.[0]?.fixtureSet) || 'synthetic';
  const lines = [
    `# Agent Harness Run (${mode}, ${fixtureSet})`,
    '',
    `- Fixture set: ${fixtureSet}`,
    `- Total: ${summary.total || 0}`,
    `- Passed: ${summary.passed || 0}`,
    `- Failed: ${summary.failed || 0}`,
    `- Pass rate: ${summary.passRate || 0}`,
    '',
    '| Workflow | Route | Model | Provider | Latency | Status |',
    '|---|---|---|---|---:|---|'
  ];
  (Array.isArray(results) ? results : []).forEach((result) => {
    lines.push([
      clean(result.id),
      clean(result.route),
      clean(result.model) || 'n/a',
      clean(result.provider) || 'n/a',
      Number(result.latencyMs || 0),
      result.ok ? 'pass' : `fail: ${clean(result.validation?.message)}`
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  });
  if (Array.isArray(summary.failures) && summary.failures.length > 0) {
    lines.push('', '## Failures', '');
    summary.failures.forEach((failure) => {
      lines.push(`- ${failure.id} (${failure.route}): ${failure.message}`);
    });
  }
  return `${lines.join('\n')}\n`;
};

const writeResults = async ({ results, summary, mode, fixtureSet = 'synthetic', outputDir = 'tmp/agent-harness-runs' }) => {
  const absoluteDir = path.resolve(process.cwd(), outputDir);
  await fs.mkdir(absoluteDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(absoluteDir, `${stamp}-${mode}.json`);
  const markdownPath = path.join(absoluteDir, `${stamp}-${mode}.md`);
  await fs.writeFile(
    filePath,
    JSON.stringify({ mode, fixtureSet, summary: { ...summary, fixtureSet }, results }, null, 2),
    'utf8'
  );
  await fs.writeFile(markdownPath, formatMarkdownSummary({ results, summary: { ...summary, fixtureSet }, mode }), 'utf8');
  return { filePath, markdownPath };
};

const runAgentWorkflowHarness = async ({
  mode = 'mock',
  workflowIds = [],
  fixtureSet = process.env.AGENT_HARNESS_FIXTURE_SET || 'synthetic',
  outputDir = 'tmp/agent-harness-runs',
  integrationDryRun = false,
  integrationOptions = {},
  controlledWriteMode = WRITE_MODES.DRY_RUN,
  writeApproved = false,
  serviceModels = {}
} = {}) => {
  const normalizedFixtureSet = normalizeFixtureSet(fixtureSet);
  const normalizedWriteMode = normalizeWriteMode(controlledWriteMode);
  const selectedIds = new Set((Array.isArray(workflowIds) ? workflowIds : []).map(clean).filter(Boolean));
  const baseSpecs = selectedIds.size > 0
    ? WORKFLOW_SPECS.filter((spec) => selectedIds.has(spec.id))
    : WORKFLOW_SPECS;
  const specs = applyFixtureSetToSpecs(baseSpecs, normalizedFixtureSet);
  const runner = mode === 'live' ? runLiveWorkflow : runMockWorkflow;
  const results = [];
  for (const spec of specs) {
    try {
      results.push(await runner(spec));
    } catch (error) {
      results.push({
        id: spec.id,
        title: spec.title,
        route: spec.route,
        outputContract: spec.outputContract,
        fixtureSet: spec.fixtureSet || normalizedFixtureSet,
        mode,
        ok: false,
        latencyMs: 0,
        model: '',
        provider: '',
        validation: {
          ok: false,
          message: error?.payload?.message || error?.message || 'Workflow run failed'
        },
        output: null
      });
    }
  }
  if (integrationDryRun || normalizedWriteMode !== WRITE_MODES.DRY_RUN) {
    for (const result of results) {
      if (!result.ok) continue;
      const draft = buildServiceDraftForHarnessResult(result, integrationOptions);
      if (draft) result.serviceDraft = draft;
      if (normalizedWriteMode !== WRITE_MODES.DRY_RUN) {
        try {
          result.controlledWrite = {
            ok: true,
            ...(await executeControlledWriteForHarnessResult({
              result,
              models: serviceModels,
              options: integrationOptions,
              writeMode: normalizedWriteMode,
              approved: writeApproved
            }))
          };
        } catch (error) {
          result.controlledWrite = {
            ok: false,
            mode: normalizedWriteMode,
            approved: Boolean(writeApproved),
            message: error?.message || 'Controlled write failed.'
          };
        }
      }
    }
  }
  const summary = {
    ...summarizeResults(results),
    fixtureSet: normalizedFixtureSet
  };
  const { filePath, markdownPath } = await writeResults({
    results,
    summary,
    mode,
    fixtureSet: normalizedFixtureSet,
    outputDir
  });
  return { mode, fixtureSet: normalizedFixtureSet, summary, results, filePath, markdownPath };
};

module.exports = {
  WORKFLOW_SPECS,
  buildMessages,
  buildResponseFormat,
  getAvailableFixtureSets,
  formatMarkdownSummary,
  runAgentWorkflowHarness,
  summarizeResults
};
