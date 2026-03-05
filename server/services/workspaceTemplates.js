const STAGE_IDS = ['inbox', 'working', 'draft', 'archive'];

const TEMPLATE_FIXTURES = [
  {
    id: 'research-paper-analysis',
    name: 'Research Paper Analysis',
    description: 'Break down methods, findings, and follow-up experiments for any paper.',
    icon: '🧪',
    groups: [
      { id: 'inbox', title: 'Papers To Triage', description: 'Capture candidate papers and first-pass notes.', collapsed: false, order: 0 },
      { id: 'working', title: 'Deep Read', description: 'Actively extract claims, methods, and caveats.', collapsed: false, order: 1 },
      { id: 'draft', title: 'Synthesis Draft', description: 'Draft your summary and replication ideas.', collapsed: true, order: 2 },
      { id: 'archive', title: 'Filed', description: 'Archived analyses and finalized takeaways.', collapsed: true, order: 3 }
    ],
    sampleEntries: [
      {
        title: 'Paper Snapshot',
        content: 'Problem: What core problem does this paper solve?\\nMethod: What is new vs prior work?\\nResult: What headline metric should I remember?',
        tags: ['research', 'paper-summary'],
        stage: 'inbox',
        order: 0
      },
      {
        title: 'Method Strengths + Weaknesses',
        content: 'Strengths: Clear baseline comparison and ablations.\\nWeaknesses: Dataset constraints may limit real-world transfer.',
        tags: ['methods', 'critical-reading'],
        stage: 'working',
        order: 0
      },
      {
        title: 'Replication Checklist',
        content: '1) Recreate data preprocessing. 2) Re-run main experiment. 3) Test one variation to probe robustness.',
        tags: ['replication'],
        stage: 'draft',
        order: 0
      }
    ],
    workflowTips: [
      'Start with one-sentence problem framing before reading details.',
      'Extract 2-3 decision-critical findings, not every statistic.',
      'End by writing one concrete next experiment or question.'
    ]
  },
  {
    id: 'book-notes',
    name: 'Book Notes',
    description: 'Capture core ideas, quotes, and chapter-level reflections while reading books.',
    icon: '📚',
    groups: [
      { id: 'inbox', title: 'Highlights Inbox', description: 'Raw excerpts and quick reactions.', collapsed: false, order: 0 },
      { id: 'working', title: 'Chapter Insights', description: 'Organize notes by chapter or theme.', collapsed: false, order: 1 },
      { id: 'draft', title: 'Book Summary Draft', description: 'Draft your personal summary and applications.', collapsed: true, order: 2 },
      { id: 'archive', title: 'Finished Books', description: 'Completed summaries and evergreen takeaways.', collapsed: true, order: 3 }
    ],
    sampleEntries: [
      {
        title: 'Key Quote + Why It Matters',
        content: 'Quote: "Write the line you want to remember."\\nWhy it matters: Add 2-3 sentences in your own words.',
        tags: ['book', 'quote'],
        stage: 'inbox',
        order: 0
      },
      {
        title: 'Chapter Takeaway',
        content: 'Chapter: [Name]\\nMain idea: [One sentence]\\nHow I can apply it this week: [Action].',
        tags: ['chapter-notes'],
        stage: 'working',
        order: 0
      },
      {
        title: '3 Enduring Lessons',
        content: 'List three lessons that are likely to still matter in six months and one trigger to revisit this book.',
        tags: ['synthesis'],
        stage: 'draft',
        order: 0
      }
    ],
    workflowTips: [
      'Capture fewer quotes, but always add your interpretation.',
      'Keep one note per chapter to make retrieval easier later.',
      'Close each session with one practical application.'
    ]
  },
  {
    id: 'project-planning',
    name: 'Project Planning',
    description: 'Structure project goals, milestones, risks, and execution notes in one workspace.',
    icon: '🗺️',
    groups: [
      { id: 'inbox', title: 'Raw Inputs', description: 'Incoming requirements, ideas, and constraints.', collapsed: false, order: 0 },
      { id: 'working', title: 'Plan In Progress', description: 'Priorities, milestones, and owner decisions.', collapsed: false, order: 1 },
      { id: 'draft', title: 'Plan Draft', description: 'Shareable project plan draft.', collapsed: true, order: 2 },
      { id: 'archive', title: 'Completed', description: 'Shipped milestones and retro notes.', collapsed: true, order: 3 }
    ],
    sampleEntries: [
      {
        title: 'Project Brief',
        content: 'Goal: What outcome defines success?\\nScope: What is explicitly in and out?\\nDeadline: What date matters most?',
        tags: ['project-brief'],
        stage: 'inbox',
        order: 0
      },
      {
        title: 'Milestones + Owners',
        content: 'Milestone 1: [date, owner, deliverable]\\nMilestone 2: [date, owner, deliverable]\\nRisk: Biggest blocker and fallback.',
        tags: ['milestones', 'execution'],
        stage: 'working',
        order: 0
      }
    ],
    workflowTips: [
      'Define success with measurable outcomes before task breakdown.',
      'Assign one owner per milestone to avoid ambiguity.',
      'Review risks weekly and update mitigation steps.'
    ]
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Turn meetings into clear decisions, action items, and follow-through.',
    icon: '📝',
    groups: [
      { id: 'inbox', title: 'Agenda + Prep', description: 'Questions and context before the meeting.', collapsed: false, order: 0 },
      { id: 'working', title: 'Live Notes', description: 'Capture decisions and open questions in real time.', collapsed: false, order: 1 },
      { id: 'draft', title: 'Follow-up Draft', description: 'Draft summary to share after the meeting.', collapsed: true, order: 2 },
      { id: 'archive', title: 'Past Meetings', description: 'Archived notes and outcomes.', collapsed: true, order: 3 }
    ],
    sampleEntries: [
      {
        title: 'Meeting Agenda Template',
        content: '1) Objective\\n2) Key updates\\n3) Decision needed\\n4) Next actions',
        tags: ['agenda'],
        stage: 'inbox',
        order: 0
      },
      {
        title: 'Decision Log Entry',
        content: 'Decision: [what was decided]\\nRationale: [why]\\nOwner: [who follows through]\\nDue date: [when].',
        tags: ['decisions', 'action-items'],
        stage: 'working',
        order: 0
      },
      {
        title: 'Post-Meeting Summary',
        content: 'Summary for team: key decisions, unresolved questions, and action item owners with deadlines.',
        tags: ['follow-up'],
        stage: 'draft',
        order: 0
      }
    ],
    workflowTips: [
      'Write the decision in one sentence before discussing details.',
      'Capture owner + due date for every action item.',
      'Send a short recap within 24 hours.'
    ]
  },
  {
    id: 'learning-path',
    name: 'Learning Path',
    description: 'Plan and track a skill-building path with resources, practice, and checkpoints.',
    icon: '🎯',
    groups: [
      { id: 'inbox', title: 'Resource Backlog', description: 'Collect courses, articles, and examples to review.', collapsed: false, order: 0 },
      { id: 'working', title: 'Current Module', description: 'Active study notes and practice tasks.', collapsed: false, order: 1 },
      { id: 'draft', title: 'Practice Synthesis', description: 'Draft cheat sheets and teaching notes.', collapsed: true, order: 2 },
      { id: 'archive', title: 'Completed Modules', description: 'Finished topics and retrospective notes.', collapsed: true, order: 3 }
    ],
    sampleEntries: [
      {
        title: 'Learning Goal Definition',
        content: 'Skill target: [what you want to learn]\\nWhy now: [motivation]\\nSuccess signal: [how you know you improved].',
        tags: ['learning-goals'],
        stage: 'inbox',
        order: 0
      },
      {
        title: 'Weekly Practice Plan',
        content: 'Week focus: [topic]\\nPractice blocks: [time slots]\\nOutput: [artifact or exercise].',
        tags: ['practice'],
        stage: 'working',
        order: 0
      }
    ],
    workflowTips: [
      'Set one measurable outcome per learning cycle.',
      'Alternate study notes with hands-on exercises.',
      'Write a weekly reflection on what still feels unclear.'
    ]
  },
  {
    id: 'decision-log',
    name: 'Decision Log',
    description: 'Track important decisions, tradeoffs, and outcomes over time.',
    icon: '⚖️',
    groups: [
      { id: 'inbox', title: 'Pending Decisions', description: 'Open choices requiring context and constraints.', collapsed: false, order: 0 },
      { id: 'working', title: 'Options Analysis', description: 'Evaluate alternatives and tradeoffs.', collapsed: false, order: 1 },
      { id: 'draft', title: 'Decision Record Drafts', description: 'Formalize selected option and rationale.', collapsed: true, order: 2 },
      { id: 'archive', title: 'Outcome Reviews', description: 'Historical records and post-decision reviews.', collapsed: true, order: 3 }
    ],
    sampleEntries: [
      {
        title: 'Decision Context',
        content: 'Decision statement: [what needs choosing]\\nConstraints: [budget/time/risk]\\nDeadline: [when decision is needed].',
        tags: ['decision-context'],
        stage: 'inbox',
        order: 0
      },
      {
        title: 'Tradeoff Matrix',
        content: 'Option A/B/C with pros, cons, risks, and confidence level for each.',
        tags: ['tradeoffs'],
        stage: 'working',
        order: 0
      },
      {
        title: 'Decision Outcome Check-in',
        content: '30-day review: What happened vs expectation? What should we adjust next time?',
        tags: ['retrospective'],
        stage: 'archive',
        order: 0
      }
    ],
    workflowTips: [
      'Capture assumptions explicitly before selecting an option.',
      'Document why rejected options were not chosen.',
      'Schedule outcome reviews to improve future decisions.'
    ]
  },
  {
    id: 'writing-sprint',
    name: 'Writing Sprint',
    description: 'Go from rough ideas to publish-ready drafts with focused writing loops.',
    icon: '✍️',
    groups: [
      { id: 'inbox', title: 'Idea Capture', description: 'Collect prompts, references, and rough angles.', collapsed: false, order: 0 },
      { id: 'working', title: 'Drafting', description: 'Build sections and argument flow.', collapsed: false, order: 1 },
      { id: 'draft', title: 'Revision Queue', description: 'Refine language, structure, and examples.', collapsed: true, order: 2 },
      { id: 'archive', title: 'Published / Done', description: 'Final drafts and lessons learned.', collapsed: true, order: 3 }
    ],
    sampleEntries: [
      {
        title: 'Article Angle',
        content: 'Audience: [who this is for]\\nThesis: [core claim]\\nSupporting points: [3 bullets].',
        tags: ['outline'],
        stage: 'inbox',
        order: 0
      },
      {
        title: 'Draft Paragraph Pass',
        content: 'Write one rough paragraph per key point without editing. Optimize clarity in revision pass.',
        tags: ['drafting'],
        stage: 'working',
        order: 0
      },
      {
        title: 'Revision Checklist',
        content: 'Check opening hook, argument flow, evidence quality, and final call-to-action.',
        tags: ['revision'],
        stage: 'draft',
        order: 0
      }
    ],
    workflowTips: [
      'Separate drafting from editing to keep momentum high.',
      'Write to one audience and one thesis per sprint.',
      'Run a final pass focused only on clarity and structure.'
    ]
  }
];

const clone = (value) => JSON.parse(JSON.stringify(value));

const toSafeString = (value) => String(value || '').trim();

const normalizeGroup = (group, index) => {
  const id = toSafeString(group?.id).toLowerCase();
  if (!STAGE_IDS.includes(id)) {
    throw new Error(`Invalid template group id: ${id || '(empty)'}`);
  }
  return {
    id,
    title: toSafeString(group?.title) || id,
    description: toSafeString(group?.description),
    collapsed: Boolean(group?.collapsed),
    order: Number.isFinite(Number(group?.order)) ? Number(group.order) : index
  };
};

const normalizeSampleEntry = (entry, index) => {
  const stage = toSafeString(entry?.stage).toLowerCase();
  if (!STAGE_IDS.includes(stage)) {
    throw new Error(`Invalid template sample stage: ${stage || '(empty)'}`);
  }
  const title = toSafeString(entry?.title);
  if (!title) {
    throw new Error('Template sample entry title is required.');
  }
  const content = toSafeString(entry?.content);
  if (!content) {
    throw new Error(`Template sample entry content is required for ${title}.`);
  }

  const tags = Array.isArray(entry?.tags)
    ? entry.tags.map(tag => toSafeString(tag)).filter(Boolean)
    : [];

  return {
    title,
    content,
    tags,
    stage,
    order: Number.isFinite(Number(entry?.order)) ? Number(entry.order) : index
  };
};

const normalizeTemplate = (template, index) => {
  const id = toSafeString(template?.id).toLowerCase();
  if (!id) {
    throw new Error(`Template at index ${index} is missing id.`);
  }

  const name = toSafeString(template?.name);
  if (!name) {
    throw new Error(`Template ${id} is missing name.`);
  }

  const description = toSafeString(template?.description);
  if (!description) {
    throw new Error(`Template ${id} is missing description.`);
  }

  const icon = toSafeString(template?.icon) || '📌';

  const groupsRaw = Array.isArray(template?.groups) ? template.groups : [];
  if (groupsRaw.length !== STAGE_IDS.length) {
    throw new Error(`Template ${id} must define exactly ${STAGE_IDS.length} groups.`);
  }

  const groups = groupsRaw.map((group, groupIndex) => normalizeGroup(group, groupIndex));
  const groupIdSet = new Set(groups.map(group => group.id));
  STAGE_IDS.forEach((stageId) => {
    if (!groupIdSet.has(stageId)) {
      throw new Error(`Template ${id} is missing group stage ${stageId}.`);
    }
  });

  const sampleEntriesRaw = Array.isArray(template?.sampleEntries) ? template.sampleEntries : [];
  if (sampleEntriesRaw.length < 2 || sampleEntriesRaw.length > 3) {
    throw new Error(`Template ${id} must include 2-3 sampleEntries.`);
  }
  const sampleEntries = sampleEntriesRaw.map((entry, sampleIndex) => normalizeSampleEntry(entry, sampleIndex));

  const workflowTipsRaw = Array.isArray(template?.workflowTips) ? template.workflowTips : [];
  const workflowTips = workflowTipsRaw.map(tip => toSafeString(tip)).filter(Boolean);
  if (workflowTips.length < 3) {
    throw new Error(`Template ${id} must include at least 3 workflowTips.`);
  }

  return {
    id,
    name,
    description,
    icon,
    groups: groups
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((group, groupIndex) => ({ ...group, order: groupIndex })),
    sampleEntries,
    workflowTips: workflowTips.slice(0, 3)
  };
};

const TEMPLATES = TEMPLATE_FIXTURES.map((template, index) => normalizeTemplate(template, index));
const TEMPLATE_ID_SET = new Set();
TEMPLATES.forEach((template) => {
  if (TEMPLATE_ID_SET.has(template.id)) {
    throw new Error(`Duplicate template id: ${template.id}`);
  }
  TEMPLATE_ID_SET.add(template.id);
});

const TEMPLATE_BY_ID = new Map(TEMPLATES.map(template => [template.id, template]));

const listWorkspaceTemplates = () => TEMPLATES.map((template) => ({
  id: template.id,
  name: template.name,
  description: template.description,
  icon: template.icon,
  groupCount: template.groups.length,
  sampleEntryCount: template.sampleEntries.length
}));

const getWorkspaceTemplateById = (templateId) => {
  const id = toSafeString(templateId).toLowerCase();
  if (!id) return null;
  const template = TEMPLATE_BY_ID.get(id);
  return template ? clone(template) : null;
};

const getWorkspaceTemplateRegistry = () => clone(TEMPLATES);

module.exports = {
  WORKSPACE_TEMPLATE_STAGE_IDS: STAGE_IDS,
  listWorkspaceTemplates,
  getWorkspaceTemplateById,
  getWorkspaceTemplateRegistry
};
