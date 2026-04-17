const clean = (value = '') => String(value || '').trim();

const stripHtml = (value = '') => clean(
  String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
);

const createDefaultBlockId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
};

const createParagraph = (text, createBlockId) => ({
  id: createBlockId(),
  type: 'paragraph',
  text
});

const createHeading = (text, level, createBlockId) => ({
  id: createBlockId(),
  type: 'heading',
  level,
  text
});

const createBullet = (text, createBlockId) => ({
  id: createBlockId(),
  type: 'bullet',
  indent: 0,
  text
});

const buildBulletSection = (title, rows, createBlockId, emptyMessage) => {
  const cleanedRows = rows.map((row) => clean(row)).filter(Boolean);
  return [
    createHeading(title, 2, createBlockId),
    ...(cleanedRows.length > 0
      ? cleanedRows.map((row) => createBullet(row, createBlockId))
      : [createParagraph(emptyMessage, createBlockId)])
  ];
};

export const CONCEPT_NOTEBOOK_DRAFT_TEMPLATES = Object.freeze([
  {
    id: 'default',
    label: 'Notebook draft',
    description: 'A plain working page spun out from the concept.',
    titleSuffix: 'notebook draft',
    intro: 'Concept draft promoted from the active concept workspace.',
    framingTitle: 'Framing question',
    workingTitle: 'Working claim',
    supportTitle: 'Support to keep in view',
    supportEmpty: 'No supporting material has been promoted yet.',
    contradictionTitle: 'Tensions to test',
    contradictionEmpty: 'No contradiction has been promoted yet.',
    questionTitle: 'Open questions',
    questionEmpty: 'No open question has been promoted yet.'
  },
  {
    id: 'essay',
    label: 'Essay draft',
    description: 'Open the idea into a longer argument with room for counterpoints.',
    titleSuffix: 'essay draft',
    intro: 'Long-form draft promoted from the concept so the argument can breathe outside the workspace.',
    framingTitle: 'Central question',
    workingTitle: 'Thesis in progress',
    supportTitle: 'Support to develop',
    supportEmpty: 'No supporting material has been promoted yet.',
    contradictionTitle: 'Counter-arguments to answer',
    contradictionEmpty: 'No tension has been promoted yet.',
    questionTitle: 'Open threads before drafting',
    questionEmpty: 'No open thread has been promoted yet.'
  },
  {
    id: 'memo',
    label: 'Memo',
    description: 'Turn the concept into a decision-ready brief with risks in view.',
    titleSuffix: 'memo',
    intro: 'Decision-ready memo promoted from the concept workspace.',
    framingTitle: 'Decision or recommendation',
    workingTitle: 'Current position',
    supportTitle: 'Reasons to carry forward',
    supportEmpty: 'No supporting reasons have been promoted yet.',
    contradictionTitle: 'Risks and pressure points',
    contradictionEmpty: 'No risk or tension has been promoted yet.',
    questionTitle: 'Questions before circulation',
    questionEmpty: 'No open question has been promoted yet.'
  },
  {
    id: 'research',
    label: 'Research notes',
    description: 'Carry evidence, contradictions, and open questions into a lighter note.',
    titleSuffix: 'research notes',
    intro: 'Research note promoted from the concept so evidence and uncertainty stay easy to extend.',
    framingTitle: 'Research question',
    workingTitle: 'Current claim',
    supportTitle: 'Signals worth keeping',
    supportEmpty: 'No supporting signals have been promoted yet.',
    contradictionTitle: 'Contradictions in play',
    contradictionEmpty: 'No contradiction has been promoted yet.',
    questionTitle: 'Open questions',
    questionEmpty: 'No open question has been promoted yet.'
  }
]);

export const getConceptNotebookDraftTemplate = (templateId = '') => {
  const safeTemplateId = clean(templateId).toLowerCase();
  return CONCEPT_NOTEBOOK_DRAFT_TEMPLATES.find((template) => template.id === safeTemplateId)
    || CONCEPT_NOTEBOOK_DRAFT_TEMPLATES[0];
};

export const buildNotebookDraftFromConcept = ({
  concept,
  state,
  currentMaturity = '',
  hypothesisVersion = {},
  template = '',
  createBlockId = createDefaultBlockId
}) => {
  const notebookTemplate = getConceptNotebookDraftTemplate(template);
  const conceptName = clean(concept?.name) || clean(state?.header?.title) || 'Untitled concept';
  const framingLine = clean(concept?.description) || clean(state?.header?.prompt) || "What's the core insight here?";
  const workingClaim = stripHtml(state?.hypothesis?.html || '');
  const cards = Array.isArray(state?.cards) ? state.cards : [];
  const supports = cards.filter((card) => card.zone === 'supports').slice(0, 4);
  const contradictions = cards.filter((card) => card.zone === 'contradictions').slice(0, 3);
  const questions = cards.filter((card) => card.zone === 'questions').slice(0, 3);

  const blocks = [
    createHeading(conceptName, 1, createBlockId),
    createParagraph(notebookTemplate.intro, createBlockId),
    createHeading(notebookTemplate.framingTitle, 2, createBlockId),
    createParagraph(framingLine, createBlockId),
    createHeading(notebookTemplate.workingTitle, 2, createBlockId),
    createParagraph(workingClaim || 'No explicit draft yet.', createBlockId),
    ...buildBulletSection(
      notebookTemplate.supportTitle,
      supports.map((card) => clean(card.title || card.content)),
      createBlockId,
      notebookTemplate.supportEmpty
    ),
    ...buildBulletSection(
      notebookTemplate.contradictionTitle,
      contradictions.map((card) => clean(card.title || card.content)),
      createBlockId,
      notebookTemplate.contradictionEmpty
    ),
    ...buildBulletSection(
      notebookTemplate.questionTitle,
      questions.map((card) => clean(card.title || card.content)),
      createBlockId,
      notebookTemplate.questionEmpty
    )
  ];

  const versionLabel = clean(hypothesisVersion?.label) ? ` ${clean(hypothesisVersion.label)}` : '';
  return {
    title: `${conceptName}${versionLabel} ${notebookTemplate.titleSuffix}`.trim(),
    content: blocks.map((block) => clean(block.text)).filter(Boolean).join('\n\n'),
    blocks,
    type: 'note',
    tags: [conceptName, 'concept-draft'].filter(Boolean),
    source: 'concept',
    importMeta: {
      provider: 'noeis',
      sourceType: 'concept',
      sourceLabel: conceptName,
      draftTemplate: notebookTemplate.id,
      draftTemplateLabel: notebookTemplate.label,
      sourceUrl: clean(conceptName)
        ? `/think?tab=concepts&concept=${encodeURIComponent(conceptName)}`
        : '',
      externalId: clean(concept?._id),
      importedAt: new Date().toISOString()
    },
    conceptContext: {
      conceptId: clean(concept?._id),
      conceptName,
      maturity: clean(currentMaturity),
      hypothesisVersion: clean(hypothesisVersion?.label),
      draftTemplate: notebookTemplate.id
    }
  };
};

export default buildNotebookDraftFromConcept;
