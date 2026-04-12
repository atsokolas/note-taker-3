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

export const buildNotebookDraftFromConcept = ({
  concept,
  state,
  currentMaturity = '',
  hypothesisVersion = {},
  createBlockId = createDefaultBlockId
}) => {
  const conceptName = clean(concept?.name) || clean(state?.header?.title) || 'Untitled concept';
  const framingLine = clean(concept?.description) || clean(state?.header?.prompt) || "What's the core insight here?";
  const workingClaim = stripHtml(state?.hypothesis?.html || '');
  const cards = Array.isArray(state?.cards) ? state.cards : [];
  const supports = cards.filter((card) => card.zone === 'supports').slice(0, 4);
  const contradictions = cards.filter((card) => card.zone === 'contradictions').slice(0, 3);
  const questions = cards.filter((card) => card.zone === 'questions').slice(0, 3);

  const blocks = [
    createHeading(conceptName, 1, createBlockId),
    createParagraph(`Concept draft promoted from the active concept workspace.`, createBlockId),
    createHeading('Framing question', 2, createBlockId),
    createParagraph(framingLine, createBlockId),
    createHeading('Working claim', 2, createBlockId),
    createParagraph(workingClaim || 'No explicit draft yet.', createBlockId),
    ...buildBulletSection(
      'Support to keep in view',
      supports.map((card) => clean(card.title || card.content)),
      createBlockId,
      'No supporting material has been promoted yet.'
    ),
    ...buildBulletSection(
      'Tensions to test',
      contradictions.map((card) => clean(card.title || card.content)),
      createBlockId,
      'No contradiction has been promoted yet.'
    ),
    ...buildBulletSection(
      'Open questions',
      questions.map((card) => clean(card.title || card.content)),
      createBlockId,
      'No open question has been promoted yet.'
    )
  ];

  const titleSuffix = clean(hypothesisVersion?.label) ? ` ${clean(hypothesisVersion.label)}` : '';
  return {
    title: `${conceptName}${titleSuffix} notebook draft`,
    content: blocks.map((block) => clean(block.text)).filter(Boolean).join('\n\n'),
    blocks,
    type: 'note',
    tags: [conceptName, 'concept-draft'],
    source: 'concept',
    importMeta: {
      provider: 'noeis',
      sourceType: 'concept',
      sourceLabel: conceptName,
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
      hypothesisVersion: clean(hypothesisVersion?.label)
    }
  };
};

export default buildNotebookDraftFromConcept;
