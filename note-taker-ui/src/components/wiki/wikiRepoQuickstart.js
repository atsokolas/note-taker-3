import { isRepoDossierPage, pageMeta } from './wikiRepoDossierModel';

const normalizeText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const pickMeta = (meta = {}, keys = []) => {
  for (const key of keys) {
    const value = normalizeText(meta[key]);
    if (value) return value;
  }
  return '';
};

const listMeta = (meta = {}, keys = [], limit = 6) => {
  for (const key of keys) {
    const value = meta[key];
    if (Array.isArray(value)) {
      return value.map(item => normalizeText(item)).filter(Boolean).slice(0, limit);
    }
    const text = normalizeText(value);
    if (!text) continue;
    return text.split(/[,;|]/).map(item => normalizeText(item)).filter(Boolean).slice(0, limit);
  }
  return [];
};

const unique = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeText(item).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const firstMatch = (text = '', patterns = []) => {
  const haystack = String(text || '');
  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (match?.[1]) return normalizeText(match[1]);
    if (match?.[0]) return normalizeText(match[0]);
  }
  return '';
};

const sectionText = (text = '', headings = []) => {
  const normalizedHeadings = headings.map(value => normalizeText(value).toLowerCase());
  if (!normalizedHeadings.length) return '';
  const lines = String(text || '').split('\n').map(line => line.trim());
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const heading = line.replace(/[:#]+$/g, '').trim().toLowerCase();
    if (!normalizedHeadings.some(label => heading === label || heading.startsWith(`${label} `))) continue;
    const bodyLines = [];
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex];
      if (!nextLine) continue;
      const nextHeading = nextLine.replace(/[:#]+$/g, '').trim().toLowerCase();
      if (normalizedHeadings.some(label => nextHeading === label || nextHeading.startsWith(`${label} `))) break;
      bodyLines.push(nextLine);
    }
    if (bodyLines.length) return bodyLines.join('\n').trim();
  }
  const chunks = String(text || '').split(/\n{2,}/);
  for (const chunk of chunks) {
    const chunkLines = chunk.split('\n').map(line => line.trim()).filter(Boolean);
    if (!chunkLines.length) continue;
    const heading = chunkLines[0].replace(/[:#]+$/g, '').trim().toLowerCase();
    if (normalizedHeadings.some(label => heading === label || heading.startsWith(`${label} `))) {
      return chunkLines.slice(1).join('\n').trim();
    }
  }
  return '';
};

const collectCorpus = (page = {}) => {
  const refs = Array.isArray(page.sourceRefs) ? page.sourceRefs : [];
  return [
    page.plainText,
    page.summary,
    page.description,
    ...refs.flatMap(ref => [
      ref.title,
      ref.snippet,
      ref.quote,
      ref.text,
      ref.excerpt,
      ref.url
    ])
  ].filter(Boolean).join('\n\n');
};

const extractCommandFromText = (text = '', { labelPatterns = [], inlinePatterns = [] } = {}) => {
  const labeled = firstMatch(text, labelPatterns);
  if (labeled) return labeled;
  return firstMatch(text, inlinePatterns);
};

const RUN_LABEL_PATTERNS = [
  /(?:^|\n|\.\s)(?:Run(?: locally)?|Start(?: locally)?|Dev(?:elopment)?|Getting started)\s*[:—-]\s*((?:npm|pnpm|yarn|node|cd)[^\n.]{2,120})/i
];

const RUN_INLINE_PATTERNS = [
  /`(npm(?: run)? (?:start|dev)[^`]+)`/i,
  /`(cd [^`]+ && npm(?: run)? (?:start|dev)[^`]+)`/i,
  /(?:^|[\s>])(npm run (?:start|dev)|npm start|pnpm (?:dev|start)|yarn (?:dev|start)|cd [^\n]+ && npm(?: run)? start)/im
];

const TEST_LABEL_PATTERNS = [
  /(?:^|\n|\.\s)(?:Test(?:ing)?|Tests?)\s*[:—-]\s*((?:CI=\d+\s+)?(?:npm|pnpm|yarn)[^\n.]{2,120})/i
];

const TEST_INLINE_PATTERNS = [
  /`(CI=\d+\s+)?npm(?: run)? test[^`]+`/i,
  /(?:^|[\s>])(CI=\d+\s+npm(?: run)? test[^\n.]{0,80}|npm run test[^\n.]{0,80}|npm test[^\n.]{0,40})/im
];

const DEPLOY_LABEL_PATTERNS = [
  /(?:^|\n|\.\s)(?:Deploy(?:ment)?|Ship(?:ping)?|Production)\s*[:—-]\s*([^\n]{4,220})/i
];

const DEPLOY_INLINE_PATTERNS = [
  /frontend[\s\S]{0,80}(?:vercel|noeis\.io)[\s\S]{0,80}/i,
  /(?:api|backend)[\s\S]{0,80}(?:render|onrender\.com)[\s\S]{0,80}/i,
  /`(npm run build[^`]+)`/i
];

const splitDeployTargets = (text = '') => {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  const frontend = firstMatch(normalized, [
    /frontend\s*[:—-]\s*([^·|]+)/i,
    /frontend[\s\S]*?(https?:\/\/[^\s,;)]+)/i,
    /frontend[\s\S]*?(vercel|noeis\.io)/i
  ]);
  const api = firstMatch(normalized, [
    /(?:api|backend)\s*[:—-]\s*([^·|]+)/i,
    /(?:api|backend)[\s\S]*?(https?:\/\/[^\s,;)]+)/i,
    /(?:api|backend)[\s\S]*?(render|onrender\.com)/i
  ]);
  if (frontend || api) {
    return {
      summary: normalized,
      frontend: normalizeText(frontend),
      api: normalizeText(api)
    };
  }
  return { summary: normalized, frontend: '', api: '' };
};

const extractKeyPaths = ({ page = {}, meta = {}, corpus = '' } = {}) => {
  const fromMeta = listMeta(meta, ['keyPaths', 'keyRepoPaths', 'repoPaths', 'paths', 'directories']);
  const fromRefs = (Array.isArray(page.sourceRefs) ? page.sourceRefs : [])
    .map(ref => normalizeText(ref.metadata?.path || ref.path))
    .filter(path => path && !/^readme/i.test(path));
  const section = sectionText(corpus, [
    'Key paths',
    'Key repo paths',
    'Repository layout',
    'Project structure',
    'Repository structure'
  ]);
  const fromSection = section
    ? section.split('\n')
      .flatMap(line => line.replace(/^[-*•]\s*/, '').split(/[,;|]/))
      .map(item => normalizeText(item))
      .filter(path => path && /^(?:[a-z0-9._-]+\/)+$/i.test(path))
    : [];
  const inlinePaths = [...corpus.matchAll(/`([a-z0-9][a-z0-9._/-]{1,80}\/)`/gi)]
    .map(match => normalizeText(match[1]))
    .filter(path => /^(note-taker-ui|server|scripts|docs|packages|src|app|lib)\//i.test(path));
  return unique([...fromMeta, ...fromRefs, ...fromSection, ...inlinePaths]).slice(0, 6);
};

const extractRunCommand = ({ meta = {}, corpus = '' } = {}) => {
  const fromMeta = pickMeta(meta, ['runCommand', 'run', 'startCommand', 'devCommand']);
  if (fromMeta) return fromMeta;
  const quickstartSection = sectionText(corpus, [
    'Developer quickstart',
    'Developer setup',
    'Getting started',
    'Local development',
    'Running locally'
  ]);
  return extractCommandFromText(quickstartSection || corpus, {
    labelPatterns: RUN_LABEL_PATTERNS,
    inlinePatterns: RUN_INLINE_PATTERNS
  });
};

const extractTestCommand = ({ meta = {}, corpus = '' } = {}) => {
  const fromMeta = pickMeta(meta, ['testCommand', 'test']);
  if (fromMeta) return fromMeta;
  const quickstartSection = sectionText(corpus, [
    'Developer quickstart',
    'Developer setup',
    'Testing',
    'Verification'
  ]);
  return extractCommandFromText(quickstartSection || corpus, {
    labelPatterns: TEST_LABEL_PATTERNS,
    inlinePatterns: TEST_INLINE_PATTERNS
  });
};

const extractDeploy = ({ meta = {}, corpus = '' } = {}) => {
  const frontend = pickMeta(meta, ['deployFrontend', 'frontendDeploy', 'frontendHost']);
  const api = pickMeta(meta, ['deployApi', 'deployBackend', 'apiDeploy', 'backendDeploy']);
  const summary = pickMeta(meta, ['deploy', 'deployment', 'deploySummary']);
  if (frontend || api || summary) {
    return {
      summary: summary || [frontend && `Frontend: ${frontend}`, api && `API: ${api}`].filter(Boolean).join(' · '),
      frontend,
      api
    };
  }
  const quickstartSection = sectionText(corpus, [
    'Developer quickstart',
    'Deployment',
    'Deploy',
    'Production'
  ]);
  const deployText = extractCommandFromText(quickstartSection || corpus, {
    labelPatterns: DEPLOY_LABEL_PATTERNS,
    inlinePatterns: DEPLOY_INLINE_PATTERNS
  });
  return splitDeployTargets(deployText);
};

export const extractRepoDeveloperQuickstart = (page = {}) => {
  if (!isRepoDossierPage(page)) return null;
  const meta = pageMeta(page);
  const corpus = collectCorpus(page);
  const run = extractRunCommand({ meta, corpus });
  const test = extractTestCommand({ meta, corpus });
  const deploy = extractDeploy({ meta, corpus });
  const keyPaths = extractKeyPaths({ page, meta, corpus });
  const hasDeploy = Boolean(deploy?.summary || deploy?.frontend || deploy?.api);
  if (!run && !test && !hasDeploy && !keyPaths.length) return null;
  return {
    run,
    test,
    deploy: hasDeploy ? deploy : null,
    keyPaths
  };
};

export const hasRepoDeveloperQuickstart = (page = {}) => Boolean(extractRepoDeveloperQuickstart(page));
