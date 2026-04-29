const SKILLS = Object.freeze([
  {
    id: 'summarize',
    title: 'Summarize',
    summary: 'Distill the current material into the key claim, supporting signals, and next moves.',
    category: 'understand',
    workerRole: 'synthesizer',
    outputType: 'summary_brief',
    surfaces: ['article', 'selection', 'notebook', 'question', 'concept', 'workspace'],
    contextTypes: ['article', 'selection', 'notebook', 'question', 'concept', 'think'],
    instruction: 'Summarize this material in a way that helps me decide what matters next.',
    priority: 10
  },
  {
    id: 'challenge',
    title: 'Challenge',
    summary: 'Pressure-test the current idea and point out weak assumptions, missing evidence, and blind spots.',
    category: 'critique',
    workerRole: 'critic',
    outputType: 'critique_brief',
    surfaces: ['article', 'selection', 'notebook', 'question', 'concept', 'workspace'],
    contextTypes: ['article', 'selection', 'notebook', 'question', 'concept', 'think'],
    instruction: 'Challenge this material. Surface weak assumptions, conflicting interpretations, and what is still unproven.',
    priority: 20
  },
  {
    id: 'extract_questions',
    title: 'Extract questions',
    summary: 'Pull out the highest-leverage questions implied by the current material.',
    category: 'explore',
    workerRole: 'researcher',
    outputType: 'question_set',
    surfaces: ['article', 'selection', 'notebook', 'concept', 'workspace'],
    contextTypes: ['article', 'selection', 'notebook', 'concept', 'think'],
    instruction: 'Extract the most leverage-heavy open questions from this material.',
    priority: 30
  },
  {
    id: 'find_connections',
    title: 'Find connections',
    summary: 'Find related concepts, notes, tensions, and useful adjacent material in the workspace.',
    category: 'connect',
    workerRole: 'organizer',
    outputType: 'connection_map',
    surfaces: ['article', 'selection', 'notebook', 'question', 'concept', 'workspace'],
    contextTypes: ['article', 'selection', 'notebook', 'question', 'concept', 'think'],
    instruction: 'Find the strongest connections this material should have to the rest of the workspace.',
    priority: 40
  },
  {
    id: 'draft_note',
    title: 'Draft note',
    summary: 'Turn the current material into a draft note with a strong title and structured body.',
    category: 'draft',
    workerRole: 'editor',
    outputType: 'note_draft',
    surfaces: ['article', 'selection', 'concept', 'question', 'workspace'],
    contextTypes: ['article', 'selection', 'concept', 'question', 'think'],
    instruction: 'Draft a note from this material. Keep it structured, readable, and ready for a human to refine.',
    priority: 50
  },
  {
    id: 'turn_into_concept',
    title: 'Turn into concept',
    summary: 'Draft a concept candidate with a name, thesis, why it matters, and starting evidence.',
    category: 'draft',
    workerRole: 'synthesizer',
    outputType: 'concept_draft',
    surfaces: ['article', 'selection', 'notebook', 'question', 'workspace'],
    contextTypes: ['article', 'selection', 'notebook', 'question', 'think'],
    instruction: 'Turn this material into a draft concept candidate.',
    priority: 60
  },
  {
    id: 'draft_question',
    title: 'Draft question',
    summary: 'Turn the current material into a sharp open question that can guide further work.',
    category: 'draft',
    workerRole: 'researcher',
    outputType: 'question_draft',
    surfaces: ['article', 'selection', 'notebook', 'concept', 'workspace'],
    contextTypes: ['article', 'selection', 'notebook', 'concept', 'think'],
    instruction: 'Turn this material into one sharp draft question worth carrying forward.',
    priority: 65
  },
  {
    id: 'turn_into_handoff',
    title: 'Turn into handoff',
    summary: 'Draft a delegable handoff with objective, success criteria, checklist, and suggested actor.',
    category: 'delegate',
    workerRole: 'planner',
    outputType: 'handoff_draft',
    surfaces: ['article', 'selection', 'notebook', 'question', 'concept', 'workspace'],
    contextTypes: ['article', 'selection', 'notebook', 'question', 'concept', 'think', 'thread', 'handoff'],
    instruction: 'Turn this material into a draft handoff that an agent could execute.',
    priority: 70
  },
  {
    id: 'draft_research_brief',
    title: 'Draft research brief',
    summary: 'Produce a concise research brief with what matters, supporting evidence, tensions, and the next questions.',
    category: 'output',
    workerRole: 'researcher',
    outputType: 'research_brief_draft',
    surfaces: ['article', 'selection', 'notebook', 'question', 'concept', 'workspace'],
    contextTypes: ['article', 'selection', 'notebook', 'question', 'concept', 'think'],
    instruction: 'Draft a research brief from this material. Make it compact, readable, and useful for the next round of work.',
    workflow: {
      id: 'research_brief_flow',
      label: 'Research brief flow',
      track: 'output',
      cadence: 'on_demand',
      loop: false,
      steps: [
        'Frame the focus and why it matters.',
        'Collect the strongest supporting evidence.',
        'Preserve tensions and unresolved questions.',
        'Name the next moves for the workspace.'
      ],
      nextSkills: [
        {
          id: 'draft_synthesis_doc',
          title: 'Build synthesis doc',
          workerRole: 'synthesizer',
          outputType: 'synthesis_doc_draft',
          instruction: 'Draft a synthesis document from this material. Pull together the core argument, the strongest support, and what still needs to be resolved.'
        },
        {
          id: 'draft_slide_outline',
          title: 'Shape slide outline',
          workerRole: 'editor',
          outputType: 'slide_outline_draft',
          instruction: 'Draft a slide-ready outline from this material. Give it a clean narrative arc and make every slide earn its place.'
        },
        {
          id: 'turn_into_handoff',
          title: 'Delegate next pass',
          workerRole: 'planner',
          outputType: 'handoff_draft',
          instruction: 'Turn this material into a draft handoff that an agent could execute.'
        }
      ]
    },
    priority: 72
  },
  {
    id: 'draft_synthesis_doc',
    title: 'Draft synthesis doc',
    summary: 'Turn the current material into a synthesis document with a central thesis, supporting signals, and unresolved tensions.',
    category: 'output',
    workerRole: 'synthesizer',
    outputType: 'synthesis_doc_draft',
    surfaces: ['article', 'notebook', 'question', 'concept', 'workspace'],
    contextTypes: ['article', 'notebook', 'question', 'concept', 'think'],
    instruction: 'Draft a synthesis document from this material. Pull together the core argument, the strongest support, and what still needs to be resolved.',
    workflow: {
      id: 'synthesis_doc_flow',
      label: 'Synthesis flow',
      track: 'output',
      cadence: 'on_demand',
      loop: false,
      steps: [
        'State the central thesis clearly.',
        'Assemble the strongest supporting signals.',
        'Preserve contradictions and unresolved tensions.',
        'Define the next actions needed to strengthen the case.'
      ],
      nextSkills: [
        {
          id: 'draft_slide_outline',
          title: 'Turn into presentation arc',
          workerRole: 'editor',
          outputType: 'slide_outline_draft',
          instruction: 'Draft a slide-ready outline from this material. Give it a clean narrative arc and make every slide earn its place.'
        },
        {
          id: 'challenge',
          title: 'Pressure-test thesis',
          workerRole: 'critic',
          outputType: 'critique_brief',
          instruction: 'Challenge this material. Surface weak assumptions, conflicting interpretations, and what is still unproven.'
        },
        {
          id: 'turn_into_handoff',
          title: 'Delegate strengthening pass',
          workerRole: 'planner',
          outputType: 'handoff_draft',
          instruction: 'Turn this material into a draft handoff that an agent could execute.'
        }
      ]
    },
    priority: 74
  },
  {
    id: 'draft_slide_outline',
    title: 'Draft slide outline',
    summary: 'Prepare a slide-ready outline with a story arc, section beats, and what each slide should prove.',
    category: 'output',
    workerRole: 'editor',
    outputType: 'slide_outline_draft',
    surfaces: ['article', 'notebook', 'question', 'concept', 'workspace'],
    contextTypes: ['article', 'notebook', 'question', 'concept', 'think'],
    instruction: 'Draft a slide-ready outline from this material. Give it a clean narrative arc and make every slide earn its place.',
    workflow: {
      id: 'slide_outline_flow',
      label: 'Presentation flow',
      track: 'output',
      cadence: 'on_demand',
      loop: false,
      steps: [
        'Choose the audience and the decision frame.',
        'Set a narrative arc that earns attention.',
        'Sequence the evidence and tensions slide by slide.',
        'End on the ask, recommendation, or next move.'
      ],
      nextSkills: [
        {
          id: 'draft_research_brief',
          title: 'Backfill research brief',
          workerRole: 'researcher',
          outputType: 'research_brief_draft',
          instruction: 'Draft a research brief from this material. Make it compact, readable, and useful for the next round of work.'
        },
        {
          id: 'draft_synthesis_doc',
          title: 'Deepen narrative backbone',
          workerRole: 'synthesizer',
          outputType: 'synthesis_doc_draft',
          instruction: 'Draft a synthesis document from this material. Pull together the core argument, the strongest support, and what still needs to be resolved.'
        },
        {
          id: 'turn_into_handoff',
          title: 'Delegate deck production',
          workerRole: 'planner',
          outputType: 'handoff_draft',
          instruction: 'Turn this material into a draft handoff that an agent could execute.'
        }
      ]
    },
    priority: 76
  },
  {
    id: 'identify_gaps',
    title: 'Identify gaps',
    summary: 'Spot missing concepts, missing evidence, unresolved contradictions, and next research edges.',
    category: 'maintain',
    workerRole: 'planner',
    outputType: 'gap_report',
    surfaces: ['article', 'notebook', 'question', 'concept', 'workspace'],
    contextTypes: ['article', 'notebook', 'question', 'concept', 'think'],
    instruction: 'Identify the most important gaps in this material and what should happen next to close them.',
    workflow: {
      id: 'gap_scan_flow',
      label: 'Gap scan loop',
      track: 'maintenance',
      cadence: 'recurring',
      loop: true,
      steps: [
        'Trace the most obvious missing evidence, concepts, and open loops.',
        'Rank which gaps are structural versus incidental.',
        'Name the next move that would close the highest-value gap.',
        'Decide whether the result should become maintenance, synthesis, or a delegated pass.'
      ],
      nextSkills: [
        {
          id: 'suggest_next_concepts',
          title: 'Propose concept candidates',
          workerRole: 'organizer',
          outputType: 'concept_candidate_report',
          instruction: 'Suggest the next concept candidates this material implies. Name each candidate, explain why it matters, and show the evidence that supports creating it.'
        },
        {
          id: 'draft_workspace_hygiene_summary',
          title: 'Stage hygiene summary',
          workerRole: 'planner',
          outputType: 'workspace_hygiene_report',
          instruction: 'Draft a workspace hygiene summary. Explain the current state of the workspace, the main cleanup priorities, the biggest risks of drift, and the next maintenance pass to run.'
        },
        {
          id: 'turn_into_handoff',
          title: 'Delegate the gap-closing pass',
          workerRole: 'planner',
          outputType: 'handoff_draft',
          instruction: 'Turn this material into a draft handoff that an agent could execute.'
        }
      ]
    },
    priority: 80
  },
  {
    id: 'find_duplicates',
    title: 'Find duplicates',
    summary: 'Detect overlapping notes, repeated concepts, and parallel questions that should probably be merged or cross-linked.',
    category: 'maintain',
    workerRole: 'organizer',
    outputType: 'duplicate_report',
    surfaces: ['notebook', 'question', 'concept', 'workspace'],
    contextTypes: ['notebook', 'question', 'concept', 'think'],
    instruction: 'Find duplicate or overlapping material here. Call out what appears repeated, why it is duplicated, and whether it should be merged, linked, or left separate.',
    workflow: {
      id: 'duplicate_cleanup_flow',
      label: 'Duplicate cleanup loop',
      track: 'maintenance',
      cadence: 'recurring',
      loop: true,
      steps: [
        'Find overlapping notes, concepts, and questions.',
        'Separate true duplicates from healthy parallel views.',
        'Recommend merge, link, or leave-alone actions.',
        'Capture the cleanup pass as an explicit workspace move.'
      ],
      nextSkills: [
        {
          id: 'trace_missing_links',
          title: 'Link what should stay separate',
          workerRole: 'organizer',
          outputType: 'missing_link_report',
          instruction: 'Trace the most important missing links in this material. Show what should be connected, why the connection matters, and the highest-value linking actions.'
        },
        {
          id: 'draft_workspace_hygiene_summary',
          title: 'Roll into hygiene pass',
          workerRole: 'planner',
          outputType: 'workspace_hygiene_report',
          instruction: 'Draft a workspace hygiene summary. Explain the current state of the workspace, the main cleanup priorities, the biggest risks of drift, and the next maintenance pass to run.'
        }
      ]
    },
    priority: 82
  },
  {
    id: 'scan_stale_summaries',
    title: 'Scan stale summaries',
    summary: 'Find summaries, descriptions, and working frames that no longer match the current evidence.',
    category: 'maintain',
    workerRole: 'critic',
    outputType: 'stale_summary_report',
    surfaces: ['notebook', 'concept', 'workspace'],
    contextTypes: ['notebook', 'concept', 'think'],
    instruction: 'Scan for stale summaries or descriptions. Point out where the current framing no longer matches the evidence or linked material.',
    workflow: {
      id: 'stale_summary_flow',
      label: 'Framing refresh loop',
      track: 'maintenance',
      cadence: 'recurring',
      loop: true,
      steps: [
        'Compare current summaries to the freshest supporting material.',
        'Call out where the framing drifted or flattened nuance.',
        'Rewrite the sharper frame that should replace it.',
        'Hand off the refresh into synthesis or hygiene follow-up.'
      ],
      nextSkills: [
        {
          id: 'draft_synthesis_doc',
          title: 'Rebuild the synthesis frame',
          workerRole: 'synthesizer',
          outputType: 'synthesis_doc_draft',
          instruction: 'Draft a synthesis document from this material. Pull together the core argument, the strongest support, and what still needs to be resolved.'
        },
        {
          id: 'draft_workspace_hygiene_summary',
          title: 'Capture refresh priorities',
          workerRole: 'planner',
          outputType: 'workspace_hygiene_report',
          instruction: 'Draft a workspace hygiene summary. Explain the current state of the workspace, the main cleanup priorities, the biggest risks of drift, and the next maintenance pass to run.'
        }
      ]
    },
    priority: 84
  },
  {
    id: 'scan_contradictions',
    title: 'Scan contradictions',
    summary: 'Surface claims, notes, or questions that disagree with each other or pull the workspace in different directions.',
    category: 'maintain',
    workerRole: 'critic',
    outputType: 'contradiction_report',
    surfaces: ['article', 'notebook', 'question', 'concept', 'workspace'],
    contextTypes: ['article', 'notebook', 'question', 'concept', 'think'],
    instruction: 'Scan for contradictions, tensions, or conflicting claims in this material. Explain the conflict, what might resolve it, and what should be investigated next.',
    workflow: {
      id: 'contradiction_resolution_flow',
      label: 'Contradiction resolution loop',
      track: 'maintenance',
      cadence: 'recurring',
      loop: true,
      steps: [
        'Surface the strongest contradictions and tensions.',
        'Name what evidence or reframing could resolve them.',
        'Preserve the unresolved tension instead of flattening it too early.',
        'Route the result into research, synthesis, or a delegated pass.'
      ],
      nextSkills: [
        {
          id: 'draft_research_brief',
          title: 'Research the tension',
          workerRole: 'researcher',
          outputType: 'research_brief_draft',
          instruction: 'Draft a research brief from this material. Make it compact, readable, and useful for the next round of work.'
        },
        {
          id: 'turn_into_handoff',
          title: 'Delegate contradiction follow-up',
          workerRole: 'planner',
          outputType: 'handoff_draft',
          instruction: 'Turn this material into a draft handoff that an agent could execute.'
        }
      ]
    },
    priority: 86
  },
  {
    id: 'suggest_next_concepts',
    title: 'Suggest next concepts',
    summary: 'Propose the next missing concepts or synthesis nodes the workspace should add.',
    category: 'maintain',
    workerRole: 'organizer',
    outputType: 'concept_candidate_report',
    surfaces: ['article', 'notebook', 'question', 'concept', 'workspace'],
    contextTypes: ['article', 'notebook', 'question', 'concept', 'think'],
    instruction: 'Suggest the next concept candidates this material implies. Name each candidate, explain why it matters, and show the evidence that supports creating it.',
    workflow: {
      id: 'concept_candidate_flow',
      label: 'Concept expansion loop',
      track: 'maintenance',
      cadence: 'recurring',
      loop: true,
      steps: [
        'Identify the missing concepts implied by the current material.',
        'Ground each candidate in saved evidence and unresolved questions.',
        'Choose which candidates should become explicit workspace objects.',
        'Route the strongest candidate into synthesis, draft, or handoff.'
      ],
      nextSkills: [
        {
          id: 'turn_into_concept',
          title: 'Stage a concept draft',
          workerRole: 'synthesizer',
          outputType: 'concept_draft',
          instruction: 'Turn this material into a draft concept candidate.'
        },
        {
          id: 'draft_synthesis_doc',
          title: 'Synthesize the new node',
          workerRole: 'synthesizer',
          outputType: 'synthesis_doc_draft',
          instruction: 'Draft a synthesis document from this material. Pull together the core argument, the strongest support, and what still needs to be resolved.'
        }
      ]
    },
    priority: 88
  },
  {
    id: 'trace_missing_links',
    title: 'Trace missing links',
    summary: 'Find the strongest notes, concepts, questions, and sources that should be linked but currently feel disconnected.',
    category: 'maintain',
    workerRole: 'organizer',
    outputType: 'missing_link_report',
    surfaces: ['article', 'notebook', 'question', 'concept', 'workspace'],
    contextTypes: ['article', 'notebook', 'question', 'concept', 'think'],
    instruction: 'Trace the most important missing links in this material. Show what should be connected, why the connection matters, and the highest-value linking actions.',
    workflow: {
      id: 'link_trace_flow',
      label: 'Link trace loop',
      track: 'maintenance',
      cadence: 'recurring',
      loop: true,
      steps: [
        'Spot disconnected notes, concepts, questions, and sources.',
        'Explain the relationship that should exist between them.',
        'Prioritize the links that would most reduce drift.',
        'Carry the result into concept health or hygiene follow-up.'
      ],
      nextSkills: [
        {
          id: 'scan_concept_network',
          title: 'Check network health',
          workerRole: 'organizer',
          outputType: 'concept_network_report',
          instruction: 'Scan the concept network. Call out isolated nodes, overloaded hubs, weak bridges, and the restructuring moves that would make the graph more useful.'
        },
        {
          id: 'draft_workspace_hygiene_summary',
          title: 'Capture linking pass',
          workerRole: 'planner',
          outputType: 'workspace_hygiene_report',
          instruction: 'Draft a workspace hygiene summary. Explain the current state of the workspace, the main cleanup priorities, the biggest risks of drift, and the next maintenance pass to run.'
        }
      ]
    },
    priority: 90
  },
  {
    id: 'scan_concept_network',
    title: 'Scan concept network',
    summary: 'Audit the concept graph for isolated nodes, overloaded hubs, weak bridges, and missing connective tissue.',
    category: 'maintain',
    workerRole: 'organizer',
    outputType: 'concept_network_report',
    surfaces: ['concept', 'workspace'],
    contextTypes: ['concept', 'think'],
    instruction: 'Scan the concept network. Call out isolated nodes, overloaded hubs, weak bridges, and the restructuring moves that would make the graph more useful.',
    workflow: {
      id: 'concept_network_flow',
      label: 'Concept network loop',
      track: 'maintenance',
      cadence: 'recurring',
      loop: true,
      steps: [
        'Map the active concept graph and its weak connective tissue.',
        'Identify isolated nodes, overloaded hubs, and missing bridges.',
        'Recommend the structural repairs that would improve retrieval and synthesis.',
        'Fold the result back into concept health and hygiene planning.'
      ],
      nextSkills: [
        {
          id: 'scan_concept_health',
          title: 'Inspect concept health',
          workerRole: 'critic',
          outputType: 'concept_health_report',
          instruction: 'Scan the health of these concepts. Call out what looks strong, what is fragile, what lacks evidence or links, and what should be repaired first.'
        },
        {
          id: 'draft_workspace_hygiene_summary',
          title: 'Schedule the repair pass',
          workerRole: 'planner',
          outputType: 'workspace_hygiene_report',
          instruction: 'Draft a workspace hygiene summary. Explain the current state of the workspace, the main cleanup priorities, the biggest risks of drift, and the next maintenance pass to run.'
        }
      ]
    },
    priority: 92
  },
  {
    id: 'scan_concept_health',
    title: 'Scan concept health',
    summary: 'Audit concept quality across clarity, evidence, tensions, freshness, and cross-link coverage.',
    category: 'maintain',
    workerRole: 'critic',
    outputType: 'concept_health_report',
    surfaces: ['concept', 'workspace'],
    contextTypes: ['concept', 'think'],
    instruction: 'Scan the health of these concepts. Call out what looks strong, what is fragile, what lacks evidence or links, and what should be repaired first.',
    workflow: {
      id: 'concept_health_flow',
      label: 'Concept health loop',
      track: 'maintenance',
      cadence: 'recurring',
      loop: true,
      steps: [
        'Evaluate clarity, evidence, tension, freshness, and link coverage.',
        'Separate healthy concepts from fragile ones.',
        'Name the repairs that would improve the weakest nodes fastest.',
        'Escalate the result into network repair, hygiene, or output work.'
      ],
      nextSkills: [
        {
          id: 'scan_concept_network',
          title: 'View the graph around it',
          workerRole: 'organizer',
          outputType: 'concept_network_report',
          instruction: 'Scan the concept network. Call out isolated nodes, overloaded hubs, weak bridges, and the restructuring moves that would make the graph more useful.'
        },
        {
          id: 'draft_synthesis_doc',
          title: 'Rebuild the strongest concept spine',
          workerRole: 'synthesizer',
          outputType: 'synthesis_doc_draft',
          instruction: 'Draft a synthesis document from this material. Pull together the core argument, the strongest support, and what still needs to be resolved.'
        },
        {
          id: 'draft_workspace_hygiene_summary',
          title: 'Capture repair priorities',
          workerRole: 'planner',
          outputType: 'workspace_hygiene_report',
          instruction: 'Draft a workspace hygiene summary. Explain the current state of the workspace, the main cleanup priorities, the biggest risks of drift, and the next maintenance pass to run.'
        }
      ]
    },
    priority: 94
  },
  {
    id: 'draft_workspace_hygiene_summary',
    title: 'Workspace hygiene summary',
    summary: 'Create an operating summary of workspace health, cleanup priorities, and the next maintenance pass.',
    category: 'maintain',
    workerRole: 'planner',
    outputType: 'workspace_hygiene_report',
    surfaces: ['notebook', 'question', 'concept', 'workspace'],
    contextTypes: ['notebook', 'question', 'concept', 'think'],
    instruction: 'Draft a workspace hygiene summary. Explain the current state of the workspace, the main cleanup priorities, the biggest risks of drift, and the next maintenance pass to run.',
    workflow: {
      id: 'workspace_hygiene_flow',
      label: 'Workspace hygiene loop',
      track: 'maintenance',
      cadence: 'recurring',
      loop: true,
      steps: [
        'Read the current workspace state and its structural drift.',
        'Choose the cleanup pass that would improve coherence fastest.',
        'Turn the repair pass into an explicit sequence, not a vague reminder.',
        'Hand off or continue the next maintenance cycle.'
      ],
      nextSkills: [
        {
          id: 'draft_recurring_hygiene_summary',
          title: 'Set the next recurring cycle',
          workerRole: 'planner',
          outputType: 'recurring_hygiene_report',
          instruction: 'Draft a recurring hygiene summary. Turn the current maintenance findings into a repeatable cycle with focus areas, cadence, and the next recurring pass.'
        },
        {
          id: 'turn_into_handoff',
          title: 'Delegate the cleanup pass',
          workerRole: 'planner',
          outputType: 'handoff_draft',
          instruction: 'Turn this material into a draft handoff that an agent could execute.'
        }
      ]
    },
    priority: 96
  },
  {
    id: 'draft_recurring_hygiene_summary',
    title: 'Recurring hygiene summary',
    summary: 'Turn current maintenance findings into a repeatable upkeep cycle with focus areas, cadence, and next recurring pass.',
    category: 'maintain',
    workerRole: 'planner',
    outputType: 'recurring_hygiene_report',
    surfaces: ['workspace'],
    contextTypes: ['think'],
    instruction: 'Draft a recurring hygiene summary. Turn the current maintenance findings into a repeatable cycle with focus areas, cadence, and the next recurring pass.',
    workflow: {
      id: 'recurring_hygiene_flow',
      label: 'Recurring upkeep loop',
      track: 'maintenance',
      cadence: 'recurring',
      loop: true,
      steps: [
        'Summarize the current maintenance state.',
        'Define the repeatable upkeep cadence and its focus areas.',
        'Set the next recurring pass and what it should repair.',
        'Keep the cycle connected to outputs, handoffs, and graph health.'
      ],
      nextSkills: [
        {
          id: 'scan_concept_network',
          title: 'Inspect graph drift again',
          workerRole: 'organizer',
          outputType: 'concept_network_report',
          instruction: 'Scan the concept network. Call out isolated nodes, overloaded hubs, weak bridges, and the restructuring moves that would make the graph more useful.'
        },
        {
          id: 'draft_workspace_hygiene_summary',
          title: 'Refresh the current hygiene read',
          workerRole: 'planner',
          outputType: 'workspace_hygiene_report',
          instruction: 'Draft a workspace hygiene summary. Explain the current state of the workspace, the main cleanup priorities, the biggest risks of drift, and the next maintenance pass to run.'
        }
      ]
    },
    priority: 98
  },
  {
    // Tool skill — when invoked, the agent runtime calls
    // POST /api/agent/tools/notion-fetch instead of generating prose. The
    // skill is exposed to the chat agent so users can say "fetch my Notion
    // pages" and have it execute. Per the PR #20 brief: user-triggered only,
    // skip-if-unchanged via Notion's last_edited_time, source tag + backlink.
    id: 'fetch_from_notion',
    title: 'Fetch from Notion',
    summary: 'Pull your Notion pages into Noeis as notebook entries. Skips pages that haven\'t changed since the last fetch.',
    category: 'integrate',
    workerRole: 'librarian',
    outputType: 'integration_fetch',
    surfaces: ['workspace', 'notebook', 'concept'],
    contextTypes: ['think', 'notebook', 'concept'],
    instruction: 'Fetch the user\'s Notion pages and import them into the notebook. Only refresh pages whose Notion last_edited_time has changed.',
    isToolSkill: true,
    toolName: 'notion_fetch',
    toolEndpoint: '/api/agent/tools/notion-fetch',
    priority: 99
  }
]);

const clean = (value) => String(value || '').trim().toLowerCase();

const matchesFilter = (values = [], query = '') => {
  if (!query) return true;
  const safeValues = Array.isArray(values) ? values : [];
  return safeValues.includes(query) || safeValues.includes('*');
};

const sanitizeWorkflow = (workflow = {}) => {
  const source = workflow && typeof workflow === 'object' ? workflow : {};
  return {
    id: String(source.id || '').trim(),
    label: String(source.label || '').trim(),
    track: String(source.track || '').trim(),
    cadence: String(source.cadence || '').trim(),
    loop: Boolean(source.loop),
    steps: Array.isArray(source.steps) ? source.steps.map((step) => String(step || '').trim()).filter(Boolean) : [],
    nextSkills: Array.isArray(source.nextSkills)
      ? source.nextSkills.map((skill) => ({
          id: String(skill?.id || '').trim(),
          title: String(skill?.title || '').trim(),
          workerRole: String(skill?.workerRole || '').trim(),
          outputType: String(skill?.outputType || '').trim(),
          instruction: String(skill?.instruction || '').trim()
        })).filter((skill) => skill.id && skill.title)
      : []
  };
};

const sanitizeSkill = (skill = {}) => ({
  id: String(skill.id || '').trim(),
  title: String(skill.title || '').trim(),
  summary: String(skill.summary || '').trim(),
  category: String(skill.category || '').trim(),
  workerRole: String(skill.workerRole || '').trim(),
  outputType: String(skill.outputType || '').trim(),
  instruction: String(skill.instruction || '').trim(),
  workflow: sanitizeWorkflow(skill.workflow),
  surfaces: Array.isArray(skill.surfaces) ? skill.surfaces : [],
  contextTypes: Array.isArray(skill.contextTypes) ? skill.contextTypes : [],
  // Tool-skill metadata. When isToolSkill is true, the agent runtime should
  // POST to toolEndpoint instead of running an LLM completion. Optional
  // fields — non-tool skills get false / empty strings.
  isToolSkill: Boolean(skill.isToolSkill),
  toolName: String(skill.toolName || '').trim(),
  toolEndpoint: String(skill.toolEndpoint || '').trim()
});

const listAgentSkills = ({
  surface = '',
  contextType = '',
  category = ''
} = {}) => {
  const safeSurface = clean(surface);
  const safeContextType = clean(contextType);
  const safeCategory = clean(category);

  return SKILLS
    .filter((skill) => matchesFilter(skill.surfaces, safeSurface))
    .filter((skill) => matchesFilter(skill.contextTypes, safeContextType))
    .filter((skill) => (!safeCategory || clean(skill.category) === safeCategory))
    .sort((left, right) => Number(left.priority || 0) - Number(right.priority || 0))
    .map(sanitizeSkill);
};

module.exports = {
  listAgentSkills
};
