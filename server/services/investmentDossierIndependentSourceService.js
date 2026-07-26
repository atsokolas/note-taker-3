const crypto = require('crypto');
const { fetchCompanySubmissions } = require('./edgarWatcherService');
const { fetchReaderDocument } = require('./investmentDossierOfficialSourceService');

const INDEPENDENT_SOURCE_REGISTRY = Object.freeze([
  Object.freeze({
    id: 'gao-precision-agriculture-2024',
    sicCodes: Object.freeze(['3523']),
    sicDescriptionPattern: /farm machinery|agricultural machinery/i,
    title: 'Precision Agriculture: Benefits and Challenges for Technology Adoption and Use',
    agency: 'U.S. Government Accountability Office',
    publicationDate: '2024-01-31',
    reportNumber: 'GAO-24-105962',
    url: 'https://www.gao.gov/products/gao-24-105962',
    officialWebsite: 'https://www.gao.gov/',
    provider: 'gao-technology-assessment',
    sourceClass: 'government_technology_assessment',
    requiredSignals: Object.freeze([
      Object.freeze({ id: 'precision_agriculture', pattern: /\bprecision agriculture\b/i }),
      Object.freeze({ id: 'adoption', pattern: /\badoption\b/i }),
      Object.freeze({ id: 'customer_economics', pattern: /\b(high up-front|acquisition) costs?\b/i }),
      Object.freeze({ id: 'data_rights', pattern: /\bdata (?:sharing|ownership)\b/i }),
      Object.freeze({ id: 'interoperability', pattern: /\b(interoperability|uniform standards)\b/i })
    ])
  })
]);

const clean = (value = '', max = 12000) => String(value || '')
  .replace(/\r/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{4,}/g, '\n\n\n')
  .trim()
  .slice(0, max);

const normalizeSic = value => String(value || '').replace(/\D/g, '').slice(0, 4);

const resolveIndependentSourceDescriptor = ({
  sic = '',
  sicDescription = ''
} = {}) => {
  const normalizedSic = normalizeSic(sic);
  return INDEPENDENT_SOURCE_REGISTRY.find(descriptor => (
    descriptor.sicCodes.includes(normalizedSic)
    || (
      !normalizedSic
      && descriptor.sicDescriptionPattern.test(String(sicDescription || ''))
    )
  )) || null;
};

const assessIndependentDocument = ({
  document = {},
  descriptor = {}
} = {}) => {
  const markdown = clean(document.markdown || '', 30000);
  const title = clean(document.title || '', 500);
  const wordCount = markdown.split(/\s+/).filter(Boolean).length;
  const matchedSignals = (descriptor.requiredSignals || [])
    .filter(signal => signal.pattern.test(markdown))
    .map(signal => signal.id);
  const titleMatched = title.toLowerCase().includes(
    String(descriptor.title || '').toLowerCase()
  );
  const reportNumberMatched = new RegExp(
    String(descriptor.reportNumber || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'i'
  ).test(markdown);
  const accepted = wordCount >= 500
    && titleMatched
    && reportNumberMatched
    && matchedSignals.length === (descriptor.requiredSignals || []).length;
  return {
    accepted,
    wordCount,
    characterCount: markdown.length,
    titleMatched,
    reportNumberMatched,
    matchedSignals,
    reasons: accepted
      ? []
      : ['The authoritative report did not contain the expected identity and decision-relevant evidence signals.']
  };
};

const sourceRefFromIndependentDocument = ({
  document = {},
  descriptor = {},
  assessment = {},
  sic = '',
  sicDescription = '',
  now = new Date()
} = {}) => {
  const retrievedAt = new Date(now).toISOString();
  const snippet = clean(document.markdown || '', 12000);
  const contentHash = crypto.createHash('sha256').update(snippet).digest('hex');
  return {
    type: 'external',
    title: descriptor.title,
    snippet,
    url: descriptor.url,
    citationLabel: `${descriptor.agency} · ${descriptor.publicationDate}`,
    provider: descriptor.provider,
    metadata: {
      evidenceArchetype: 'independent_domain',
      sourceClass: descriptor.sourceClass,
      acquisitionMethod: 'curated_sic_official_registry',
      registryId: descriptor.id,
      agency: descriptor.agency,
      reportNumber: descriptor.reportNumber,
      publicationDate: descriptor.publicationDate,
      sic: normalizeSic(sic),
      sicDescription: clean(sicDescription, 240),
      provenance: {
        retrievedAt,
        contentHash,
        originalUrl: descriptor.url,
        renderedVia: 'https://r.jina.ai',
        licenseOrAccess: 'public'
      },
      validation: {
        status: 'accepted',
        wordCount: assessment.wordCount,
        characterCount: assessment.characterCount,
        titleMatched: assessment.titleMatched,
        reportNumberMatched: assessment.reportNumberMatched,
        matchedSignals: assessment.matchedSignals,
        reasons: []
      }
    },
    addedBy: 'ai'
  };
};

const isTransientError = error => (
  error?.name === 'AbortError'
  || Number(error?.statusCode) === 408
  || Number(error?.statusCode) === 429
  || Number(error?.statusCode) >= 500
);

const acquireIndependentDomainSource = async ({
  cik = '',
  sic = '',
  sicDescription = '',
  fetchImpl = global.fetch,
  fetchCompanySubmissionsFn = fetchCompanySubmissions,
  fetchReaderDocumentFn = fetchReaderDocument,
  now = new Date()
} = {}) => {
  let resolvedSic = normalizeSic(sic);
  let resolvedSicDescription = clean(sicDescription, 240);
  if (!resolvedSic) {
    const submissions = await fetchCompanySubmissionsFn({ cik, fetchImpl });
    resolvedSic = normalizeSic(submissions?.sic);
    resolvedSicDescription = clean(submissions?.sicDescription, 240);
  }
  const descriptor = resolveIndependentSourceDescriptor({
    sic: resolvedSic,
    sicDescription: resolvedSicDescription
  });
  if (!descriptor) {
    return {
      sourceRef: null,
      stop: {
        code: 'INDEPENDENT_DOMAIN_COVERAGE_UNAVAILABLE',
        evidenceArchetype: 'independent_domain',
        message: 'Noeis does not yet have a verified independent benchmark for this SEC industry. It will not attach a generic government page.'
      },
      classification: {
        sic: resolvedSic,
        sicDescription: resolvedSicDescription
      }
    };
  }
  let document;
  try {
    document = await fetchReaderDocumentFn({
      url: descriptor.url,
      officialWebsite: descriptor.officialWebsite,
      fetchImpl
    });
  } catch (error) {
    if (isTransientError(error)) throw error;
    return {
      sourceRef: null,
      stop: {
        code: 'INDEPENDENT_DOMAIN_SOURCE_UNAVAILABLE',
        evidenceArchetype: 'independent_domain',
        message: 'The verified independent benchmark could not be read. The saved evidence is unchanged.'
      },
      classification: {
        sic: resolvedSic,
        sicDescription: resolvedSicDescription
      },
      diagnostic: clean(error?.message || '', 500)
    };
  }
  const assessment = assessIndependentDocument({ document, descriptor });
  if (!assessment.accepted) {
    return {
      sourceRef: null,
      stop: {
        code: 'INDEPENDENT_DOMAIN_SOURCE_INSUFFICIENT',
        evidenceArchetype: 'independent_domain',
        message: 'The authoritative report did not contain the expected decision-relevant evidence, so Noeis left the evidence class incomplete.'
      },
      classification: {
        sic: resolvedSic,
        sicDescription: resolvedSicDescription
      },
      assessment
    };
  }
  return {
    sourceRef: sourceRefFromIndependentDocument({
      document,
      descriptor,
      assessment,
      sic: resolvedSic,
      sicDescription: resolvedSicDescription,
      now
    }),
    stop: null,
    classification: {
      sic: resolvedSic,
      sicDescription: resolvedSicDescription
    },
    assessment
  };
};

module.exports = {
  INDEPENDENT_SOURCE_REGISTRY,
  acquireIndependentDomainSource,
  assessIndependentDocument,
  normalizeSic,
  resolveIndependentSourceDescriptor,
  sourceRefFromIndependentDocument
};
