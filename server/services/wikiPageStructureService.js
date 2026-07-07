const WIKI_PAGE_TYPE_ALIASES = {
  person: 'entity',
  synthesis: 'overview'
};

const CONTRACTS = {
  concept: {
    label: 'Concept',
    intent: 'Explain a durable idea as a source-backed reference page.',
    sections: ['Core Idea', 'How It Works', 'Evidence', 'Tensions', 'Open Questions']
  },
  entity: {
    label: 'Entity',
    intent: 'Maintain a source-backed profile of an entity, its ideas, and relevance.',
    sections: ['Profile', 'Core Ideas', 'Evidence', 'Tensions', 'Related Pages']
  },
  source: {
    label: 'Source',
    intent: 'Summarize one source as a reusable reference with claims and implications.',
    sections: ['Source Thesis', 'Key Claims', 'Useful Evidence', 'Limitations', 'Related Pages']
  },
  question: {
    label: 'Question',
    intent: 'Answer the question directly while preserving uncertainty.',
    sections: ['Short Answer', 'Why It Matters', 'Evidence', 'What Would Change This', 'Open Questions']
  },
  comparison: {
    label: 'Comparison',
    intent: 'Compare multiple ideas, entities, or sources while making tradeoffs explicit.',
    sections: ['Comparison Frame', 'Similarities', 'Differences', 'Tradeoffs', 'Open Questions']
  },
  overview: {
    label: 'Overview',
    intent: 'Combine multiple pages or sources into a higher-level overview.',
    sections: ['Overview', 'Converging Evidence', 'Diverging Evidence', 'Implications', 'Open Questions']
  },
  project: {
    label: 'Project',
    intent: 'Track what the project is, why it matters, current state, and next decisions.',
    sections: ['Purpose', 'Current State', 'Key Decisions', 'Risks', 'Next Moves']
  },
  repo: {
    label: 'Repository',
    intent: 'Maintain a product-aware developer operating manual for a GitHub repository.',
    sections: [
      'Product orientation',
      'User experience map',
      'Developer quickstart',
      'Critical flows',
      'Architecture and ownership',
      'Common change paths',
      'Quality bar and invariants',
      'Failure modes',
      'Deploy and unknowns'
    ]
  },
  log: {
    label: 'Log',
    intent: 'Track dated observations, changes, and decisions as a source-backed working record.',
    sections: ['Latest Entry', 'Timeline', 'Decisions', 'Signals', 'Next Review']
  },
  topic: {
    label: 'Topic',
    intent: 'Explain a durable topic as a source-backed reference page.',
    sections: ['Core Idea', 'How It Works', 'Evidence', 'Tensions', 'Open Questions']
  }
};

const WIKI_PAGE_TYPES = Object.freeze(Object.keys(CONTRACTS));

const normalizePageType = (pageType = '') => {
  const raw = String(pageType || '').trim().toLowerCase();
  const canonical = WIKI_PAGE_TYPE_ALIASES[raw] || raw;
  return CONTRACTS[canonical] ? canonical : 'topic';
};

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
  normalizePageType,
  WIKI_PAGE_TYPES
};
