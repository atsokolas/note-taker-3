import { isRepoDossierPage, pageMeta } from './wikiRepoDossierModel';

const normalizeText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const ROOT_CWD = 'repository root';

const pickMeta = (meta = {}, keys = []) => {
  for (const key of keys) {
    const value = meta[key];
    if (value == null) continue;
    if (typeof value === 'string') {
      const text = normalizeText(value);
      if (text) return text;
    }
  }
  return '';
};

const listMeta = (meta = {}, keys = [], limit = 8) => {
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

const boundedSectionText = (text = '', headings = [], stopHeadings = []) => {
  const structured = sectionText(text, headings);
  if (structured) return structured;

  const source = normalizeText(text);
  if (!source) return '';
  const headingPattern = headings
    .map(heading => heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const stopPattern = stopHeadings
    .map(heading => heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  if (!headingPattern) return '';
  const pattern = stopPattern
    ? new RegExp(`\\b(?:${headingPattern})\\b\\s*[:—-]?\\s*(.+?)(?=\\s+\\b(?:${stopPattern})\\b\\s*[:—-]?|$)`, 'i')
    : new RegExp(`\\b(?:${headingPattern})\\b\\s*[:—-]?\\s*(.+)$`, 'i');
  return normalizeText(source.match(pattern)?.[1] || '');
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

const normalizeCwd = (value = '') => {
  const cwd = normalizeText(value);
  if (!cwd || cwd === '.' || cwd === './') return ROOT_CWD;
  return cwd.replace(/\/$/, '');
};

const isLongPackageExpansion = (value = '') => {
  const expansion = normalizeText(value);
  if (!expansion) return false;
  return expansion.length > 72 || /\s&&\s/.test(expansion) || expansion.endsWith('...');
};

const splitCommandDetail = (text = '') => {
  const trimmed = normalizeText(text);
  const dashIndex = trimmed.indexOf(' - ');
  if (dashIndex === -1) {
    return { named: trimmed, expansion: '' };
  }
  return {
    named: trimmed.slice(0, dashIndex).trim(),
    expansion: trimmed.slice(dashIndex + 3).trim()
  };
};

const looksLikeRunnableCommand = (value = '') => (
  /^(?:(?:repository root|[\w./-]+\/?):\s*)?(?:CI\s*=\s*true\s+)?(?:npm|pnpm|yarn|node|npx|tsx|vite|react-scripts|next|python3?|pytest|go|cargo|make|docker|vercel|render)\b/i.test(value)
  || /^(?:(?:repository root|[\w./-]+\/?):\s*)?cd\s+[\w./-]+\s*&&\s*(?:CI\s*=\s*true\s+)?(?:npm|pnpm|yarn|node|npx|tsx|vite|react-scripts|next|python3?|pytest|go|cargo|make|docker|vercel|render)\b/i.test(value)
);

const parseNamedCommandLine = (line = '') => {
  const stripped = normalizeText(line)
    .replace(/^(?:Run|UI|Test|Build|Wiki proof|Proof|Frontend build|Backend|Install(?: UI)?)\s*:\s*/i, '');
  if (!stripped) return null;

  const withoutCitation = stripped
    .replace(/^(repository root|[\w./-]+)\s+((?:CI\s*=\s*true\s+)?(?:npm|pnpm|yarn|node|npx|tsx|vite|react-scripts|next|python3?|pytest|go|cargo|make|docker|vercel|render)\b)/i, '$1: $2')
    .replace(/\[\d+(?:,\d+)*\]\s*$/g, '')
    .trim();
  if (!looksLikeRunnableCommand(withoutCitation)) return null;
  const cwdPrefix = withoutCitation.match(/^(repository root|[\w./-]+\/?):\s*(.+)$/i);
  if (cwdPrefix) {
    const cwd = normalizeCwd(cwdPrefix[1]);
    const executes = cwdPrefix[2].match(/\s*\(executes\s+([^)]*)\)\s*$/i);
    const commandText = cwdPrefix[2].replace(/\s*\((?:executes|defined in)\s+[^)]*\)\s*$/i, '').trim();
    const nested = parseNamedCommandLine(commandText);
    return nested ? {
      ...nested,
      cwd: nested.cwd === ROOT_CWD ? cwd : nested.cwd,
      entrypoint: executes?.[1] ? normalizeText(executes[1]) : nested.entrypoint,
      sourceFile: cwd === ROOT_CWD ? 'package.json' : `${cwd}/package.json`
    } : null;
  }

  const { named, expansion } = splitCommandDetail(withoutCitation);
  const fromMatch = named.match(/^(.*?)\s+from\s+([\w./-]+\/package\.json)$/i);
  if (fromMatch) {
    const sourceFile = fromMatch[2];
    const cwd = sourceFile.includes('/')
      ? sourceFile.replace(/\/package\.json$/i, '')
      : ROOT_CWD;
    return {
      command: normalizeText(fromMatch[1]),
      cwd: normalizeCwd(cwd),
      entrypoint: isLongPackageExpansion(expansion) ? '' : expansion,
      sourceFile
    };
  }

  const cdMatch = named.match(/^cd\s+([^&]+)\s*&&\s*(.+)$/i);
  if (cdMatch) {
    return {
      command: normalizeText(cdMatch[2]),
      cwd: normalizeCwd(cdMatch[1]),
      entrypoint: isLongPackageExpansion(expansion) ? '' : expansion,
      sourceFile: ''
    };
  }

  return {
    command: named,
    cwd: ROOT_CWD,
    entrypoint: isLongPackageExpansion(expansion) ? '' : expansion,
    sourceFile: /npm run \w+/i.test(named) ? 'package.json' : ''
  };
};

const coerceQuickstartCommand = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    return parseNamedCommandLine(value);
  }
  if (typeof value === 'object') {
    const command = normalizeText(value.command);
    if (!command) return null;
    return {
      command,
      cwd: normalizeCwd(value.cwd || ROOT_CWD),
      entrypoint: normalizeText(value.entrypoint),
      sourceFile: normalizeText(value.sourceFile)
    };
  }
  return null;
};

const readStructuredQuickstart = (meta = {}) => {
  const quickstart = meta.quickstart;
  if (!quickstart || typeof quickstart !== 'object') return null;
  const install = Array.isArray(quickstart.install)
    ? quickstart.install.map(coerceQuickstartCommand).filter(Boolean)
    : quickstart.install
      ? [coerceQuickstartCommand(quickstart.install)].filter(Boolean)
      : [];
  const installUi = coerceQuickstartCommand(quickstart.installUi);
  if (installUi) install.push(installUi);

  return {
    install,
    apiRun: coerceQuickstartCommand(quickstart.apiRun),
    uiRun: coerceQuickstartCommand(quickstart.uiRun),
    test: coerceQuickstartCommand(quickstart.test || quickstart.proof),
    build: coerceQuickstartCommand(quickstart.build),
    envVars: listMeta(quickstart, ['envVars', 'environmentVariables'], 12),
    localUrls: Array.isArray(quickstart.localUrls) ? quickstart.localUrls : []
  };
};

const classifyCommandLine = (line = '') => {
  const normalized = normalizeText(line).toLowerCase();
  if (/^install ui|cd note-taker-ui && npm install/i.test(normalized)) return 'installUi';
  if (/^install|npm install/i.test(normalized) && !/note-taker-ui/.test(normalized)) return 'install';
  if (/^ui:|from note-taker-ui\/package\.json.*start|react-scripts start/i.test(normalized)) return 'uiRun';
  if (/wiki:qa|wiki proof|^test:|^proof:/i.test(normalized)) return 'test';
  if (/^build:|from note-taker-ui\/package\.json.*build|react-scripts build/i.test(normalized)) return 'build';
  if (/^run:|npm run (?:start|dev)|node server\/server\.js/i.test(normalized)) return 'apiRun';
  return '';
};

const extractCommandsFromSection = (sectionTextValue = '') => {
  const result = {
    install: [],
    apiRun: null,
    uiRun: null,
    test: null,
    build: null
  };
  if (!sectionTextValue) return result;

  const flattenedSource = normalizeText(sectionTextValue);
  const flattenedContract = !String(sectionTextValue).includes('\n')
    && /\bRun\s*:/i.test(flattenedSource)
    && /\b(?:UI|Test|Build|Key paths)\b/i.test(flattenedSource);

  if (!flattenedContract) {
    const lines = sectionTextValue.split('\n').map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
      const cleaned = line.replace(/^[-*•]\s*/, '');
      if (/install api dependencies.*npm install/i.test(cleaned)) {
        result.install.push({ command: 'npm install', cwd: ROOT_CWD, entrypoint: '', sourceFile: '' });
        continue;
      }
      if (/install ui dependencies.*note-taker-ui/i.test(cleaned)) {
        result.install.push({
          command: 'npm install',
          cwd: 'note-taker-ui',
          entrypoint: '',
          sourceFile: 'note-taker-ui/package.json'
        });
        continue;
      }
      const kind = classifyCommandLine(cleaned);
      const parsed = parseNamedCommandLine(cleaned);
      if (!parsed?.command) continue;

      switch (kind) {
        case 'install':
        case 'installUi':
          result.install.push(parsed);
          break;
        case 'apiRun':
          result.apiRun = {
            ...parsed,
            entrypoint: parsed.entrypoint || (parsed.command.includes('start') ? 'node server/server.js' : parsed.entrypoint),
            sourceFile: parsed.sourceFile || 'package.json'
          };
          break;
        case 'uiRun':
          result.uiRun = {
            ...parsed,
            cwd: parsed.cwd === ROOT_CWD ? 'note-taker-ui' : parsed.cwd,
            sourceFile: parsed.sourceFile || 'note-taker-ui/package.json'
          };
          break;
        case 'test':
          result.test = {
            command: /^npm run /i.test(parsed.command) ? parsed.command : 'npm run wiki:qa',
            cwd: ROOT_CWD,
            entrypoint: '',
            sourceFile: 'package.json'
          };
          break;
        case 'build':
          result.build = {
            command: /CI=/i.test(parsed.command) ? parsed.command : `CI=true ${parsed.command}`,
            cwd: parsed.cwd === ROOT_CWD ? 'note-taker-ui' : parsed.cwd,
            entrypoint: '',
            sourceFile: parsed.sourceFile || 'note-taker-ui/package.json'
          };
          break;
        default:
          break;
      }
    }
  }

  // Wiki plainText is intentionally whitespace-normalized. Recover the
  // generated handoff contract by using its stable labels as delimiters.
  const flattened = normalizeText(sectionTextValue)
    .replace(/\b(Test|Build|Key paths)\s+(?=(?:repository root|note-taker-ui|CI\s*=\s*true|npm|pnpm|yarn|node|npx|server\/|note-taker-ui\/|package\.json)\b)/gi, '$1: ');
  const labeledCommand = (label, nextLabels) => firstMatch(flattened, [
    new RegExp(`\\b${label}:\\s*(.+?)(?=\\s+(?:${nextLabels.join('|')}):)`, 'i')
  ]);
  if (!result.install.length && /Install API dependencies[^.]*\bnpm install\b/i.test(flattened)) {
    result.install.push({ command: 'npm install', cwd: ROOT_CWD, entrypoint: '', sourceFile: '' });
  }
  if (!result.install.some(item => item.cwd === 'note-taker-ui') && /Install UI dependencies[^.]*\bnote-taker-ui\b/i.test(flattened)) {
    result.install.push({ command: 'npm install', cwd: 'note-taker-ui', entrypoint: '', sourceFile: 'note-taker-ui/package.json' });
  }
  if (!result.apiRun) {
    result.apiRun = parseNamedCommandLine(labeledCommand('Run', ['UI', 'Test', 'Build', 'Key paths']));
  }
  if (!result.uiRun) {
    result.uiRun = parseNamedCommandLine(labeledCommand('UI', ['Test', 'Build', 'Key paths']));
  }
  if (!result.test) {
    const parsed = parseNamedCommandLine(labeledCommand('Test', ['Build', 'Key paths']));
    if (parsed) result.test = { ...parsed, sourceFile: 'package.json' };
  }
  if (!result.build) {
    const parsed = parseNamedCommandLine(labeledCommand('Build', ['Key paths', 'System map']));
    if (parsed) result.build = {
      ...parsed,
      command: /CI=/i.test(parsed.command) ? parsed.command : `CI=true ${parsed.command}`,
      sourceFile: parsed.sourceFile || 'note-taker-ui/package.json'
    };
  }
  return result;
};

const extractEnvVars = ({ meta = {}, corpus = '' } = {}) => {
  const fromMeta = listMeta(meta, ['envVars', 'environmentVariables', 'requiredEnvVars'], 12);
  if (fromMeta.length) return fromMeta;

  const envSection = firstMatch(corpus, [
    /Environment:\s*copy \.env\.example[^,]*,\s*then configure ([^;]+)/i,
    /configure ([A-Z][A-Z0-9_]+(?:,\s*(?:and\s+)?[A-Z][A-Z0-9_]+){0,8})/i
  ]);
  if (envSection) {
    return unique(
      envSection
        .replace(/\btext generation uses\b.*$/i, '')
        .split(/,\s+| and /i)
        .map(item => normalizeText(item))
        .filter(item => /^[A-Z][A-Z0-9_]+$/.test(item))
    );
  }

  const envExample = firstMatch(corpus, [
    /Path: \.env\.example[\s\S]{0,1200}?(JWT_SECRET[\s\S]{0,800})/i
  ]);
  if (envExample) {
    return unique([...envExample.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map(match => match[1])).slice(0, 8);
  }

  return [];
};

const extractLocalUrls = ({ meta = {}, corpus = '' } = {}) => {
  const fromMeta = meta.quickstart?.localUrls;
  if (Array.isArray(fromMeta) && fromMeta.length) return fromMeta;

  const urls = [];
  const apiUrl = firstMatch(corpus, [
    /API(?:\s+URL)?\s*[:—-]\s*(https?:\/\/[^\s,;)]+)/i,
    /(https?:\/\/(?:localhost|127\.0\.0\.1):(?:5001|5500)[^\s,;)]*)/i,
    /API\s+(localhost:\d+)/i
  ]);
  const uiUrl = firstMatch(corpus, [
    /UI(?:\s+URL)?\s*[:—-]\s*(https?:\/\/[^\s,;)]+)/i,
    /(https?:\/\/(?:localhost|127\.0\.0\.1):3000[^\s,;)]*)/i,
    /UI\s+(localhost:\d+)/i
  ]);
  if (apiUrl) urls.push({ label: 'API', url: apiUrl });
  if (uiUrl) urls.push({ label: 'UI', url: uiUrl });
  return urls;
};

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
  const deploySection = sectionText(corpus, ['Deploy and operations', 'Deployment', 'Deploy', 'Production']);
  const deployText = firstMatch(deploySection || corpus, [
    /(?:^|\n|\.\s)(?:Deploy(?:ment)?|Ship(?:ping)?|Production)\s*[:—-]\s*([^\n]{4,220})/i
  ]);
  return splitDeployTargets(deployText);
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
      .filter(path => path && (/^(?:[a-z0-9._-]+\/)+$/i.test(path) || /^[\w./-]+\.[jt]sx?$/i.test(path)))
    : [];
  const inlineList = firstMatch(corpus, [
    /Key paths:\s*([^\n]+)/i,
    /Key repo paths:\s*([^\n]+)/i
  ]).split(/[,;|]/).map(item => normalizeText(item)).filter(path => (
    path && (/^(?:[a-z0-9._-]+\/)+$/i.test(path) || /^[\w./-]+\.[a-z0-9]+$/i.test(path))
  ));
  const inlinePaths = [...corpus.matchAll(/`([a-z0-9][a-z0-9._/-]{1,80}(?:\/|\.[jt]sx?))`/gi)]
    .map(match => normalizeText(match[1]))
    .filter(path => /^(note-taker-ui|server|scripts|docs|packages|src|app|lib)\//i.test(path));
  return unique([...fromMeta, ...fromSection, ...inlineList, ...inlinePaths, ...fromRefs]).slice(0, 6);
};

const mergeInstallCommands = (commands = [], { allowDefaults = false } = {}) => {
  const normalized = [];
  const seen = new Set();
  for (const command of commands) {
    if (!command?.command) continue;
    const key = `${command.cwd}::${command.command}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(command);
  }
  if (!allowDefaults) return normalized;
  if (!normalized.some(item => /npm install/i.test(item.command) && item.cwd === ROOT_CWD)) {
    normalized.unshift({ command: 'npm install', cwd: ROOT_CWD, entrypoint: '', sourceFile: '' });
  }
  if (!normalized.some(item => /note-taker-ui/.test(item.cwd))) {
    normalized.push({ command: 'npm install', cwd: 'note-taker-ui', entrypoint: '', sourceFile: 'note-taker-ui/package.json' });
  }
  return normalized.slice(0, 2);
};

const applyLegacyMetadata = ({ meta = {}, quickstart = {} } = {}) => {
  const next = { ...quickstart };
  if (!next.apiRun) {
    const run = pickMeta(meta, ['apiRunCommand', 'runCommand', 'run', 'startCommand', 'devCommand']);
    if (run) {
      next.apiRun = {
        command: run,
        cwd: ROOT_CWD,
        entrypoint: run.includes('server/server.js') ? 'node server/server.js' : 'node server/server.js',
        sourceFile: 'package.json'
      };
    }
  }
  if (!next.test) {
    const test = pickMeta(meta, ['testCommand', 'proofCommand', 'test']);
    if (test && !isLongPackageExpansion(test)) {
      next.test = {
        command: /^npm run /i.test(test) ? test : test,
        cwd: ROOT_CWD,
        entrypoint: '',
        sourceFile: 'package.json'
      };
    } else if (/wiki:qa/i.test(test)) {
      next.test = { command: 'npm run wiki:qa', cwd: ROOT_CWD, entrypoint: '', sourceFile: 'package.json' };
    }
  }
  return next;
};

export const extractRepoDeveloperQuickstart = (page = {}) => {
  if (!isRepoDossierPage(page)) return null;
  const meta = pageMeta(page);
  const corpus = collectCorpus(page);
  // Commands must come from the maintained article, not cited source snippets.
  // A referenced README can contain its own quickstart and is evidence rather
  // than this page's runnable contract.
  const authoredText = [page.plainText, page.summary, page.description].filter(Boolean).join('\n\n');
  const quickstartSection = boundedSectionText(authoredText, [
    'Developer quickstart',
    'Five-minute setup',
    'Run, test, build',
    'Run and prove changes',
    'Developer setup',
    'Getting started',
    'Local development',
    'Running locally'
  ], [
    'System map',
    'Architecture and ownership',
    'Critical flows',
    'Common change paths',
    'Quality bar and invariants',
    'Failure modes',
    'Deploy and unknowns',
    'References'
  ]);

  const structured = readStructuredQuickstart(meta);
  const commandContractText = quickstartSection || (/^\s*(?:Run|UI|Test|Build|Install(?: UI)?)\s*:/i.test(authoredText) ? authoredText : '');
  const parsed = extractCommandsFromSection(commandContractText);
  const hasParsedSignals = Boolean(
    parsed.install.length ||
    parsed.apiRun ||
    parsed.uiRun ||
    parsed.test ||
    parsed.build
  );
  const merged = applyLegacyMetadata({
    meta,
    quickstart: {
      install: mergeInstallCommands([
        ...(structured?.install || []),
        ...parsed.install
      ], { allowDefaults: Boolean(structured || hasParsedSignals) }),
      apiRun: structured?.apiRun || parsed.apiRun,
      uiRun: structured?.uiRun || parsed.uiRun,
      test: structured?.test || parsed.test,
      build: structured?.build || parsed.build,
      envVars: structured?.envVars?.length ? structured.envVars : extractEnvVars({ meta, corpus: authoredText || corpus }),
      localUrls: structured?.localUrls?.length ? structured.localUrls : extractLocalUrls({ meta, corpus: authoredText || corpus })
    }
  });

  const deploy = extractDeploy({ meta, corpus });
  const keyPaths = extractKeyPaths({ page, meta, corpus: authoredText || corpus });
  const hasDeploy = Boolean(deploy?.summary || deploy?.frontend || deploy?.api);
  const hasCommands = Boolean(
    merged.install.length ||
    merged.apiRun ||
    merged.uiRun ||
    merged.test ||
    merged.build
  );

  if (!hasCommands && !hasDeploy && !keyPaths.length && !merged.envVars.length) return null;

  return {
    install: merged.install,
    apiRun: merged.apiRun,
    uiRun: merged.uiRun,
    test: merged.test,
    build: merged.build,
    envVars: merged.envVars,
    localUrls: merged.localUrls,
    deploy: hasDeploy ? deploy : null,
    keyPaths
  };
};

export const hasRepoDeveloperQuickstart = (page = {}) => Boolean(extractRepoDeveloperQuickstart(page));
