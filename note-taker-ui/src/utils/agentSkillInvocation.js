const clean = (value) => String(value || '').trim();

const OUTPUT_GUIDANCE = {
  summary_brief: 'Return a compact brief with the core claim, strongest support, tensions, and what to do next.',
  critique_brief: 'Return the main weak spots, hidden assumptions, counterarguments, and what evidence would change your mind.',
  question_set: 'Return 3 to 7 concrete follow-up questions ordered by leverage.',
  connection_map: 'Return the most relevant related concepts, notes, questions, or tensions and explain why each connection matters.',
  note_draft: 'Return a draft note with a clear title and a structured body that is ready for a human to refine.',
  concept_draft: 'Return a draft concept with a name, one-sentence thesis, why it matters, and the best starting evidence.',
  handoff_draft: 'Return a draft handoff with objective, success criteria, checklist, suggested actor, and what the receiving agent should produce.',
  research_brief_draft: 'Return a research brief with an executive frame, strongest evidence, tensions, and the next questions to investigate.',
  synthesis_doc_draft: 'Return a synthesis document with a core thesis, supporting signals, tensions, and the next actions needed to strengthen it.',
  slide_outline_draft: 'Return a slide-ready outline with a title, narrative arc, and a clear purpose for each slide.',
  gap_report: 'Return the biggest missing concepts, missing evidence, contradictions, and the next highest-value work.',
  duplicate_report: 'Return the overlapping notes, concepts, or questions that look duplicated, and say whether they should be merged, linked, or left separate.',
  stale_summary_report: 'Return the summaries or descriptions that look stale, why they no longer match the evidence, and what should replace them.',
  contradiction_report: 'Return the strongest contradictions or tensions, what is conflicting, and the next work needed to resolve each one.',
  concept_candidate_report: 'Return the most compelling next concept candidates, why each matters, and the evidence that justifies creating them.',
  missing_link_report: 'Return the most important missing links in the workspace, why each link matters, and the concrete linking actions to take next.',
  concept_health_report: 'Return a concept health scan covering what is strong, what is fragile, what lacks evidence or links, and the repairs to prioritize.',
  workspace_hygiene_report: 'Return a workspace hygiene summary with overall state, cleanup priorities, drift risks, and the next maintenance pass to run.',
  concept_network_report: 'Return a concept network scan covering isolated nodes, overloaded hubs, weak bridges, and the structural repairs to prioritize.',
  recurring_hygiene_report: 'Return a recurring hygiene summary with cadence, focus areas, maintenance sequence, and the next recurring pass to run.'
};

const describeFocus = ({
  contextType = '',
  contextTitle = '',
  selectionText = ''
} = {}) => {
  const safeTitle = clean(contextTitle);
  const safeType = clean(contextType) || 'workspace';
  const safeSelection = clean(selectionText);
  if (safeSelection) {
    return safeTitle ? `the selected passage from ${safeTitle}` : 'the selected passage';
  }
  if (safeTitle) return safeTitle;
  return `this ${safeType}`;
};

export const buildAgentSkillPrompt = (skill = {}, {
  contextType = '',
  contextTitle = '',
  selectionText = ''
} = {}) => {
  const focus = describeFocus({ contextType, contextTitle, selectionText });
  const lines = [
    clean(skill?.instruction),
    '',
    `Work against ${focus}. Keep the result draft-first, explicit, and useful.`,
    OUTPUT_GUIDANCE[clean(skill?.outputType)] || 'Return a crisp draft that a human can refine or promote.'
  ].filter(Boolean);

  if (clean(contextTitle)) {
    lines.push('', `Context title: ${clean(contextTitle)}`);
  }

  if (clean(contextType)) {
    lines.push(`Context type: ${clean(contextType)}`);
  }

  if (clean(selectionText)) {
    lines.push('', 'Selected text:', `"""${clean(selectionText).slice(0, 1400)}"""`);
  }

  return lines.join('\n');
};

export const buildQueuedAgentSkillPrompt = (skill = {}, {
  contextType = '',
  contextId = '',
  contextTitle = '',
  selectionText = '',
  mode = 'submit'
} = {}) => ({
  id: `${clean(skill?.id) || 'skill'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  prompt: buildAgentSkillPrompt(skill, { contextType, contextTitle, selectionText }),
  mode,
  contextType: clean(contextType),
  contextId: clean(contextId),
  skillId: clean(skill?.id),
  skillTitle: clean(skill?.title),
  outputType: clean(skill?.outputType),
  workerRole: clean(skill?.workerRole),
  workflow: skill?.workflow && typeof skill.workflow === 'object' ? {
    id: clean(skill.workflow.id),
    label: clean(skill.workflow.label),
    track: clean(skill.workflow.track),
    cadence: clean(skill.workflow.cadence),
    loop: Boolean(skill.workflow.loop),
    steps: Array.isArray(skill.workflow.steps) ? skill.workflow.steps.map((step) => clean(step)).filter(Boolean) : [],
    nextSkills: Array.isArray(skill.workflow.nextSkills)
      ? skill.workflow.nextSkills.map((nextSkill) => ({
          id: clean(nextSkill?.id),
          title: clean(nextSkill?.title),
          workerRole: clean(nextSkill?.workerRole),
          outputType: clean(nextSkill?.outputType),
          instruction: clean(nextSkill?.instruction)
        })).filter((nextSkill) => nextSkill.id && nextSkill.title)
      : []
  } : null
});
