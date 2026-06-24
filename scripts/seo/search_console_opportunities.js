#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const HEADER_ALIASES = {
  query: ['query', 'queries', 'top queries', 'search query', 'keyword', 'keywords', 'search keyword', 'search keywords'],
  page: ['page', 'pages', 'top pages', 'landing page', 'page url', 'landing page url', 'url'],
  clicks: ['clicks'],
  impressions: ['impressions'],
  ctr: ['ctr', 'site ctr', 'click through rate', 'click-through rate'],
  position: ['position', 'average position', 'avg position', 'average ranking']
};

const WEDGE_KEYWORDS = [
  'second brain',
  'pkm',
  'knowledge management',
  'note taking',
  'note app',
  'readwise',
  'highlight',
  'highlights',
  'concept',
  'concepts',
  'reading workflow',
  'reader workflow',
  'research workflow',
  'serious readers',
  'recall',
  'retrieval',
  'synthesis',
  'synthesise',
  'synthesize',
  'saved article',
  'ai reading',
  'reading ai',
  'notes app',
  'research app'
];

const COMPARISON_BRANDS = ['readwise', 'obsidian', 'roam', 'notion'];
const LOW_QUALITY_TERMS = ['jobs', 'career', 'salary', 'logo', 'pronunciation', 'meaning', 'wiki', 'wikipedia', 'torrent', 'apk', 'crack'];
const DEFAULT_SOURCE_LABEL = 'Google Search Console export';
const DEFAULT_EXPORT_PATH = path.join('data', 'growth', 'search-console', 'latest.tsv');

const CTA_BY_THEME = {
  import: 'Import your reading archive',
  concepts: 'Create your first concept',
  reading: 'Save your first article',
  synthesis: 'Build your first synthesis',
  draft: 'Turn an article into a draft',
  comparison: 'Create your first concept',
  secondBrain: 'Create your first concept',
  brand: 'Create your first concept',
  general: 'Import your reading archive'
};

const PLAYBOOK_BY_THEME = {
  readwise: {
    title: 'Readwise is not a second brain',
    slug: 'readwise-is-not-a-second-brain'
  },
  concepts: {
    title: 'How serious readers turn highlights into concepts',
    slug: 'highlights-into-concepts'
  },
  recall: {
    title: 'Most note apps solve capture, not recall',
    slug: 'most-note-apps-solve-capture-not-recall'
  },
  reading: {
    title: 'AI for reading without losing judgment',
    slug: 'ai-reading-without-losing-judgment'
  },
  founders: {
    title: 'Best second brain app for founders',
    slug: 'best-second-brain-app-for-founders'
  },
  researchers: {
    title: 'Best second brain app for researchers',
    slug: 'best-second-brain-app-for-researchers'
  },
  import: {
    title: 'How to import your reading archive into Noeis',
    slug: 'import-reading-archive-into-noeis'
  },
  synthesis: {
    title: 'Source-backed synthesis workflow in Noeis',
    slug: 'source-backed-synthesis-workflow'
  },
  draft: {
    title: 'From saved article to draft in Noeis',
    slug: 'from-saved-article-to-draft-in-noeis'
  }
};

function normalizeHeader(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getCanonicalField(header = '') {
  const normalized = normalizeHeader(header);
  const match = Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(normalized));
  return match ? match[0] : normalized;
}

function titleCase(value = '') {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

function toNumber(value, { percent = false } = {}) {
  if (value === null || value === undefined || value === '') return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const hasPercent = raw.includes('%');
  const parsed = Number(raw.replace(/[%,$]/g, ''));
  if (!Number.isFinite(parsed)) return 0;
  if (percent && !hasPercent && parsed <= 1) return parsed * 100;
  return parsed;
}

function detectDelimiter(input = '') {
  const sample = String(input || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('\n');
  const tabs = (sample.match(/\t/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  return tabs > commas ? '\t' : ',';
}

function parseDelimitedLine(line = '', delimiter = ',') {
  const values = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === delimiter && !quoted) {
      values.push(current);
      current = '';
      continue;
    }
    current += character;
  }

  values.push(current);
  return values.map(value => value.trim());
}

function pathFromPage(page = '') {
  const raw = String(page || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://www.noeis.io${raw.startsWith('/') ? raw : `/${raw}`}`);
    return url.pathname || '/';
  } catch (error) {
    return raw.startsWith('/') ? raw : `/${raw}`;
  }
}

function slugFromPage(page = '') {
  const pagePath = pathFromPage(page);
  if (!pagePath || pagePath === '/') return 'home';
  return pagePath.replace(/^\/+|\/+$/g, '') || 'home';
}

function tokenize(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function hasAnyKeyword(value = '', keywords = []) {
  const lower = String(value || '').toLowerCase();
  return keywords.some(keyword => lower.includes(keyword));
}

function detectTheme(query = '') {
  const lower = String(query || '').toLowerCase();
  if (lower.includes('readwise')) return 'readwise';
  if (lower.includes('founder')) return 'founders';
  if (lower.includes('research')) return 'researchers';
  if (lower.includes('import') || lower.includes('archive')) return 'import';
  if (lower.includes('draft') || lower.includes('saved article')) return 'draft';
  if (lower.includes('knowledge management') || lower.includes('pkm')) return 'concepts';
  if (lower.includes('highlight') || lower.includes('concept')) return 'concepts';
  if (lower.includes('synthesis') || lower.includes('draft')) return 'synthesis';
  if (lower.includes('second brain') || lower.includes('pkm')) return 'secondBrain';
  if (lower.includes('recall') || lower.includes('retrieval')) return 'recall';
  if (lower.includes('reading') || lower.includes('reader')) return 'reading';
  if (lower.includes('alternative') || lower.includes(' vs ') || lower.includes('compare')) return 'comparison';
  if (lower.includes('noeis')) return 'brand';
  return 'general';
}

function isWedgeAligned(query = '') {
  const lower = String(query || '').toLowerCase();
  if (lower.includes('noeis')) return true;
  if (hasAnyKeyword(lower, WEDGE_KEYWORDS)) return true;
  return COMPARISON_BRANDS.some(brand => (
    lower.includes(brand)
    && hasAnyKeyword(lower, ['alternative', 'vs', 'compare', 'second brain', 'pkm', 'reading workflow'])
  ));
}

function isLowQualityQuery(query = '', row = {}) {
  const lower = String(query || '').toLowerCase();
  if (LOW_QUALITY_TERMS.some(term => lower.includes(term))) {
    return 'The query is low-intent or off-strategy for signups and activated users.';
  }
  if (!isWedgeAligned(lower) && row.impressions < 20 && row.clicks === 0) {
    return 'The query has weak signal and does not map cleanly to Noeis category wedge.';
  }
  if (!isWedgeAligned(lower) && !lower.includes('noeis')) {
    return 'The query does not map to reliable recall, concept formation, serious reading workflows, or human-centered AI.';
  }
  return '';
}

function expectedCtrForPosition(position = 0) {
  if (position <= 3) return 9;
  if (position <= 6) return 4.5;
  if (position <= 10) return 3;
  if (position <= 20) return 1.5;
  return 0.75;
}

function matchesPageIntent(query = '', page = '') {
  const lowerQuery = String(query || '').toLowerCase();
  const pageSlug = slugFromPage(page);
  if (pageSlug === 'home') return lowerQuery.includes('noeis');

  const queryTokens = tokenize(lowerQuery);
  const pageTokens = tokenize(pageSlug.replace(/-/g, ' '));
  const overlap = queryTokens.filter(token => pageTokens.includes(token));
  if (overlap.length >= 2) return true;

  return detectTheme(lowerQuery) === detectTheme(pageSlug.replace(/-/g, ' '));
}

function isUnderperforming(row = {}) {
  const expectedCtr = expectedCtrForPosition(row.position);
  if (row.impressions >= 40 && row.position >= 4 && row.position <= 20) return true;
  if (row.impressions >= 25 && row.ctr < expectedCtr * 0.75) return true;
  return false;
}

function titleAndSlugForQuery(query = '') {
  const theme = detectTheme(query);
  if (PLAYBOOK_BY_THEME[theme]) return PLAYBOOK_BY_THEME[theme];
  const cleanQuery = String(query || '').trim();
  return {
    title: cleanQuery.toLowerCase().includes('noeis') ? titleCase(cleanQuery) : `${titleCase(cleanQuery)} for serious readers`,
    slug: slugify(cleanQuery)
  };
}

function activationCtaForQuery(query = '') {
  return CTA_BY_THEME[detectTheme(query)] || CTA_BY_THEME.general;
}

function parseSearchConsolePaste(input = '') {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    return {
      rows: [],
      errors: ['Provide a Google Search Console export file to analyze opportunities.']
    };
  }

  const delimiter = detectDelimiter(trimmed);
  const lines = trimmed.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) {
    return {
      rows: [],
      errors: ['The export needs a header row and at least one data row.']
    };
  }

  const headers = parseDelimitedLine(lines[0], delimiter).map(getCanonicalField);
  const queryIndex = headers.indexOf('query');
  const pageIndex = headers.indexOf('page');
  if (queryIndex === -1 && pageIndex === -1) {
    return {
      rows: [],
      errors: ['The export must include at least a query or page column.']
    };
  }

  const clicksIndex = headers.indexOf('clicks');
  const impressionsIndex = headers.indexOf('impressions');
  const ctrIndex = headers.indexOf('ctr');
  const positionIndex = headers.indexOf('position');
  const aggregate = new Map();

  lines.slice(1).forEach(line => {
    const values = parseDelimitedLine(line, delimiter);
    const query = queryIndex >= 0 ? String(values[queryIndex] || '').trim() : '';
    const page = pageIndex >= 0 ? String(values[pageIndex] || '').trim() : '';
    if (!query && !page) return;

    const key = `${query}::${page}`;
    const impressions = impressionsIndex >= 0 ? toNumber(values[impressionsIndex]) : 0;
    const clicks = clicksIndex >= 0 ? toNumber(values[clicksIndex]) : 0;
    const ctr = ctrIndex >= 0 ? toNumber(values[ctrIndex], { percent: true }) : 0;
    const position = positionIndex >= 0 ? toNumber(values[positionIndex]) : 0;
    const current = aggregate.get(key) || {
      query,
      page,
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
      rowCount: 0
    };

    const previousImpressions = current.impressions;
    current.clicks += clicks;
    current.impressions += impressions;
    current.ctr = current.impressions > 0 ? (current.clicks / current.impressions) * 100 : current.ctr + ctr;
    current.position = current.impressions > 0
      ? ((current.position * previousImpressions) + (position * Math.max(impressions, 1))) / Math.max(current.impressions, 1)
      : position;
    current.rowCount += 1;
    aggregate.set(key, current);
  });

  return {
    rows: Array.from(aggregate.values()).sort((left, right) => right.impressions - left.impressions),
    errors: []
  };
}

function evaluateSearchConsoleRows(rows = []) {
  const buckets = {
    improve: [],
    create: [],
    ignore: []
  };

  rows.forEach(row => {
    const query = row.query || slugFromPage(row.page).replace(/-/g, ' ');
    const lowQualityReason = isLowQualityQuery(query, row);
    if (lowQualityReason) {
      buckets.ignore.push({ query, reason: lowQualityReason, row, priority: row.impressions });
      return;
    }

    const currentPage = row.page || '';
    if (currentPage && matchesPageIntent(query, currentPage)) {
      const why = isUnderperforming(row)
        ? 'The page already targets the intent, but it is leaving clicks on the table relative to its ranking.'
        : 'The page is relevant, but it needs clearer answer-first coverage and stronger conversion framing.';
      buckets.improve.push({
        query,
        currentPage,
        why,
        proposedFix: `Tighten the intro around ${detectTheme(query) === 'brand' ? 'Noeis' : titleCase(query)}, add a direct definition, refresh headings for reliable recall/concept formation, and place the CTA "${activationCtaForQuery(query)}" above the fold.`,
        row,
        priority: row.impressions + (row.clicks * 10)
      });
      return;
    }

    if (row.impressions < 20 && row.clicks < 2) {
      buckets.ignore.push({
        query,
        reason: 'The query is strategic enough to watch, but the current signal is too small to justify a dedicated page yet.',
        row,
        priority: row.impressions
      });
      return;
    }

    const recommended = titleAndSlugForQuery(query);
    buckets.create.push({
      query,
      why: currentPage
        ? `The query intent is distinct from ${slugFromPage(currentPage).replace(/-/g, ' ')}, so improving the current page would create a muddy near-match.`
        : 'No current landing page in the export appears to satisfy this intent directly.',
      recommendedTitle: recommended.title,
      recommendedSlug: recommended.slug,
      activationCta: activationCtaForQuery(query),
      row,
      priority: row.impressions + (row.clicks * 12)
    });
  });

  return {
    improve: buckets.improve.sort((left, right) => right.priority - left.priority),
    create: buckets.create.sort((left, right) => right.priority - left.priority),
    ignore: buckets.ignore.sort((left, right) => right.priority - left.priority)
  };
}

function buildSearchConsoleOpportunityReport({ input = '', dateRange = '', source = DEFAULT_SOURCE_LABEL } = {}) {
  const parsed = parseSearchConsolePaste(input);
  const recommendations = evaluateSearchConsoleRows(parsed.rows);
  const totals = parsed.rows.reduce((summary, row) => ({
    clicks: summary.clicks + row.clicks,
    impressions: summary.impressions + row.impressions
  }), { clicks: 0, impressions: 0 });

  return {
    source,
    dateRange,
    rowCount: parsed.rows.length,
    totals,
    errors: parsed.errors,
    parsedRows: parsed.rows,
    recommendations
  };
}

function metricLabel(value = 0, suffix = '') {
  return `${new Intl.NumberFormat('en-US').format(Math.round(value * 10) / 10)}${suffix}`;
}

function buildSearchOpportunityExecutionBrief(report = {}) {
  const recommendations = report.recommendations || { improve: [], create: [], ignore: [] };
  const topOpportunity = [...(recommendations.improve || []), ...(recommendations.create || [])]
    .sort((left, right) => right.priority - left.priority)[0] || null;

  if (!topOpportunity) {
    return [
      '# Noeis Search Opportunity Brief',
      '',
      `Source: ${report.source || DEFAULT_SOURCE_LABEL}`,
      report.dateRange ? `Date range: ${report.dateRange}` : '',
      '',
      'No improve/create opportunity cleared the current threshold. Do not create content from this export yet.',
      'Next action: wait for more Google Search Console data or analyze a broader query/page export.'
    ].filter(Boolean).join('\n');
  }

  const action = topOpportunity.currentPage ? 'Improve existing page' : 'Create/refine page';
  const target = topOpportunity.currentPage || `/${topOpportunity.recommendedSlug}`;
  const title = topOpportunity.recommendedTitle || titleCase(topOpportunity.query);
  const activationCta = topOpportunity.activationCta || activationCtaForQuery(topOpportunity.query);
  const row = topOpportunity.row || {};

  return [
    '# Noeis Search Opportunity Brief',
    '',
    `Source: ${report.source || DEFAULT_SOURCE_LABEL}`,
    report.dateRange ? `Date range: ${report.dateRange}` : '',
    `Rows analyzed: ${report.rowCount || 0}`,
    `Total impressions: ${Math.round((report.totals && report.totals.impressions) || 0)}`,
    `Total clicks: ${Math.round((report.totals && report.totals.clicks) || 0)}`,
    '',
    `Highest-value action: ${action}`,
    `Primary query: ${topOpportunity.query}`,
    `Target: ${target}`,
    `Recommended title: ${title}`,
    `Activation CTA: ${activationCta}`,
    `Search signal: ${Math.round(row.impressions || 0)} impressions, ${Math.round(row.clicks || 0)} clicks, ${metricLabel(row.ctr || 0, '%')} CTR, position ${metricLabel(row.position || 0)}`,
    '',
    'Why this matters:',
    topOpportunity.why || topOpportunity.proposedFix || 'The query maps to Noeis source-grounded research wiki wedge and can drive signup-quality traffic.',
    '',
    'Execution steps:',
    topOpportunity.currentPage
      ? `1. Rewrite the first screen of ${target} to answer "${topOpportunity.query}" directly.`
      : `1. Create or refine ${target} around "${topOpportunity.query}".`,
    `2. Put the CTA "${activationCta}" above the fold and again after the proof section.`,
    '3. Add answer-first headings, FAQ schema where appropriate, and internal links from /guides and /examples when relevant.',
    '4. After deploy, check Marketing Analytics for signup and activation quality, not just clicks.',
    '',
    'Bucket counts:',
    `Improve: ${(recommendations.improve || []).length}`,
    `Create: ${(recommendations.create || []).length}`,
    `Ignore: ${(recommendations.ignore || []).length}`
  ].filter(Boolean).join('\n');
}

function parseArgs(argv = []) {
  const options = {
    file: process.env.SEARCH_CONSOLE_EXPORT || DEFAULT_EXPORT_PATH,
    out: '',
    dateRange: '',
    source: DEFAULT_SOURCE_LABEL,
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--file') options.file = argv[++index];
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--date-range') options.dateRange = argv[++index];
    else if (arg === '--source') options.source = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
  }

  return options;
}

function usage() {
  return [
    'Usage: node scripts/seo/search_console_opportunities.js --file <export.csv|export.tsv> [--out <brief.md>] [--date-range "Last 28 days"]',
    '',
    `Default file: ${DEFAULT_EXPORT_PATH}`,
    '',
    'Expected headers: Query, Page, Clicks, Impressions, CTR, Position',
    'The file can be comma- or tab-delimited.'
  ].join('\n');
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const exportPath = path.resolve(process.cwd(), options.file);
  if (!fs.existsSync(exportPath)) {
    process.stderr.write([
      `Missing Search Console export: ${exportPath}`,
      '',
      'Place the latest export there or pass --file <path>.',
      'No recommendations were generated because no real search data is available.'
    ].join('\n'));
    process.stderr.write('\n');
    return 2;
  }

  const input = fs.readFileSync(exportPath, 'utf8');
  const report = buildSearchConsoleOpportunityReport({
    input,
    dateRange: options.dateRange,
    source: options.source
  });

  const output = options.json
    ? JSON.stringify(report, null, 2)
    : buildSearchOpportunityExecutionBrief(report);

  if (options.out) {
    const outPath = path.resolve(process.cwd(), options.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${output}\n`);
    process.stdout.write(`Wrote Search Console opportunity brief: ${outPath}\n`);
  } else {
    process.stdout.write(`${output}\n`);
  }

  return report.errors.length ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  DEFAULT_EXPORT_PATH,
  parseSearchConsolePaste,
  evaluateSearchConsoleRows,
  buildSearchConsoleOpportunityReport,
  buildSearchOpportunityExecutionBrief,
  runCli
};
