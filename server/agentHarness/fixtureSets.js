const clone = (value) => JSON.parse(JSON.stringify(value));

const FIXTURE_SET_ALIASES = Object.freeze({
  synthetic: 'synthetic',
  default: 'synthetic',
  realistic: 'realistic',
  real: 'realistic'
});

const REALISTIC_WORKFLOW_FIXTURES = Object.freeze({
  thought_partner: {
    fixture: {
      activeType: 'concept',
      activeTitle: 'Reviewable research assistant',
      noteBody: [
        'I keep returning to the same idea: the assistant should help me think in the workspace, not just answer one-off questions.',
        'The hard part is trust. If the agent moves notes or rewrites concepts too aggressively, I stop using it.',
        'Maybe the product pattern is: ask, retrieve, challenge, draft, then stage changes.'
      ].join('\n'),
      relatedMaterial: [
        'Meeting note: Users liked proposed edits when they could inspect each change before applying it.',
        'Imported highlight: Personal knowledge tools fail when capture is easy but synthesis never happens.',
        'Workspace note: Library cleanup should be reversible and should explain why each item moved.'
      ],
      recentActivity: [
        'Renamed "AI summaries" to "Workspace agents".',
        'Rejected a direct note rewrite that removed uncertainty from the concept.'
      ]
    },
    mockOutput: 'The strongest claim is that trust is the control surface for agentic workspace help. The agent should not optimize for doing the most work automatically; it should optimize for staging useful thinking moves that the user can inspect. Clarify which actions are allowed to land directly, such as memory capture, and which actions must remain reviewable, such as moving notes, restructuring concepts, and rewriting claims.'
  },
  retrieval_partner: {
    fixture: {
      activeType: 'note',
      activeTitle: 'Trust boundary for workspace agents',
      noteBody: 'The assistant can retrieve, challenge, draft, and organize, but only some actions should write directly. The rest should be staged.',
      relatedMaterial: [
        'Concept: Reviewable changes are safer than silent mutations when meaning or structure changes.',
        'Research note: Users accept suggestions more often when the rationale names the source material.',
        'Old summary: The assistant summarizes articles into folders automatically.',
        'Question: Should memory updates be committed immediately or staged like structure proposals?'
      ],
      workspaceSignals: [
        'Folder drift: "AI summaries", "Workspace agents", and "Assistant UX" overlap.',
        'Unlinked note: "Accepted proposal patterns" has examples of trusted edits.'
      ]
    },
    mockOutput: {
      items: [
        { type: 'concept', title: 'Reviewable changes', reason: 'Directly supports the trust-boundary claim for edits that affect meaning or structure.' },
        { type: 'research_note', title: 'Accepted proposal patterns', reason: 'Adds evidence about why users accept suggestions when rationales cite source material.' },
        { type: 'question', title: 'Commit or stage memory updates?', reason: 'Challenges the current split between direct memory capture and reviewable workspace changes.' },
        { type: 'workspace_signal', title: 'Folder drift in assistant topics', reason: 'Shows where organization help is needed but should remain reversible.' }
      ]
    }
  },
  critic: {
    fixture: {
      activeType: 'concept',
      activeTitle: 'Agent writes into my thinking system',
      noteBody: 'The agent should write notes, add structure, organize the library, and challenge weak thinking. Review should keep the user in control.',
      relatedMaterial: [
        'Accepted edit: User approved a thesis rewrite because the diff preserved their unresolved question.',
        'Rejected edit: User rejected a folder merge because the agent treated two projects as one.',
        'Metric idea: Track accepted, rejected, and revised proposals by workflow.'
      ]
    },
    mockOutput: {
      thesis: 'The agent can safely write into the workspace only when the product separates low-risk memory capture from high-risk meaning and structure changes.',
      weakAssumptions: [
        'Review alone will prevent the user from feeling the agent is taking over.',
        'The agent can infer project boundaries from note titles and recent activity.',
        'Accepted proposal rate is enough to measure whether the agent improved the thinking system.'
      ],
      missingEvidence: [
        'Examples of successful multi-step sessions where retrieval, critique, drafting, and organization work together.',
        'Failure cases where a correct-looking proposal damaged the user intent.',
        'Latency and cost measurements for routed models on realistic workspace context.'
      ],
      nextTest: 'Run the full harness on realistic workspace fixtures and compare acceptance-quality failures by workflow before enabling write-mode beyond memory capture.'
    }
  },
  editor: {
    fixture: {
      activeType: 'note',
      activeTitle: 'Agent harness rough memo',
      noteBody: [
        'Need harness.',
        'Agent should think with me. Pull stuff in. Challenge me.',
        'Also should organize notes and maybe write memory. Not sure what writes directly.',
        'Models routed by workflow.'
      ].join('\n'),
      relatedMaterial: [
        'Product rule: structure and content edits must be proposed first.',
        'Workflow list: thought partner, retrieval partner, critic, editor, synthesizer, librarian, research planner, maintenance agent, writing copilot, memory steward.'
      ]
    },
    mockOutput: {
      target: { type: 'note', title: 'Agent harness rough memo' },
      changeType: 'restructure',
      title: 'Clarify agent harness memo',
      proposedBody: [
        'Thesis: The agent harness should test the product as a workspace partner, not as a single chat endpoint.',
        'Workflow coverage: It needs scenarios for thinking, retrieval, critique, editing, synthesis, library organization, research planning, maintenance, writing continuation, and memory capture.',
        'Trust boundary: Content and structure changes should be staged for review, while narrowly scoped memory updates can be prepared for direct write-mode after validation.',
        'Next action: Run routed models against realistic fixtures and record contract failures before enabling broader write behavior.'
      ].join('\n\n'),
      rationale: 'The rewrite turns fragments into thesis, coverage, trust boundary, and next action while preserving uncertainty about direct writes.'
    }
  },
  synthesizer: {
    fixture: {
      activeType: 'workspace',
      activeTitle: 'Agent product notes',
      noteBody: 'Fragments cover thought partnership, retrieval, reviewable edits, memory capture, workspace cleanup, and model routing.',
      relatedMaterial: [
        'Note: The product is closer to a thinking environment than a chat app.',
        'Observation: Direct mutation is useful only after the user trusts the workflow.',
        'Decision: Keep model routing flexible across partner_chat, critique, artifact_draft, structure_planner, hygiene_scan, and deep_audit.'
      ],
      unresolvedThreads: [
        'Which workflows should create artifacts versus proposed changes?',
        'How does the UI explain why the agent touched a note or folder?'
      ]
    },
    mockOutput: {
      artifactType: 'concept_brief',
      title: 'Reviewable workspace agent',
      body: 'A reviewable workspace agent helps the user think, write, retrieve, organize, and remember inside a personal knowledge base. Its core product pattern is not autonomous mutation; it is staged collaboration. The agent should retrieve relevant material, challenge weak claims, draft structured updates, propose reversible library changes, and capture working memory. The unresolved design boundary is deciding which low-risk updates can be committed directly and which meaning-changing actions must remain reviewable.',
      citations: ['Agent product notes', 'Decision: Keep model routing flexible across partner_chat, critique, artifact_draft, structure_planner, hygiene_scan, and deep_audit']
    }
  },
  librarian: {
    fixture: {
      activeType: 'workspace',
      activeTitle: 'Workspace agent research',
      folders: [
        'AI summaries',
        'Assistant UX',
        'Workspace agents',
        'Misc imports',
        'Old experiments'
      ],
      notes: [
        'Trust boundary for workspace agents',
        'Accepted proposal patterns',
        'Chat-only assistant limitations',
        'Model routing notes',
        'Library cleanup scratch',
        'Reviewable changes concept'
      ],
      constraints: [
        'Only propose reversible changes.',
        'Do not delete notes.',
        'Explain every move by source title.'
      ]
    },
    mockOutput: {
      title: 'Consolidate workspace agent research',
      summary: 'Stage a reversible cleanup that separates product concepts, UX evidence, and legacy summaries without deleting anything.',
      riskLevel: 'medium',
      operations: [
        { type: 'create_folder', title: 'Create Workspace Agent Research folder', requiresApproval: true },
        { type: 'move_item', title: 'Move Trust boundary for workspace agents into Workspace Agent Research', requiresApproval: true },
        { type: 'move_item', title: 'Move Reviewable changes concept into Workspace Agent Research', requiresApproval: true },
        { type: 'rename_folder', title: 'Rename AI summaries to Legacy assistant summaries', requiresApproval: true }
      ]
    }
  },
  research_planner: {
    fixture: {
      activeType: 'concept',
      activeTitle: 'Trust boundary for agent writes',
      noteBody: 'We think memory updates can write directly, while document edits and library moves should be staged. We need evidence before this becomes a product rule.',
      relatedMaterial: [
        'Existing signal: users rejected folder merges when the agent collapsed project boundaries.',
        'Existing signal: users accepted edits that preserved uncertainty and showed citations.',
        'Missing signal: no realistic eval compares direct memory writes against staged memory proposals.'
      ]
    },
    mockOutput: {
      questions: [
        'Which agent actions do users expect to be direct writes versus reviewable proposals?',
        'When do memory updates become risky enough to require approval?',
        'What rationale format helps users trust proposed note restructures and folder moves?',
        'Which workflow failures correlate with model choice versus prompt/contract design?'
      ],
      handoff: {
        title: 'Validate trust boundaries for workspace-agent writes',
        successCriteria: [
          'Collect accepted, rejected, and revised examples for memory, content, and structure workflows.',
          'Identify at least three direct-write failure cases before expanding write-mode.',
          'Recommend one default policy for each canonical workflow.'
        ]
      }
    }
  },
  maintenance_agent: {
    fixture: {
      activeType: 'workspace',
      activeTitle: 'Workspace agent product area',
      notes: [
        'Old summary: Assistant summarizes articles and files them automatically.',
        'New concept: Agent is a reviewable thought partner that can challenge and stage changes.',
        'Unlinked note: Accepted proposal patterns.',
        'Draft: Memory steward writes current focus, open questions, and next moves.',
        'Contradiction: One memo says all writes require approval; another says memory writes should commit.'
      ],
      staleSignals: [
        'The term "AI summaries" still appears in current navigation notes.',
        'Model routing doc predates the latest route profiles.'
      ]
    },
    mockOutput: {
      summary: 'The workspace has scope drift from a summarize-and-file assistant toward a reviewable workspace agent, plus an unresolved contradiction around direct memory writes.',
      staleItems: [
        'Old summary: Assistant summarizes articles and files them automatically.',
        'Navigation references to "AI summaries".',
        'Model routing doc that predates latest route profiles.'
      ],
      missingLinks: [
        'Link Accepted proposal patterns to the trust-boundary concept.',
        'Link Memory steward draft to the write-mode decision note.'
      ],
      contradictions: [
        'All writes require approval conflicts with memory writes should commit.',
        'Summarize-and-file framing conflicts with reviewable thought-partner framing.'
      ],
      nextActions: [
        'Rewrite the old summary as a legacy note instead of deleting it.',
        'Create a decision note for memory write-mode.',
        'Run realistic harness fixtures after each model-route update.'
      ]
    }
  },
  writing_copilot: {
    fixture: {
      activeType: 'note',
      activeTitle: 'Why review is the product surface',
      noteBody: 'The agent should help with the work directly inside the library. The next section needs to explain why review is not friction but the mechanism that makes the agent trustworthy.',
      relatedMaterial: [
        'User preference: challenge me, but do not silently reshape my workspace.',
        'Product rule: proposed changes should include rationale and be reversible.'
      ],
      styleNotes: [
        'Use direct product language.',
        'Do not turn it into marketing copy.'
      ]
    },
    mockOutput: {
      insertionPoint: 'after_current_paragraph',
      suggestedText: 'Review is the product surface because the agent is operating on durable thinking, not disposable chat text. A good suggestion can still be wrong if it erases uncertainty, collapses two projects, or moves evidence away from the claim it supports. The review layer lets the agent do real work while keeping authorship, intent, and library structure under user control.',
      rationale: 'Continues the memo in direct product language and frames review as the trust mechanism for durable workspace changes.'
    }
  },
  memory_steward: {
    fixture: {
      activeType: 'workspace',
      activeTitle: 'Agent harness rollout',
      noteBody: 'We implemented model routing, workflow contracts, integration dry-runs, and metrics visibility. Next is realistic fixture coverage, then controlled write-mode.',
      relatedMaterial: [
        'Current phase: add anonymized realistic workspace fixtures.',
        'Open risk: live model passes contract but still misses product intent.',
        'Next phase candidate: staged write-mode for memory and structure drafts.'
      ],
      recentDecisions: [
        'Keep synthetic harness as deterministic smoke test.',
        'Use realistic fixtures for model comparison and regression checks.'
      ]
    },
    mockOutput: {
      updates: [
        { type: 'current_focus', text: 'Move the agent harness from synthetic smoke tests to realistic workspace fixtures.' },
        { type: 'open_question', text: 'How much direct write-mode should be allowed before real acceptance data exists?' },
        { type: 'next_move', text: 'Run mock and live harness passes against the realistic fixture set, then use failures to tune prompts and routes.' }
      ],
      writeMode: 'commit'
    }
  }
});

const normalizeFixtureSet = (fixtureSet = 'synthetic') => (
  FIXTURE_SET_ALIASES[String(fixtureSet || '').trim().toLowerCase()] || 'synthetic'
);

const getAvailableFixtureSets = () => ['synthetic', 'realistic'];

const applyFixtureSetToSpecs = (specs = [], fixtureSet = 'synthetic') => {
  const normalized = normalizeFixtureSet(fixtureSet);
  return (Array.isArray(specs) ? specs : []).map((spec) => {
    const base = clone(spec);
    const override = normalized === 'realistic' ? REALISTIC_WORKFLOW_FIXTURES[base.id] : null;
    return {
      ...base,
      ...(override ? clone(override) : {}),
      fixtureSet: normalized
    };
  });
};

module.exports = {
  applyFixtureSetToSpecs,
  getAvailableFixtureSets,
  normalizeFixtureSet,
  REALISTIC_WORKFLOW_FIXTURES
};
