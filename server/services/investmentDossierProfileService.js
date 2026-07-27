const clean = (value = '', max = 1200) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const CORE_EVIDENCE_ARCHETYPES = Object.freeze([
  'filing',
  'company_product',
  'competitor_primary',
  'independent_domain',
  'market_snapshot'
]);

const CORE_ANALYSIS_MODULES = Object.freeze([
  'current_judgment',
  'customer_value_unit',
  'control_point_moat',
  'unit_economics_cash_conversion',
  'capital_reinvestment',
  'competitive_substitution',
  'reverse_expectations',
  'falsifiers',
  'next_evidence_clock'
]);

const BUSINESS_MODEL_ADAPTERS = Object.freeze({
  unknown: {
    label: 'Unclassified',
    keywords: [],
    evidenceArchetypes: [],
    analysisModules: []
  },
  subscription: {
    label: 'Subscription / SaaS',
    keywords: ['subscription', 'annual recurring revenue', 'arr', 'retention', 'seat-based', 'software-as-a-service', 'saas'],
    evidenceArchetypes: ['customer_economics'],
    analysisModules: ['retention_expansion', 'sales_efficiency', 'implementation_switching_cost']
  },
  marketplace: {
    label: 'Marketplace',
    keywords: ['marketplace', 'buyers and sellers', 'gross merchandise value', 'gmv', 'take rate', 'network liquidity'],
    evidenceArchetypes: ['customer_economics'],
    analysisModules: ['marketplace_liquidity', 'take_rate_contribution_margin', 'disintermediation']
  },
  industrial: {
    label: 'Industrial',
    keywords: ['manufacturing', 'industrial', 'equipment', 'dealer network', 'installed base', 'aftermarket', 'book-to-bill'],
    evidenceArchetypes: ['operating_benchmark'],
    analysisModules: ['price_volume_mix', 'installed_base_aftermarket', 'working_capital_cycle']
  },
  consumer_brand: {
    label: 'Consumer / brand',
    keywords: ['consumer', 'brand', 'retail distribution', 'repeat purchase', 'same-store', 'comparable sales'],
    evidenceArchetypes: ['customer_economics'],
    analysisModules: ['volume_price_mix', 'repeat_distribution', 'promotion_dependence']
  },
  membership_retail: {
    label: 'Membership retail',
    keywords: ['membership warehouse', 'membership fee', 'renewal rate', 'warehouse clubs', 'costco', 'executive membership'],
    evidenceArchetypes: ['customer_economics', 'operating_benchmark'],
    analysisModules: ['membership_economics', 'merchandise_value_gap', 'inventory_working_capital', 'warehouse_density']
  },
  financial_payments: {
    label: 'Financial / payments',
    keywords: ['payment volume', 'net interest', 'deposit', 'credit losses', 'capital ratio', 'transaction yield'],
    evidenceArchetypes: ['regulatory'],
    analysisModules: ['funding_and_losses', 'transaction_yield', 'regulatory_capital_liquidity']
  },
  infrastructure: {
    label: 'Semiconductor / infrastructure',
    keywords: ['semiconductor', 'accelerator', 'data center', 'cloud infrastructure', 'gpu', 'wafer', 'compute workload'],
    evidenceArchetypes: ['technical_benchmark'],
    analysisModules: ['accepted_workload_economics', 'utilization_reliability', 'capacity_refresh_cycle']
  },
  healthcare_biotech: {
    label: 'Healthcare / biotech',
    keywords: ['clinical trial', 'pipeline', 'fda', 'drug candidate', 'regulatory approval', 'biotechnology'],
    evidenceArchetypes: ['regulatory'],
    analysisModules: ['pipeline_probability', 'clinical_regulatory_gates', 'cash_runway_dilution']
  },
  hybrid: {
    label: 'Hybrid',
    keywords: [],
    evidenceArchetypes: [],
    analysisModules: []
  }
});

const unique = values => Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));

const normalize = (value = '') => clean(value, 2000).toLowerCase();

const claimHasEvidence = (claim = {}) => Boolean(
  (claim?.sourceRefIds || []).length
  || (claim?.citationIds || []).length
  || (claim?.citationIndexes || []).length
);

const claimLooksCalculated = (claim = {}) => {
  const text = clean(claim?.text || '', 3000);
  const numericInputs = text.match(/(?:\$?\d[\d,.]*\s*(?:%|percent|x|times|million|billion)?)/gi) || [];
  return claimHasEvidence(claim)
    && numericInputs.length >= 2
    && /(?:[=÷/×]|\b(?:equals?|implies?|requires?|divided by|multiplied by|minus|plus|less|spread|from .{0,40} to|versus|compared with)\b)/i.test(text)
    && /(?:%|percent|multiple|margin|yield|turnover|cash flow|working capital|market value|share price|revenue|earnings|return|cagr|growth|decline|increase|decrease|per share|billion|million|ratio|spread|conversion)/i.test(text);
};

const MODULE_CLAIM_RULES = Object.freeze({
  current_judgment: {
    sections: [/current judgment/i]
  },
  customer_value_unit: {
    sections: [/product and technical moat/i, /system and unit economics/i],
    keywords: /customer|farmer|dealer|productivity|uptime|yield|acre|fleet|equipment|value/i
  },
  control_point_moat: {
    sections: [/product and technical moat/i],
    keywords: /dealer|installed base|precision|software|data|distribution|service|switching|control point|moat/i
  },
  unit_economics_cash_conversion: {
    sections: [/system and unit economics/i],
    keywords: /margin|cash|working capital|inventory|receivable|finance|conversion|unit economics|price|volume|mix/i
  },
  capital_reinvestment: {
    sections: [/operating engine and capital allocation/i],
    keywords: /capital|reinvest|research|development|capex|acquisition|buyback|dividend|manufacturing|capacity/i
  },
  competitive_substitution: {
    sections: [/thesis-changing questions/i, /product and technical moat/i],
    keywords: /compet|substitut|alternative|rival|caterpillar|agco|cnhi|autonom|dealer|switch/i
  },
  reverse_expectations: {
    sections: [/implied expectations/i],
    keywords: /price|market value|expect|valuation|return|multiple|growth|margin|cash flow/i
  },
  falsifiers: {
    sections: [/what would change the thesis/i],
    keywords: /falsif|would (?:change|shift|validate|prove|invalidate)|evidence that|sustained|prolonged|break|decline|erosion|fail|monitor|threshold/i
  },
  next_evidence_clock: {
    sections: [/next evidence and maintenance test/i],
    keywords: /next|10-q|10-k|filing|evidence|test|review|update/i
  },
  price_volume_mix: {
    sections: [/system and unit economics/i, /operating engine and capital allocation/i],
    keywords: /price|pricing|volume|mix|shipment|production/i
  },
  installed_base_aftermarket: {
    sections: [/product and technical moat/i, /system and unit economics/i],
    keywords: /installed base|aftermarket|parts|service|dealer|fleet|replacement/i
  },
  working_capital_cycle: {
    sections: [/system and unit economics/i, /operating engine and capital allocation/i],
    keywords: /working capital|inventory|receivable|payable|cash conversion|floorplan|finance/i
  }
});

const claimsForModule = ({ moduleId = '', claims = [] } = {}) => {
  const rule = MODULE_CLAIM_RULES[moduleId];
  if (!rule) return [];
  return (Array.isArray(claims) ? claims : []).filter((claim) => {
    if (!claimHasEvidence(claim)) return false;
    const section = normalize(claim?.section);
    const text = normalize(claim?.text);
    if (!rule.sections.some(pattern => pattern.test(section))) return false;
    return !rule.keywords || rule.keywords.test(text);
  });
};

const compileInvestmentDossierResearchPlan = ({
  profile = {},
  page = {},
  candidates = [],
  claims = [],
  sourceRefs = [],
  now = new Date()
} = {}) => {
  const upgraded = upgradeInvestmentDossierProfile({
    profile,
    page,
    candidates: sourceRefs.length ? sourceRefs : candidates,
    now
  });
  const requiredModuleIds = upgraded.researchPlan?.requiredModuleIds || [];
  const modules = requiredModuleIds.map((id) => {
    const matchedClaims = claimsForModule({ moduleId: id, claims });
    const calculationClaims = ['reverse_expectations', 'unit_economics_cash_conversion'].includes(id)
      ? matchedClaims.filter(claimLooksCalculated)
      : [];
    return {
      id,
      status: matchedClaims.length ? 'complete' : 'missing',
      claimIds: unique(matchedClaims.map(claim => clean(claim?.claimId || '', 200))),
      calculationIds: unique(calculationClaims.map(claim => clean(claim?.claimId || '', 200))),
      sourceRefIds: unique(matchedClaims.flatMap(claim => (
        Array.isArray(claim?.sourceRefIds) ? claim.sourceRefIds.map(String) : []
      )))
    };
  });
  const reproducibleClaim = claimsForModule({
    moduleId: 'reverse_expectations',
    claims
  }).find(claimLooksCalculated) || claimsForModule({
    moduleId: 'unit_economics_cash_conversion',
    claims
  }).find(claimLooksCalculated);
  const insights = reproducibleClaim
    ? [{
        id: `claim:${clean(reproducibleClaim.claimId || '', 200)}`,
        text: clean(reproducibleClaim.text || '', 1200),
        claimIds: [clean(reproducibleClaim.claimId || '', 200)].filter(Boolean),
        sourceRefIds: unique((reproducibleClaim.sourceRefIds || []).map(String)),
        reproducible: true,
        derivedAt: now
      }]
    : [];
  return completeResearchPlan({
    profile: upgraded,
    businessModel: upgraded.businessModel?.primary,
    modules,
    evidenceArchetypes: (sourceRefs.length ? sourceRefs : candidates).map(inferEvidenceArchetype),
    insights,
    now
  });
};

const adapter = (businessModel = 'unknown') => (
  BUSINESS_MODEL_ADAPTERS[businessModel] || BUSINESS_MODEL_ADAPTERS.unknown
);

const buildResearchPlan = ({ businessModel = 'unknown', existing = {}, now = new Date() } = {}) => {
  const selected = adapter(businessModel);
  const requiredEvidenceArchetypes = unique([
    ...CORE_EVIDENCE_ARCHETYPES,
    ...selected.evidenceArchetypes
  ]);
  const requiredModuleIds = unique([
    ...CORE_ANALYSIS_MODULES,
    ...selected.analysisModules
  ]);
  const existingModules = new Map(
    (Array.isArray(existing.modules) ? existing.modules : [])
      .filter(row => row?.id)
      .map(row => [row.id, row])
  );
  const modules = requiredModuleIds.map(id => ({
    id,
    status: 'missing',
    claimIds: [],
    calculationIds: [],
    sourceRefIds: [],
    ...(existingModules.get(id) || {})
  }));
  const evidenceArchetypes = unique(existing.evidenceArchetypes);
  const completedIds = new Set(
    modules.filter(row => row.status === 'complete').map(row => row.id)
  );
  const missingModuleIds = requiredModuleIds.filter(id => !completedIds.has(id));
  const missingEvidenceArchetypes = requiredEvidenceArchetypes.filter(
    id => !evidenceArchetypes.includes(id)
  );
  return {
    version: 1,
    status: missingModuleIds.length || missingEvidenceArchetypes.length
      ? 'research_incomplete'
      : 'decision_ready',
    requiredEvidenceArchetypes,
    evidenceArchetypes,
    requiredModuleIds,
    modules,
    insights: Array.isArray(existing.insights) ? existing.insights : [],
    missingModuleIds,
    missingEvidenceArchetypes,
    updatedAt: now
  };
};

const classifyBusinessModel = ({ companyName = '', ticker = '', sourceText = '', explicit = '' } = {}) => {
  const normalizedExplicit = clean(explicit, 80).toLowerCase();
  if (normalizedExplicit && BUSINESS_MODEL_ADAPTERS[normalizedExplicit]) {
    return {
      primary: normalizedExplicit,
      adapters: [normalizedExplicit],
      confidence: 1,
      method: 'explicit',
      reason: 'The owner or research workflow selected the business-model adapter.'
    };
  }
  const haystack = `${companyName} ${ticker} ${sourceText}`.toLowerCase();
  const scored = Object.entries(BUSINESS_MODEL_ADAPTERS)
    .filter(([id]) => !['unknown', 'hybrid'].includes(id))
    .map(([id, definition]) => ({
      id,
      score: definition.keywords.reduce((sum, keyword) => (
        haystack.includes(keyword.toLowerCase()) ? sum + 1 : sum
      ), 0)
    }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (!scored.length) {
    return {
      primary: 'unknown',
      adapters: [],
      confidence: 0,
      method: 'unclassified',
      reason: 'The available evidence does not identify a business-model adapter yet.'
    };
  }
  const top = scored[0];
  const tied = scored.filter(row => row.score === top.score);
  const primary = tied.length > 1 ? 'hybrid' : top.id;
  return {
    primary,
    adapters: tied.map(row => row.id),
    confidence: Math.min(0.95, Number((0.55 + (top.score * 0.1)).toFixed(2))),
    method: 'deterministic_evidence_classifier',
    reason: tied.length > 1
      ? `Evidence matched multiple adapters: ${tied.map(row => adapter(row.id).label).join(', ')}.`
      : `Evidence most strongly matched the ${adapter(top.id).label} adapter.`
  };
};

const inferEvidenceArchetype = (source = {}) => {
  const explicit = clean(
    source?.metadata?.evidenceArchetype
      || source?.metadata?.evidence_archetype
      || '',
    80
  ).toLowerCase();
  if (explicit) return explicit;
  const provider = clean(source?.provider || source?.metadata?.source || '', 100).toLowerCase();
  const form = clean(source?.metadata?.form || '', 30).toUpperCase();
  const url = clean(source?.url || '', 500).toLowerCase();
  const title = clean(source?.title || '', 300).toLowerCase();
  if (provider === 'sec-edgar' || /^10-[KQ]$/.test(form) || url.includes('sec.gov/')) return 'filing';
  if (source?.metadata?.marketSnapshot || /(?:share price|market snapshot|stock price)/i.test(title)) return 'market_snapshot';
  if (/investor|annual report|earnings release|shareholder/i.test(title) && /(?:investor|ir\.)/.test(url)) return 'filing';
  if (/benchmark|standard|regulator|court|government|academic/i.test(`${title} ${provider}`)) return 'independent_domain';
  if (/competitor/i.test(source?.metadata?.role || '') || source?.metadata?.competitor === true) return 'competitor_primary';
  if (/pricing|product|technical|documentation|membership|customer/i.test(title)) return 'company_product';
  return clean(source?.metadata?.sourceType || '', 80).toLowerCase() || 'other';
};

const upgradeInvestmentDossierProfile = ({
  profile = {},
  page = {},
  candidates = [],
  explicitBusinessModel = '',
  now = new Date()
} = {}) => {
  const sourceText = (Array.isArray(candidates) ? candidates : [])
    .map(source => `${source?.title || ''} ${source?.text || source?.snippet || ''}`)
    .join(' ');
  const company = {
    ...(profile.company || {}),
    name: clean(profile?.company?.name || page?.externalWatches?.edgar?.companyName || '', 240),
    ticker: clean(profile?.company?.ticker || page?.externalWatches?.edgar?.ticker || '', 20).toUpperCase(),
    cik: clean(profile?.company?.cik || page?.externalWatches?.edgar?.cik || '', 20)
  };
  const existingPrimary = clean(profile?.businessModel?.primary || '', 80).toLowerCase();
  const businessModel = classifyBusinessModel({
    companyName: company.name,
    ticker: company.ticker,
    sourceText,
    explicit: explicitBusinessModel || (existingPrimary !== 'unknown' ? existingPrimary : '')
  });
  const existingPlan = profile.researchPlan || {};
  const observedArchetypes = unique([
    ...(existingPlan.evidenceArchetypes || []),
    ...(Array.isArray(candidates) ? candidates : []).map(inferEvidenceArchetype)
  ]).filter(value => value && value !== 'other');
  return {
    ...profile,
    version: 2,
    company,
    businessModel: {
      ...businessModel,
      classifiedAt: now
    },
    researchPlan: buildResearchPlan({
      businessModel: businessModel.primary,
      existing: {
        ...existingPlan,
        evidenceArchetypes: observedArchetypes
      },
      now
    })
  };
};

const completeResearchPlan = ({
  profile = {},
  businessModel,
  modules = [],
  evidenceArchetypes = [],
  insights = [],
  now = new Date()
} = {}) => {
  const upgraded = upgradeInvestmentDossierProfile({
    profile,
    explicitBusinessModel: businessModel,
    candidates: [],
    now
  });
  const moduleMap = new Map(
    (Array.isArray(modules) ? modules : [])
      .filter(row => row?.id)
      .map(row => [row.id, row])
  );
  const researchPlan = buildResearchPlan({
    businessModel: upgraded.businessModel.primary,
    existing: {
      ...upgraded.researchPlan,
      evidenceArchetypes: unique([
        ...(upgraded.researchPlan?.evidenceArchetypes || []),
        ...evidenceArchetypes
      ]),
      insights,
      modules: upgraded.researchPlan.requiredModuleIds.map(id => ({
        id,
        ...(moduleMap.get(id) || {})
      }))
    },
    now
  });
  return {
    ...upgraded,
    researchPlan
  };
};

module.exports = {
  BUSINESS_MODEL_ADAPTERS,
  CORE_ANALYSIS_MODULES,
  CORE_EVIDENCE_ARCHETYPES,
  buildResearchPlan,
  classifyBusinessModel,
  compileInvestmentDossierResearchPlan,
  completeResearchPlan,
  inferEvidenceArchetype,
  upgradeInvestmentDossierProfile
};
