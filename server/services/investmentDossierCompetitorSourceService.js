const crypto = require('crypto');
const {
  buildFilingUrl,
  fetchCompanySubmissions,
  fetchCompanyTickerRegistry,
  fetchFilingDocument,
  latestTrackedFilings,
  padCik
} = require('./edgarWatcherService');

const ANNUAL_FORMS = Object.freeze(['10-K']);
const CORPORATE_NAME_PATTERN = /\b((?:The\s+)?[A-Z][A-Za-z0-9&'’-]*(?:\s+(?:[A-Z][A-Za-z0-9&.'’()-]*|and|of)){0,7}\s+(?:Corporation|Corp\.?|Company|Co\.?|Inc\.?|N\.V\.|NV|PLC|plc|KGaA(?:\s+mbH)?|Ltd\.?))(?=\s*[,.;)]|$)/g;
const DECLARATION_PATTERNS = Object.freeze([
  /\bcompetitors?,\s+such as\s+(.+?)(?:\.|$)/i,
  /\bcompetitors?\b[^.]{0,100}?\b(?:include|includes)\s+(.+?)(?:\.|$)/i,
  /\b(?:principal|primary|major)\s+competitors?\s+(?:are|include)\s+(.+?)(?:\.|$)/i
]);
const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const clean = (value = '', limit = 16000) => String(value || '')
  .replace(/\r/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{4,}/g, '\n\n\n')
  .trim()
  .slice(0, limit);

const isTransientError = error => (
  error?.name === 'AbortError'
  || TRANSIENT_STATUS_CODES.has(Number(error?.statusCode))
);

const normalizeLegalName = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/\/[a-z]{2}\b/g, ' ')
  .replace(/\b(the|incorporated|inc|corp|corporation|company|co|limited|ltd|plc|nv|kgaa|mbh)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const protectSentenceAbbreviations = (value = '') => String(value || '')
  .replace(/\bN\.V\./g, 'N§V§')
  .replace(/\bInc\./g, 'Inc§')
  .replace(/\bCorp\./g, 'Corp§')
  .replace(/\bCo\./g, 'Co§')
  .replace(/\bLtd\./g, 'Ltd§');

const sentenceCandidates = (text = '') => protectSentenceAbbreviations(text)
  .replace(/\s+/g, ' ')
  .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
  .map(sentence => sentence.trim())
  .filter(sentence => sentence.length >= 40 && sentence.length <= 1800);

const extractExplicitCompetitorMentions = ({ text = '', issuerName = '' } = {}) => {
  const issuerBase = normalizeLegalName(issuerName);
  const mentions = [];
  const seen = new Set();
  sentenceCandidates(text).forEach((sentence) => {
    const declaration = DECLARATION_PATTERNS
      .map(pattern => sentence.match(pattern))
      .find(Boolean);
    if (!declaration?.[1]) return;
    const listText = declaration[1].replace(/§/g, '.');
    let match;
    CORPORATE_NAME_PATTERN.lastIndex = 0;
    while ((match = CORPORATE_NAME_PATTERN.exec(listText))) {
      const name = clean(match[1], 240);
      const base = normalizeLegalName(name);
      if (!base || base === issuerBase || seen.has(base)) continue;
      seen.add(base);
      mentions.push({
        name,
        normalizedName: base,
        sentence: clean(sentence.replace(/§/g, '.'), 1800),
        extractionMethod: 'explicit_competitor_declaration'
      });
    }
  });
  return mentions.slice(0, 12);
};

const resolveCompetitorRegistryMatch = ({
  competitorName = '',
  registryRows = [],
  issuerCik = ''
} = {}) => {
  const normalizedName = normalizeLegalName(competitorName);
  if (!normalizedName) return null;
  const matchesByCik = new Map();
  (Array.isArray(registryRows) ? registryRows : []).forEach((row) => {
    const rowName = normalizeLegalName(row?.companyName);
    const cik = String(row?.cik || '').replace(/\D/g, '').replace(/^0+/, '');
    if (!rowName || !cik || cik === String(issuerCik || '').replace(/\D/g, '').replace(/^0+/, '')) return;
    const exact = rowName === normalizedName;
    const contained = rowName.startsWith(`${normalizedName} `)
      || normalizedName.startsWith(`${rowName} `);
    if (!exact && !contained) return;
    if (!matchesByCik.has(cik)) {
      matchesByCik.set(cik, {
        cik: padCik(cik),
        ticker: String(row?.ticker || '').toUpperCase(),
        companyName: clean(row?.companyName, 240),
        disclosedName: clean(competitorName, 240),
        matchMethod: exact ? 'normalized_legal_name_exact' : 'normalized_legal_name_contained'
      });
    }
  });
  return matchesByCik.size === 1 ? Array.from(matchesByCik.values())[0] : null;
};

const extractCompetitorPrimaryExcerpt = (text = '') => {
  const normalized = clean(String(text || '').replace(/\s+/g, ' '), 120000);
  if (!normalized) return '';
  const markers = [
    /\bItem\s+1[.:]?\s+Business\b/i,
    /\bBusiness\s+Overview\b/i,
    /\bProducts?\s+and\s+Services\b/i,
    /\bCompetition\b/i
  ];
  const windows = [];
  const starts = new Set();
  markers.forEach((pattern) => {
    const index = normalized.search(pattern);
    if (index < 0) return;
    const start = Math.max(0, index - 300);
    if (starts.has(start)) return;
    starts.add(start);
    windows.push(normalized.slice(start, start + 5000));
  });
  const excerpt = clean(windows.length ? windows.join('\n\n') : normalized.slice(0, 12000), 16000);
  const wordCount = excerpt.split(/\s+/).filter(Boolean).length;
  return excerpt.length >= 1200 && wordCount >= 180 ? excerpt : '';
};

const acquireCompetitorPrimarySource = async ({
  issuer = {},
  issuerFiling = null,
  fetchCompanySubmissionsFn = fetchCompanySubmissions,
  fetchCompanyTickerRegistryFn = fetchCompanyTickerRegistry,
  fetchFilingDocumentFn = fetchFilingDocument,
  now = new Date()
} = {}) => {
  const issuerCik = String(issuer.cik || '').replace(/\D/g, '');
  if (!issuerCik) {
    return {
      evidence: null,
      stop: {
        code: 'COMPETITOR_ISSUER_CIK_MISSING',
        evidenceArchetype: 'competitor_primary',
        message: 'Noeis could not inspect named competitors without the issuer SEC identifier.'
      }
    };
  }
  let issuerAnnual = issuerFiling?.text ? {
    form: '10-K',
    accessionNumber: issuerFiling.accessionNumber || '',
    primaryDocument: issuerFiling.primaryDocument || '',
    filingDate: issuerFiling.filingDate || '',
    reportDate: issuerFiling.reportDate || ''
  } : null;
  if (!issuerAnnual) {
    const issuerSubmissions = await fetchCompanySubmissionsFn({ cik: issuerCik });
    issuerAnnual = latestTrackedFilings({
      submissions: issuerSubmissions,
      forms: ['10-K'],
      limit: 1
    })[0];
  }
  if (!issuerAnnual) {
    return {
      evidence: null,
      stop: {
        code: 'ISSUER_ANNUAL_FILING_UNAVAILABLE',
        evidenceArchetype: 'competitor_primary',
        message: 'The issuer annual filing needed to verify a named competitor was unavailable.'
      }
    };
  }
  const issuerFilingUrl = issuerFiling?.url || buildFilingUrl({
    cik: issuerCik,
    accessionNumber: issuerAnnual.accessionNumber,
    primaryDocument: issuerAnnual.primaryDocument
  });
  const issuerText = issuerFiling?.text || await fetchFilingDocumentFn({ url: issuerFilingUrl });
  const mentions = extractExplicitCompetitorMentions({
    text: issuerText,
    issuerName: issuer.companyName
  });
  if (!mentions.length) {
    return {
      evidence: null,
      stop: {
        code: 'EXPLICIT_NAMED_COMPETITOR_NOT_FOUND',
        evidenceArchetype: 'competitor_primary',
        message: 'The issuer filing did not explicitly name a competitor that could be resolved safely.'
      }
    };
  }
  const registryRows = await fetchCompanyTickerRegistryFn();
  const resolved = mentions
    .map(mention => ({
      mention,
      competitor: resolveCompetitorRegistryMatch({
        competitorName: mention.name,
        registryRows,
        issuerCik
      })
    }))
    .filter(row => row.competitor)
    .slice(0, 4);
  if (!resolved.length) {
    return {
      evidence: null,
      stop: {
        code: 'NAMED_COMPETITOR_SEC_IDENTITY_AMBIGUOUS',
        evidenceArchetype: 'competitor_primary',
        message: 'Named competitors were present, but none mapped unambiguously to one SEC issuer.'
      }
    };
  }
  const transientErrors = [];
  for (const row of resolved) {
    try {
      const submissions = await fetchCompanySubmissionsFn({ cik: row.competitor.cik });
      const annual = latestTrackedFilings({
        submissions,
        forms: ANNUAL_FORMS,
        limit: 1
      })[0];
      if (!annual) continue;
      const url = buildFilingUrl({
        cik: row.competitor.cik,
        accessionNumber: annual.accessionNumber,
        primaryDocument: annual.primaryDocument
      });
      const filingText = clean(await fetchFilingDocumentFn({ url }), 120000);
      const excerpt = extractCompetitorPrimaryExcerpt(filingText);
      if (!excerpt) continue;
      const retrievedAt = new Date(now).toISOString();
      const contentHash = crypto.createHash('sha256').update(filingText).digest('hex');
      const disclosureHash = crypto
        .createHash('sha256')
        .update(row.mention.sentence)
        .digest('hex');
      return {
        evidence: {
          sourceType: 'external',
          provider: 'sec-edgar',
          externalId: `sec-edgar-competitor:${row.competitor.cik}:${annual.accessionNumber}`,
          eventType: 'updated',
          title: `${row.competitor.companyName} ${annual.form} competitor primary evidence`,
          summary: excerpt,
          text: filingText,
          url,
          sourceUpdatedAt: annual.filingDate || annual.reportDate || null,
          status: 'ignored',
          metadata: {
            evidenceArchetype: 'competitor_primary',
            sourceClass: 'competitor_primary',
            acquisitionMethod: 'issuer_filing_named_competitor',
            role: 'named_competitor',
            competitor: true,
            namedByIssuer: {
              issuerCik: padCik(issuerCik),
              issuerTicker: clean(issuer.ticker, 20).toUpperCase(),
              issuerFilingUrl,
              issuerForm: issuerAnnual.form,
              issuerAccessionNumber: issuerAnnual.accessionNumber,
              disclosureSentence: row.mention.sentence,
              disclosureHash,
              disclosedName: row.mention.name
            },
            competitorIssuer: {
              cik: row.competitor.cik,
              ticker: row.competitor.ticker,
              companyName: row.competitor.companyName,
              matchMethod: row.competitor.matchMethod,
              form: annual.form,
              filingDate: annual.filingDate || '',
              reportDate: annual.reportDate || '',
              accessionNumber: annual.accessionNumber
            },
            provenance: {
              retrievedAt,
              contentHash,
              originalUrl: url,
              licenseOrAccess: 'public'
            },
            validation: {
              status: 'accepted',
              explicitIssuerDisclosure: true,
              uniqueSecIdentity: true,
              primaryAnnualFiling: true,
              reasons: []
            }
          }
        },
        stop: null
      };
    } catch (error) {
      if (isTransientError(error)) transientErrors.push(error);
    }
  }
  if (transientErrors.length) throw transientErrors.at(-1);
  return {
    evidence: null,
    stop: {
      code: 'COMPETITOR_PRIMARY_FILING_UNAVAILABLE',
      evidenceArchetype: 'competitor_primary',
      message: 'No unambiguous named competitor had a readable primary annual filing.'
    }
  };
};

module.exports = {
  acquireCompetitorPrimarySource,
  extractCompetitorPrimaryExcerpt,
  extractExplicitCompetitorMentions,
  normalizeLegalName,
  resolveCompetitorRegistryMatch
};
