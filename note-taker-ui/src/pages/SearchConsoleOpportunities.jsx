import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Page, TagChip } from '../components/ui';

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
const SAMPLE_INPUT = [
  'Query\tPage\tClicks\tImpressions\tCTR\tPosition',
  'ai second brain\thttps://www.noeis.io/ai-second-brain\t14\t620\t2.3%\t8.1',
  'readwise alternative\thttps://www.noeis.io/\t2\t144\t1.4%\t15.8',
  'how to turn highlights into concepts\thttps://www.noeis.io/personal-knowledge-management-ai\t5\t91\t5.5%\t9.2',
  'noeis jobs\thttps://www.noeis.io/\t0\t11\t0%\t41.0'
].join('\n');

const DEFAULT_SOURCE_LABEL = 'Google Search Console export';

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

const normalizeHeader = (value = '') => (
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
);

const titleCase = (value = '') => (
  String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
);

const slugify = (value = '') => (
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
);

const toNumber = (value, { percent = false } = {}) => {
  if (value === null || value === undefined || value === '') return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const hasPercent = raw.includes('%');
  const parsed = Number(raw.replace(/[%,$]/g, ''));
  if (!Number.isFinite(parsed)) return 0;
  if (percent && !hasPercent && parsed <= 1) {
    return parsed * 100;
  }
  return parsed;
};

const getCanonicalField = (header = '') => {
  const normalized = normalizeHeader(header);
  return Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(normalized))?.[0] || normalized;
};

const detectDelimiter = (input = '') => {
  const lines = String(input || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const sample = lines.slice(0, 3).join('\n');
  const tabs = (sample.match(/\t/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  return tabs > commas ? '\t' : ',';
};

const parseDelimitedLine = (line = '', delimiter = ',') => {
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
};

const pathFromPage = (page = '') => {
  const raw = String(page || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://www.noeis.io${raw.startsWith('/') ? raw : `/${raw}`}`);
    return url.pathname || '/';
  } catch (error) {
    return raw.startsWith('/') ? raw : `/${raw}`;
  }
};

const slugFromPage = (page = '') => {
  const path = pathFromPage(page);
  if (!path || path === '/') return 'home';
  return path.replace(/^\/+|\/+$/g, '') || 'home';
};

const tokenize = (value = '') => (
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
);

const hasAnyKeyword = (value = '', keywords = []) => {
  const lower = String(value || '').toLowerCase();
  return keywords.some(keyword => lower.includes(keyword));
};

const detectTheme = (query = '') => {
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
};

const isWedgeAligned = (query = '') => {
  const lower = String(query || '').toLowerCase();
  if (lower.includes('noeis')) return true;
  if (hasAnyKeyword(lower, WEDGE_KEYWORDS)) return true;
  return COMPARISON_BRANDS.some(brand => lower.includes(brand) && hasAnyKeyword(lower, ['alternative', 'vs', 'compare', 'second brain', 'pkm', 'reading workflow']));
};

const isLowQualityQuery = (query = '', row = {}) => {
  const lower = String(query || '').toLowerCase();
  if (LOW_QUALITY_TERMS.some(term => lower.includes(term))) {
    return 'The query is low-intent or off-strategy for signups and activated users.';
  }
  if (!isWedgeAligned(lower) && row.impressions < 20 && row.clicks === 0) {
    return 'The query has weak signal and does not map cleanly to Noeis’s category wedge.';
  }
  if (!isWedgeAligned(lower) && !lower.includes('noeis')) {
    return 'The query does not map to reliable recall, concept formation, serious reading workflows, or human-centered AI.';
  }
  return '';
};

const expectedCtrForPosition = (position = 0) => {
  if (position <= 3) return 9;
  if (position <= 6) return 4.5;
  if (position <= 10) return 3;
  if (position <= 20) return 1.5;
  return 0.75;
};

const matchesPageIntent = (query = '', page = '') => {
  const lowerQuery = String(query || '').toLowerCase();
  const pageSlug = slugFromPage(page);
  if (pageSlug === 'home') return lowerQuery.includes('noeis');
  const queryTokens = tokenize(lowerQuery);
  const pageTokens = tokenize(pageSlug.replace(/-/g, ' '));
  const overlap = queryTokens.filter(token => pageTokens.includes(token));
  if (overlap.length >= 2) return true;

  const queryTheme = detectTheme(lowerQuery);
  const pageTheme = detectTheme(pageSlug.replace(/-/g, ' '));
  return queryTheme === pageTheme;
};

const isUnderperforming = (row = {}) => {
  const expectedCtr = expectedCtrForPosition(row.position);
  if (row.impressions >= 40 && row.position >= 4 && row.position <= 20) return true;
  if (row.impressions >= 25 && row.ctr < expectedCtr * 0.75) return true;
  return false;
};

const titleAndSlugForQuery = (query = '') => {
  const theme = detectTheme(query);
  if (PLAYBOOK_BY_THEME[theme]) {
    return PLAYBOOK_BY_THEME[theme];
  }

  const cleanQuery = String(query || '').trim();
  const title = cleanQuery.toLowerCase().includes('noeis')
    ? titleCase(cleanQuery)
    : `${titleCase(cleanQuery)} for serious readers`;
  return {
    title,
    slug: slugify(cleanQuery)
  };
};

const activationCtaForQuery = (query = '') => CTA_BY_THEME[detectTheme(query)] || CTA_BY_THEME.general;

export const parseSearchConsolePaste = (input = '') => {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    return {
      rows: [],
      errors: ['Paste a Search Console or Bing export to analyze opportunities.']
    };
  }

  const delimiter = detectDelimiter(trimmed);
  const lines = trimmed.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) {
    return {
      rows: [],
      errors: ['The pasted export needs a header row and at least one data row.']
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

    current.clicks += clicks;
    current.impressions += impressions;
    current.ctr = current.impressions > 0
      ? (current.clicks / current.impressions) * 100
      : current.ctr + ctr;
    const weightedPositionTotal = (current.position * Math.max(current.impressions - impressions, 0)) + (position * Math.max(impressions, 1));
    current.position = current.impressions > 0
      ? weightedPositionTotal / Math.max(current.impressions, 1)
      : position;
    current.rowCount += 1;
    aggregate.set(key, current);
  });

  return {
    rows: Array.from(aggregate.values()).sort((left, right) => right.impressions - left.impressions),
    errors: []
  };
};

export const evaluateSearchConsoleRows = (rows = []) => {
  const buckets = {
    improve: [],
    create: [],
    ignore: []
  };

  rows.forEach(row => {
    const query = row.query || slugFromPage(row.page).replace(/-/g, ' ');
    const lowQualityReason = isLowQualityQuery(query, row);
    if (lowQualityReason) {
      buckets.ignore.push({
        query,
        reason: lowQualityReason,
        row,
        priority: row.impressions
      });
      return;
    }

    const currentPage = row.page || '';
    const alignedPage = matchesPageIntent(query, currentPage);

    if (currentPage && alignedPage) {
      const fixReason = isUnderperforming(row)
        ? 'The page already targets the intent, but it is leaving clicks on the table relative to its ranking.'
        : 'The page is relevant, but it needs clearer answer-first coverage and stronger conversion framing.';
      buckets.improve.push({
        query,
        currentPage,
        why: fixReason,
        proposedFix: `Tighten the intro around ${detectTheme(query) === 'brand' ? 'Noeis' : titleCase(query)}, add a direct definition, refresh headings for reliable recall/concept formation, and place the CTA "${activationCtaForQuery(query)}" above the fold.`,
        row,
        priority: row.impressions + row.clicks * 10
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
        ? `The query’s intent is distinct from ${slugFromPage(currentPage).replace(/-/g, ' ')}, so improving the current page would create a muddy near-match.`
        : 'No current landing page in the paste set appears to satisfy this intent directly.',
      recommendedTitle: recommended.title,
      recommendedSlug: recommended.slug,
      activationCta: activationCtaForQuery(query),
      row,
      priority: row.impressions + row.clicks * 12
    });
  });

  return {
    improve: buckets.improve.sort((left, right) => right.priority - left.priority),
    create: buckets.create.sort((left, right) => right.priority - left.priority),
    ignore: buckets.ignore.sort((left, right) => right.priority - left.priority)
  };
};

export const buildSearchConsoleOpportunityReport = ({
  input = '',
  dateRange = '',
  source = DEFAULT_SOURCE_LABEL
} = {}) => {
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
};

export const buildSearchOpportunityExecutionBrief = (report = {}) => {
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
      'Next action: wait for more Google Search Console data or paste a broader query/page export.'
    ].filter(Boolean).join('\n');
  }

  const action = topOpportunity.currentPage ? 'Improve existing page' : 'Create/refine page';
  const target = topOpportunity.currentPage
    ? topOpportunity.currentPage
    : `/${topOpportunity.recommendedSlug}`;
  const title = topOpportunity.recommendedTitle || titleCase(topOpportunity.query);
  const activationCta = topOpportunity.activationCta || activationCtaForQuery(topOpportunity.query);
  const row = topOpportunity.row || {};

  return [
    '# Noeis Search Opportunity Brief',
    '',
    `Source: ${report.source || DEFAULT_SOURCE_LABEL}`,
    report.dateRange ? `Date range: ${report.dateRange}` : '',
    `Rows analyzed: ${report.rowCount || 0}`,
    `Total impressions: ${Math.round(report.totals?.impressions || 0)}`,
    `Total clicks: ${Math.round(report.totals?.clicks || 0)}`,
    '',
    `Highest-value action: ${action}`,
    `Primary query: ${topOpportunity.query}`,
    `Target: ${target}`,
    `Recommended title: ${title}`,
    `Activation CTA: ${activationCta}`,
    `Search signal: ${Math.round(row.impressions || 0)} impressions, ${Math.round(row.clicks || 0)} clicks, ${metricLabel(row.ctr || 0, '%')} CTR, position ${metricLabel(row.position || 0)}`,
    '',
    'Why this matters:',
    topOpportunity.why || topOpportunity.proposedFix || 'The query maps to Noeis’s source-grounded research wiki wedge and can drive signup-quality traffic.',
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
};

const numberFormat = new Intl.NumberFormat('en-US');
const metricLabel = (value = 0, suffix = '') => `${numberFormat.format(Math.round(value * 10) / 10)}${suffix}`;

const RecommendationList = ({ items = [], renderItem = () => null, emptyMessage = '' }) => {
  if (items.length === 0) {
    return <p className="muted small">{emptyMessage}</p>;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {items.map(renderItem)}
    </div>
  );
};

const SearchConsoleOpportunities = () => {
  const [dateRange, setDateRange] = useState('');
  const [source, setSource] = useState(DEFAULT_SOURCE_LABEL);
  const [pasteInput, setPasteInput] = useState('');
  const [analysis, setAnalysis] = useState(() => buildSearchConsoleOpportunityReport());

  const recommendations = analysis.recommendations || { improve: [], create: [], ignore: [] };
  const qualitySummary = useMemo(() => {
    if (!analysis.parsedRows?.length) return null;
    const topOpportunity = [...recommendations.improve, ...recommendations.create]
      .sort((left, right) => right.priority - left.priority)[0];
    return topOpportunity || null;
  }, [analysis.parsedRows, recommendations.create, recommendations.improve]);

  const handleAnalyze = (event) => {
    event.preventDefault();
    setAnalysis(buildSearchConsoleOpportunityReport({
      input: pasteInput,
      dateRange,
      source
    }));
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Growth Ops</p>
        <h1>Search Opportunities</h1>
        <p className="muted">
          Paste Google Search Console query exports and get action buckets aligned to Noeis’s SEO/AEO playbook.
        </p>
      </div>

      <Card className="settings-card">
        <form onSubmit={handleAnalyze} style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="muted-label">Date range</span>
              <input
                aria-label="Date range"
                value={dateRange}
                onChange={(event) => setDateRange(event.target.value)}
                placeholder="e.g. Apr 1 to Apr 15, 2026"
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="muted-label">Source</span>
              <input
                aria-label="Source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder={DEFAULT_SOURCE_LABEL}
              />
            </label>
          </div>

          <label style={{ display: 'grid', gap: 6 }}>
            <span className="muted-label">Export paste</span>
            <textarea
              aria-label="Search performance export"
              rows={12}
              value={pasteInput}
              onChange={(event) => setPasteInput(event.target.value)}
              placeholder={SAMPLE_INPUT}
              style={{ resize: 'vertical' }}
            />
          </label>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button type="submit">Analyze export</Button>
            <Button type="button" variant="secondary" onClick={() => setPasteInput(SAMPLE_INPUT)}>
              Load sample
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPasteInput('');
                setAnalysis(buildSearchConsoleOpportunityReport());
              }}
            >
              Clear
            </Button>
          </div>
        </form>
      </Card>

      <Card className="settings-card">
        <h2>Decision rules</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <TagChip>Prioritize signups and activated users</TagChip>
          <TagChip>Improve existing pages before cloning</TagChip>
          <TagChip>Create a new page only for distinct intent</TagChip>
          <TagChip>Anchor every recommendation to Noeis’s wedge</TagChip>
        </div>
        <p className="muted small">
          This parser is local-only. It is optimized for Google Search Console query/page exports and still tolerates common Bing-style headers if older data is pasted.
        </p>
      </Card>

      {analysis.errors?.length > 0 && (
        <Card className="settings-card">
          <h2>Import status</h2>
          {analysis.errors.map(error => (
            <p key={error} className="status-message error-message">{error}</p>
          ))}
        </Card>
      )}

      {analysis.parsedRows?.length > 0 && (
        <>
          <Card className="settings-card">
            <h2>Import summary</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="settings-option-button is-active" style={{ minWidth: 140 }}>
                <span className="muted-label">Rows</span>
                <div>{numberFormat.format(analysis.rowCount)}</div>
              </div>
              <div className="settings-option-button is-active" style={{ minWidth: 140 }}>
                <span className="muted-label">Clicks</span>
                <div>{numberFormat.format(analysis.totals.clicks)}</div>
              </div>
              <div className="settings-option-button is-active" style={{ minWidth: 140 }}>
                <span className="muted-label">Impressions</span>
                <div>{numberFormat.format(analysis.totals.impressions)}</div>
              </div>
              <div className="settings-option-button is-active" style={{ minWidth: 220 }}>
                <span className="muted-label">Source</span>
                <div>{analysis.source || 'Search performance export'}</div>
              </div>
            </div>
            {analysis.dateRange && (
              <p className="muted small" style={{ marginTop: 12 }}>Date range: {analysis.dateRange}</p>
            )}
            {qualitySummary && (
              <p className="muted small" style={{ marginTop: 12 }}>
                Highest-priority move: <strong>{qualitySummary.query}</strong>
              </p>
            )}
          </Card>

          <Card className="settings-card">
            <h2>Execution brief</h2>
            <p className="muted small">
              Copy this into the weekly SEO operator or a founder review note. It picks one action from the current export and ties it to signup and activation quality.
            </p>
            <p className="muted small">
              After shipping the selected change, validate whether it produced signups and wiki activation in{' '}
              <Link to="/marketing-analytics">Marketing Analytics</Link>.
            </p>
            <textarea
              aria-label="Search opportunity execution brief"
              readOnly
              rows={16}
              value={buildSearchOpportunityExecutionBrief(analysis)}
              style={{ width: '100%', resize: 'vertical', marginTop: 12 }}
            />
          </Card>

          <Card className="settings-card">
            <h2>Existing page should be improved</h2>
            <RecommendationList
              items={recommendations.improve}
              emptyMessage="No obvious existing-page improvements in this paste."
              renderItem={(item) => (
                <div key={`${item.query}-${item.currentPage}`} className="settings-option-button" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
                  <strong>{item.query}</strong>
                  <span className="muted small">Current page: {item.currentPage || 'Unknown page'}</span>
                  <span className="muted small">Why this is underperforming: {item.why}</span>
                  <span className="muted small">Proposed fix: {item.proposedFix}</span>
                  <span className="muted small">
                    {metricLabel(item.row.impressions)} impressions · {metricLabel(item.row.clicks)} clicks · {metricLabel(item.row.ctr, '%')} CTR · position {metricLabel(item.row.position)}
                  </span>
                </div>
              )}
            />
          </Card>

          <Card className="settings-card">
            <h2>New page should be created</h2>
            <RecommendationList
              items={recommendations.create}
              emptyMessage="No clean new-page opportunities in this paste."
              renderItem={(item) => (
                <div key={`${item.query}-${item.recommendedSlug}`} className="settings-option-button" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
                  <strong>{item.query}</strong>
                  <span className="muted small">Why existing pages do not satisfy intent: {item.why}</span>
                  <span className="muted small">Recommended page title: {item.recommendedTitle}</span>
                  <span className="muted small">Recommended slug: /{item.recommendedSlug}</span>
                  <span className="muted small">Activation CTA: {item.activationCta}</span>
                  <span className="muted small">
                    {metricLabel(item.row.impressions)} impressions · {metricLabel(item.row.clicks)} clicks · {metricLabel(item.row.ctr, '%')} CTR · position {metricLabel(item.row.position)}
                  </span>
                </div>
              )}
            />
          </Card>

          <Card className="settings-card">
            <h2>Query is low quality or off-strategy</h2>
            <RecommendationList
              items={recommendations.ignore}
              emptyMessage="No low-quality queries detected."
              renderItem={(item) => (
                <div key={`${item.query}-${item.reason}`} className="settings-option-button" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
                  <strong>{item.query}</strong>
                  <span className="muted small">Reason to ignore: {item.reason}</span>
                  <span className="muted small">
                    {metricLabel(item.row.impressions)} impressions · {metricLabel(item.row.clicks)} clicks
                  </span>
                </div>
              )}
            />
          </Card>
        </>
      )}
    </Page>
  );
};

export default SearchConsoleOpportunities;
