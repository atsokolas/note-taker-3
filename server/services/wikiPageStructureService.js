const CONTRACTS = {
  topic: {
    label: 'Topic',
    intent: 'Explain a durable concept as a source-backed reference page.',
    sections: ['Core Idea', 'How It Works', 'Evidence', 'Tensions', 'Open Questions']
  },
  question: {
    label: 'Question',
    intent: 'Answer the question directly while preserving uncertainty.',
    sections: ['Short Answer', 'Why It Matters', 'Evidence', 'What Would Change This', 'Open Questions']
  },
  project: {
    label: 'Project',
    intent: 'Track what the project is, why it matters, current state, and next decisions.',
    sections: ['Purpose', 'Current State', 'Key Decisions', 'Risks', 'Next Moves']
  },
  source: {
    label: 'Source',
    intent: 'Summarize one source as a reusable reference with claims and implications.',
    sections: ['Source Thesis', 'Key Claims', 'Useful Evidence', 'Limitations', 'Related Pages']
  },
  person: {
    label: 'Person',
    intent: 'Maintain a source-backed profile of a person, their ideas, and relevance.',
    sections: ['Profile', 'Core Ideas', 'Evidence', 'Tensions', 'Related Pages']
  },
  synthesis: {
    label: 'Synthesis',
    intent: 'Combine multiple pages or sources into a higher-level read.',
    sections: ['Synthesis', 'Converging Evidence', 'Diverging Evidence', 'Implications', 'Open Questions']
  }
};

const normalizePageType = (pageType = '') => (
  CONTRACTS[String(pageType || '').trim()] ? String(pageType).trim() : 'topic'
);

const getWikiPageStructure = (pageType = 'topic') => {
  const type = normalizePageType(pageType);
  return { type, ...CONTRACTS[type] };
};

const normalizeHeading = (value = '') => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

const emptySection = (heading) => ({
  heading,
  paragraphs: [{
    text: `${heading} still needs source-backed development.`,
    citationIndexes: []
  }],
  bullets: []
});

const alignArticleToPageStructure = ({ article = {}, pageType = 'topic' } = {}) => {
  const contract = getWikiPageStructure(pageType);
  const sections = Array.isArray(article.sections) ? article.sections : [];
  const sectionByHeading = new Map(sections.map(section => [normalizeHeading(section?.heading || section?.title), section]));
  const ordered = contract.sections.map((heading) => sectionByHeading.get(normalizeHeading(heading)) || emptySection(heading));
  const extra = sections.filter(section => !contract.sections.some(heading => normalizeHeading(heading) === normalizeHeading(section?.heading || section?.title)));
  return {
    ...article,
    sections: [...ordered, ...extra].slice(0, 9)
  };
};

module.exports = {
  alignArticleToPageStructure,
  getWikiPageStructure,
  normalizePageType
};
