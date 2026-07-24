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
    intent: 'Maintain an evidence-first developer dossier for a GitHub repository.',
    sections: [
      'What this repo is',
      'How to run and prove changes',
      'Architecture map',
      'Critical flows',
      'Change paths',
      'Risks and unknowns'
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

const INVESTMENT_DOSSIER_SECTIONS = Object.freeze([
  'Current Judgment',
  'Implied Expectations',
  'Thesis-Changing Questions',
  'Product and Technical Moat',
  'System and Unit Economics',
  'Operating Engine and Capital Allocation',
  'Obligations, Concentration, and Policy',
  'What Would Change the Thesis',
  'Next Evidence and Maintenance Test'
]);

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

const isInvestmentDossierPage = ({ page = {}, candidates = [] } = {}) => {
  if (normalizePageType(page?.pageType) === 'repo') return false;
  const edgar = page?.externalWatches?.edgar || {};
  const watchedCompany = Boolean(
    String(edgar.ticker || '').trim()
    || String(edgar.cik || '').trim()
  );
  const hasSecEvidence = (Array.isArray(candidates) ? candidates : []).some((source) => {
    const provider = String(source?.provider || '').trim().toLowerCase();
    const sourceType = String(source?.metadata?.source || source?.metadata?.provider || '').trim().toLowerCase();
    return provider === 'sec-edgar' || sourceType === 'sec-edgar';
  });
  return watchedCompany || hasSecEvidence;
};

const getWikiPageStructureForPage = ({ page = {}, candidates = [] } = {}) => {
  if (!isInvestmentDossierPage({ page, candidates })) {
    return getWikiPageStructure(page?.pageType || 'topic');
  }
  return {
    type: normalizePageType(page?.pageType || 'entity'),
    profile: 'investment_dossier',
    label: 'Company dossier',
    intent: 'Maintain an evidence-backed investment judgment that connects business quality, technical moat, unit economics, capital obligations, valuation, falsifiers, and the next public evidence clock.',
    sections: [...INVESTMENT_DOSSIER_SECTIONS]
  };
};

const normalizeHeading = (value = '') => String(value || '')
  .replace(/&/g, ' and ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const investmentDossierHeadingMatch = (target = '', candidate = '') => {
  const expected = normalizeHeading(target);
  const actual = normalizeHeading(candidate);
  if (expected === actual) return true;
  if (expected === 'next evidence and maintenance test') {
    return actual === 'next evidence'
      || actual === 'maintenance test'
      || (actual.includes('next evidence') && actual.includes('maintenance'));
  }
  return false;
};

const emptySection = (heading) => ({
  heading,
  paragraphs: [{
    text: `${heading} still needs source-backed development.`,
    citationIndexes: []
  }],
  bullets: []
});

const LIVING_THESIS_SECTIONS = Object.freeze([
  'Current judgment',
  'Why this matters',
  'Causal model',
  'Claims ledger',
  'Evidence for',
  'Evidence against',
  'Critical assumptions',
  'Unknowns',
  'What would change my mind',
  'Implications',
  'Next evidence',
  'Decision ledger',
  'Change log'
]);

const buildLivingThesisBody = () => ({
  type: 'doc',
  content: LIVING_THESIS_SECTIONS.flatMap(heading => ([
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: heading }] },
    { type: 'paragraph' }
  ]))
});

const alignArticleToPageStructure = ({ article = {}, pageType = 'topic', structure = null } = {}) => {
  const contract = structure || getWikiPageStructure(pageType);
  if (contract.type === 'repo') {
    const sections = Array.isArray(article.sections) ? article.sections : [];
    return {
      ...article,
      sections: sections.slice(0, 10)
    };
  }
  const sections = Array.isArray(article.sections) ? article.sections : [];
  const sectionByHeading = new Map(sections.map(section => [normalizeHeading(section?.heading || section?.title), section]));
  const findSection = (heading) => sectionByHeading.get(normalizeHeading(heading))
    || (contract.profile === 'investment_dossier'
      ? sections.find(section => investmentDossierHeadingMatch(heading, section?.heading || section?.title))
      : null);
  const ordered = contract.sections.map((heading) => {
    const section = findSection(heading);
    return section ? { ...section, heading } : emptySection(heading);
  });
  const extra = sections.filter(section => !contract.sections.some(heading => (
    contract.profile === 'investment_dossier'
      ? investmentDossierHeadingMatch(heading, section?.heading || section?.title)
      : normalizeHeading(heading) === normalizeHeading(section?.heading || section?.title)
  )));
  return {
    ...article,
    sections: [...ordered, ...extra].slice(0, 9)
  };
};

module.exports = {
  alignArticleToPageStructure,
  buildLivingThesisBody,
  getWikiPageStructure,
  getWikiPageStructureForPage,
  INVESTMENT_DOSSIER_SECTIONS,
  isInvestmentDossierPage,
  LIVING_THESIS_SECTIONS,
  normalizePageType,
  WIKI_PAGE_TYPES
};
