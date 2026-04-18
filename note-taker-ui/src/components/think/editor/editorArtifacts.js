const textNode = (text) => ({ type: 'text', text });

export const buildArtifactBlockContent = (type, payload = {}) => {
  if (type === 'concept') {
    const title = String(payload.title || 'Concept').trim() || 'Concept';
    return [
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [textNode(title)]
      },
      {
        type: 'paragraph',
        content: [textNode('Core claim: ')]
      },
      {
        type: 'paragraph',
        content: [textNode('Why it matters: ')]
      }
    ];
  }

  if (type === 'question') {
    return [
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [textNode('Question')]
      },
      {
        type: 'paragraph',
        content: [textNode('Open question: ')]
      },
      {
        type: 'paragraph',
        content: [textNode('Why it matters: ')]
      },
      {
        type: 'paragraph',
        content: [textNode('Next evidence to find: ')]
      }
    ];
  }

  return [
    {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [textNode(String(payload.quote || 'Supporting evidence or quoted material.'))]
        }
      ]
    },
    {
      type: 'paragraph',
      content: [textNode('Why it matters: ')]
    }
  ];
};

export const insertArtifactBlock = (editor, type, payload = {}) => {
  if (!editor?.commands?.insertContent) return false;
  editor.commands.insertContent(buildArtifactBlockContent(type, payload));
  return true;
};

export const createArtifactSlashItems = ({ includeEvidence = true, includeConcept = true, includeQuestion = true } = {}) => {
  const items = [];

  if (includeEvidence) {
    items.push({
      id: 'insertEvidenceBlock',
      label: 'Insert evidence block',
      description: 'Start a quote-and-analysis block in the draft.',
      keywords: ['evidence', 'support', 'quote', 'proof'],
      intent: 'artifact',
      artifactType: 'evidence',
      prioritizeForQuery: ['evidence', 'support', 'quote'],
      onSelect: ({ editor }) => insertArtifactBlock(editor, 'evidence')
    });
  }

  if (includeConcept) {
    items.push({
      id: 'insertConceptBlock',
      label: 'Insert concept block',
      description: 'Start a concept frame with the claim and stakes.',
      keywords: ['concept', 'idea', 'thesis', 'frame'],
      intent: 'artifact',
      artifactType: 'concept',
      prioritizeForQuery: ['concept', 'idea'],
      onSelect: ({ editor }) => insertArtifactBlock(editor, 'concept')
    });
  }

  if (includeQuestion) {
    items.push({
      id: 'insertQuestionBlock',
      label: 'Insert question block',
      description: 'Start a question frame with next evidence to find.',
      keywords: ['question', 'prompt', 'open', 'frame'],
      intent: 'artifact',
      artifactType: 'question',
      prioritizeForQuery: ['question', 'prompt'],
      onSelect: ({ editor }) => insertArtifactBlock(editor, 'question')
    });
  }

  return items;
};
