const cleanText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const cleanHtmlText = (value = '') => cleanText(String(value || '')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, ' ')
  .replace(/<[^>]+>/g, ' '));

const textNode = (text) => ({ type: 'text', text });

const paragraph = (text) => ({
  type: 'paragraph',
  content: [textNode(cleanText(text) || 'No source text yet.')]
});

const heading = (text, level = 2) => ({
  type: 'heading',
  attrs: { level },
  content: [textNode(text)]
});

const listItem = (text) => ({
  type: 'listItem',
  content: [paragraph(text)]
});

const bulletList = (items = []) => ({
  type: 'bulletList',
  content: items.map(listItem)
});

const thinkSourcePath = ({ sourceType, sourceId, sourceLabel }) => {
  const type = cleanText(sourceType).toLowerCase();
  const id = cleanText(sourceId);
  const label = cleanText(sourceLabel);
  if (type === 'concept' && label) return `/think?tab=concepts&concept=${encodeURIComponent(label)}`;
  if (type === 'question' && id) return `/think?tab=questions&questionId=${encodeURIComponent(id)}`;
  if (type === 'notebook' && id) return `/think?tab=notebook&entryId=${encodeURIComponent(id)}`;
  return '/think?tab=home';
};

const promotionProvenanceSection = ({ sourceType, sourceId, sourceLabel, sourcePath }) => ({
  title: 'Promotion Provenance',
  text: [
    `Promoted from Think ${sourceType}${sourceLabel ? ` "${sourceLabel}"` : ''}.`,
    sourceId ? `Source object: ${sourceType}:${sourceId}.` : '',
    sourcePath ? `Return path: ${sourcePath}.` : '',
    'The promotion creates a bidirectional graph edge so the wiki page can point back to its originating workspace object.'
  ].filter(Boolean).join(' ')
});

const buildDoc = ({ title, intro, sections = [] }) => ({
  type: 'doc',
  content: [
    heading(title, 1),
    paragraph(intro),
    ...sections.flatMap((section) => {
      const content = [heading(section.title, 2)];
      if (section.text) content.push(paragraph(section.text));
      if (Array.isArray(section.items) && section.items.length) {
        content.push(bulletList(section.items));
      }
      return content;
    })
  ]
});

export const buildThinkWikiPromotionPayload = ({ type, concept, question, notebook, conceptQuestions = [] } = {}) => {
  if (type === 'concept' && concept?._id) {
    const title = cleanText(concept.name) || 'Untitled concept';
    const description = cleanText(concept.description);
    const openQuestions = (Array.isArray(conceptQuestions) ? conceptQuestions : [])
      .map((item) => cleanText(item?.text))
      .filter(Boolean)
      .slice(0, 5);
    const seedText = description || `${title} is a working concept promoted from Think into the durable wiki.`;
    const sourcePath = thinkSourcePath({ sourceType: 'concept', sourceId: concept._id, sourceLabel: title });
    return {
      title,
      pageType: 'concept',
      sourceScope: 'current_item',
      createdFrom: {
        type: 'concept',
        objectId: concept._id,
        objectIds: [concept._id],
        text: seedText,
        label: title,
        path: sourcePath
      },
      body: buildDoc({
        title,
        intro: seedText,
        sections: [
          {
            title: 'Current Framing',
            text: seedText
          },
          {
            title: 'Open Questions',
            text: openQuestions.length
              ? 'These questions were attached while the idea was still being developed.'
              : 'No open questions were attached at promotion time.',
            items: openQuestions
          },
          promotionProvenanceSection({ sourceType: 'concept', sourceId: concept._id, sourceLabel: title, sourcePath })
        ]
      })
    };
  }

  if (type === 'question' && question?._id) {
    const title = cleanText(question.text).replace(/[?!.]+$/g, '').split(/\s+/).slice(0, 8).join(' ') || 'Question';
    const questionText = cleanText(question.text);
    const linkedConcept = cleanText(question.linkedTagName || question.conceptName);
    const seedText = questionText || 'Question promoted from Think into the durable wiki.';
    const sourcePath = thinkSourcePath({ sourceType: 'question', sourceId: question._id, sourceLabel: questionText || title });
    return {
      title,
      pageType: 'question',
      sourceScope: 'current_item',
      createdFrom: {
        type: 'question',
        objectId: question._id,
        objectIds: [question._id],
        text: seedText,
        label: linkedConcept || 'Think question',
        path: sourcePath
      },
      body: buildDoc({
        title,
        intro: seedText,
        sections: [
          {
            title: 'Source Question',
            text: questionText || title
          },
          {
            title: 'Current Context',
            text: linkedConcept
              ? `This question was connected to ${linkedConcept} when it graduated from Think.`
              : 'This question was not connected to a concept when it graduated from Think.'
          },
          {
            title: 'Evidence To Gather',
            text: 'Use wiki maintenance to pull in source-backed evidence, contradictions, and neighboring pages.'
          },
          promotionProvenanceSection({ sourceType: 'question', sourceId: question._id, sourceLabel: questionText || title, sourcePath })
        ]
      })
    };
  }

  if (type === 'notebook' && notebook?._id) {
    const title = cleanText(notebook.title) || 'Notebook page';
    const bodyText = cleanHtmlText(notebook.content || notebook.text || notebook.summary);
    const tags = (Array.isArray(notebook.tags) ? notebook.tags : [])
      .map(cleanText)
      .filter(Boolean)
      .slice(0, 8);
    const seedText = bodyText || `${title} is a notebook page promoted from Think into the durable wiki.`;
    const sourcePath = thinkSourcePath({ sourceType: 'notebook', sourceId: notebook._id, sourceLabel: title });
    return {
      title,
      pageType: 'overview',
      sourceScope: 'current_item',
      createdFrom: {
        type: 'notebook',
        objectId: notebook._id,
        objectIds: [notebook._id],
        text: seedText,
        label: title,
        path: sourcePath
      },
      body: buildDoc({
        title,
        intro: seedText,
        sections: [
          {
            title: 'Source Notes',
            text: seedText
          },
          {
            title: 'Working Tags',
            text: tags.length
              ? 'These tags were attached while the idea was still exploratory.'
              : 'No tags were attached at promotion time.',
            items: tags
          },
          {
            title: 'Questions To Resolve',
            text: 'Use wiki maintenance to separate stable claims, weak evidence, and open questions before treating this page as durable.'
          },
          promotionProvenanceSection({ sourceType: 'notebook', sourceId: notebook._id, sourceLabel: title, sourcePath })
        ]
      })
    };
  }

  return null;
};

export default buildThinkWikiPromotionPayload;
