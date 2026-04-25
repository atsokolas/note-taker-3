const WORKFLOW_SPECS = Object.freeze([
  {
    id: 'thought_partner',
    title: 'Thought partner',
    route: 'partner_chat',
    outputContract: 'chat_response',
    userRequest: 'What is the strongest claim in this note, and what should I clarify next?',
    fixture: {
      activeType: 'concept',
      activeTitle: 'AI reading partner',
      noteBody: 'An AI reading partner should not just summarize articles. It should help a reader turn scattered highlights into claims, questions, and reusable concepts.',
      relatedMaterial: [
        'Highlight: Readers forget insights when highlights never become decisions or questions.',
        'Note: The product already has concepts, artifact drafts, and reviewable structure proposals.'
      ]
    },
    mockOutput: 'The strongest claim is that the agent should transform reading residue into structured thinking, not just summarize text. Clarify what counts as a successful transformation: a sharper claim, a new question, a draft artifact, or a proposed library change.'
  },
  {
    id: 'retrieval_partner',
    title: 'Retrieval partner',
    route: 'partner_chat',
    outputContract: 'linked_material_set',
    quality: {
      minItems: 3
    },
    userRequest: 'Pull in the most relevant material that supports or challenges this note.',
    fixture: {
      activeType: 'note',
      activeTitle: 'From highlights to concepts',
      noteBody: 'The library becomes valuable when raw reading fragments are converted into linked concepts.',
      relatedMaterial: [
        'Article: Retrieval is useful only when it changes the next action.',
        'Question: Which highlights are evidence and which are just interesting?',
        'Concept: Working memory captures unresolved threads before they disappear.'
      ]
    },
    mockOutput: {
      items: [
        { type: 'article', title: 'Retrieval changes the next action', reason: 'Supports the claim that retrieval should affect workflow, not just search.' },
        { type: 'question', title: 'Evidence or interesting?', reason: 'Challenges whether each highlight deserves concept-level promotion.' },
        { type: 'concept', title: 'Working memory', reason: 'Connects unresolved reading threads to later synthesis.' }
      ]
    }
  },
  {
    id: 'critic',
    title: 'Critic',
    route: 'critique',
    outputContract: 'critique_brief',
    userRequest: 'Challenge this concept and name what is still unproven.',
    fixture: {
      activeType: 'concept',
      activeTitle: 'AI reading partner',
      noteBody: 'The agent can make reading more useful by converting highlights into concepts and questions automatically.',
      relatedMaterial: [
        'Risk: Automatic organization can flatten nuance or invent structure.',
        'User preference: The agent should challenge me, not just agree.'
      ]
    },
    mockOutput: {
      thesis: 'Automatic conversion from highlights to concepts is useful only if the agent preserves uncertainty and user intent.',
      weakAssumptions: ['Highlights contain enough context to infer durable concepts.', 'Automation will reduce rather than increase library clutter.'],
      missingEvidence: ['Examples where generated concept candidates improved later writing.', 'Evidence that users trust reviewable changes more than direct mutation.'],
      nextTest: 'Run the agent on one messy import and measure accepted versus rejected concept proposals.'
    }
  },
  {
    id: 'editor',
    title: 'Editor',
    route: 'artifact_draft',
    outputContract: 'proposed_content_change',
    userRequest: 'Restructure this note so it has a clearer thesis, evidence, tension, and next action.',
    fixture: {
      activeType: 'note',
      activeTitle: 'Reading partner draft',
      noteBody: 'AI should help with reading. Highlights are scattered. Concepts are better. Need agent help.',
      relatedMaterial: ['The user wants reviewable proposed changes before edits land.']
    },
    mockOutput: {
      target: { type: 'note', title: 'Reading partner draft' },
      changeType: 'restructure',
      title: 'Restructure reading partner draft',
      proposedBody: 'Thesis: An AI reading partner should turn scattered highlights into durable thinking assets. Evidence: highlights lose value when they are not connected to concepts, questions, or drafts. Tension: automation can create false structure if it skips review. Next action: stage concept and question candidates for approval.',
      rationale: 'The rewrite separates claim, evidence, tension, and action without directly mutating the note.'
    }
  },
  {
    id: 'synthesizer',
    title: 'Synthesizer',
    route: 'artifact_draft',
    outputContract: 'artifact_draft',
    userRequest: 'Turn these fragments into a compact concept brief.',
    fixture: {
      activeType: 'workspace',
      activeTitle: 'Reading agent fragments',
      noteBody: 'Fragments mention scattered highlights, questions, concept promotion, critique, and library organization.',
      relatedMaterial: ['Artifact drafts should be reviewable before promotion.', 'Concepts need evidence and unresolved tensions.']
    },
    mockOutput: {
      artifactType: 'concept_brief',
      title: 'AI reading partner',
      body: 'An AI reading partner helps users convert reading fragments into claims, questions, and reusable concepts. It should retrieve relevant material, challenge weak assumptions, draft artifacts, and stage reviewable changes. The unresolved tension is how much structure to infer automatically before user review.',
      citations: ['Reading agent fragments', 'Artifact drafts should be reviewable before promotion']
    }
  },
  {
    id: 'librarian',
    title: 'Librarian',
    route: 'structure_planner',
    outputContract: 'structure_proposal',
    quality: {
      allowedOperationTypes: ['create_folder', 'move_item', 'rename_folder', 'merge_folder', 'delete_folder']
    },
    userRequest: 'Organize this messy reading workspace, but only propose reversible changes.',
    fixture: {
      activeType: 'workspace',
      activeTitle: 'AI reading imports',
      folders: ['Imported highlights', 'AI articles', 'Untitled', 'Concept scraps'],
      notes: ['AI reader notes', 'Highlight dump', 'Reading questions', 'Agent library cleanup']
    },
    mockOutput: {
      title: 'Organize AI reading imports',
      summary: 'Stage a reversible cleanup plan for reading-agent material.',
      riskLevel: 'medium',
      operations: [
        { type: 'create_folder', title: 'Create AI Reading Partner folder', requiresApproval: true },
        { type: 'move_item', title: 'Move reading questions into AI Reading Partner', requiresApproval: true },
        { type: 'rename_folder', title: 'Rename Concept scraps to Concept ideas', requiresApproval: true }
      ]
    }
  },
  {
    id: 'research_planner',
    title: 'Research planner',
    route: 'artifact_draft',
    outputContract: 'question_set_handoff',
    userRequest: 'Turn the gaps in this concept into research questions and a handoff.',
    fixture: {
      activeType: 'concept',
      activeTitle: 'AI reading partner',
      noteBody: 'We believe the agent should turn highlights into concepts, but we have not proven what users accept or reject.',
      relatedMaterial: ['Need evidence about accepted proposals, rejected drafts, and trust in agent edits.']
    },
    mockOutput: {
      questions: [
        'Which agent-generated concept proposals do users accept most often?',
        'Where does automated organization create false confidence?',
        'What review UI makes users comfortable applying workspace changes?'
      ],
      handoff: {
        title: 'Evaluate trust in reviewable reading-agent changes',
        successCriteria: ['Collect accepted/rejected proposal examples', 'Summarize failure patterns', 'Recommend one safer default behavior']
      }
    }
  },
  {
    id: 'maintenance_agent',
    title: 'Maintenance agent',
    route: 'hygiene_scan',
    outputContract: 'hygiene_report',
    userRequest: 'Scan this workspace for drift, stale summaries, missing links, and contradictions.',
    fixture: {
      activeType: 'workspace',
      activeTitle: 'Reading partner workspace',
      notes: ['Old summary says summarize articles only', 'New concept says challenge and organize workspace', 'Unlinked note about working memory']
    },
    mockOutput: {
      summary: 'The workspace has framing drift: older notes describe summarization, while newer notes describe an agentic partner.',
      staleItems: ['Old summary says summarize articles only'],
      missingLinks: ['Unlinked note about working memory should link to AI reading partner'],
      contradictions: ['Summarize-only framing conflicts with challenge-and-organize workflow'],
      nextActions: ['Rewrite stale summary', 'Link working memory note', 'Preserve contradiction until product scope is decided']
    }
  },
  {
    id: 'writing_copilot',
    title: 'Writing copilot',
    route: 'artifact_draft',
    outputContract: 'inline_draft_suggestion',
    userRequest: 'Continue this draft in my structure without taking over the document.',
    fixture: {
      activeType: 'note',
      activeTitle: 'Agent workflow memo',
      noteBody: 'The agent has to be more than chat. It needs to help me think, write, organize, and remember. The next section should explain why review matters.',
      relatedMaterial: ['User prefers staged changes and reversible organization.']
    },
    mockOutput: {
      insertionPoint: 'after_current_paragraph',
      suggestedText: 'Review matters because the agent is working inside a personal knowledge base, not a disposable chat. It can suggest structure, draft language, and connect material, but the user should approve changes that reshape meaning or move library objects.',
      rationale: 'Continues the user thesis while preserving human control.'
    }
  },
  {
    id: 'memory_steward',
    title: 'Memory steward',
    route: 'artifact_draft',
    outputContract: 'working_memory_update',
    quality: {
      requiredUpdateTypes: ['current_focus', 'open_question', 'next_move']
    },
    userRequest: 'Capture what I am working on, unresolved threads, and next moves.',
    fixture: {
      activeType: 'workspace',
      activeTitle: 'Agent model routing',
      noteBody: 'We chose a routed model architecture and now need a harness for thought partner, retrieval, critic, editor, synthesizer, librarian, research planner, maintenance, writing copilot, and memory steward workflows.',
      relatedMaterial: ['Memory steward should write updates, not merely propose them.']
    },
    mockOutput: {
      updates: [
        { type: 'current_focus', text: 'Define and test the ten canonical agent workflows.' },
        { type: 'open_question', text: 'Which workflows should become real mutating actions versus reviewable proposals?' },
        { type: 'next_move', text: 'Run the synthetic harness, then add live model runs for partner_chat and structure_planner.' }
      ],
      writeMode: 'commit'
    }
  }
]);

module.exports = {
  WORKFLOW_SPECS
};
