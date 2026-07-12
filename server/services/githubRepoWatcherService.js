const { createWikiSourceEvent } = require('./wikiSourceEventService');
const { REPO_WIKI_GENERATOR_VERSION } = require('./repoWikiGeneratorVersion');

const GITHUB_API_BASE_URL = 'https://api.github.com';
const DEFAULT_GITHUB_REPO_WATCH_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_DOC_PATH_LIMIT = 48;
const DEFAULT_REPO_COMMIT_LIMIT = 8;
const DEFAULT_BLOB_TEXT_LIMIT = 7000;

const trim = (value = '', limit = 1000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}...` : text;
};

const normalizeOwnerOrRepo = (value = '') => String(value || '')
  .trim()
  .replace(/^@/, '')
  .replace(/[^A-Za-z0-9_.-]/g, '')
  .slice(0, 120);

const githubToken = () => trim(process.env.GITHUB_TOKEN || process.env.GITHUB_PUBLIC_REPO_TOKEN || '', 400);

const parseGitHubRepo = (value = '') => {
  const raw = String(value || '').trim();
  let match = raw.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (!match) match = raw.match(/^github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?$/i);
  if (!match) match = raw.match(/^([^/\s]+)\/([^/\s#?]+)$/);
  const owner = normalizeOwnerOrRepo(match?.[1]);
  const repo = normalizeOwnerOrRepo(match?.[2]);
  if (!owner || !repo) {
    const error = new Error('GitHub repo must be owner/repo or a github.com URL.');
    error.statusCode = 400;
    throw error;
  }
  return { owner, repo };
};

const githubHeaders = (token = githubToken()) => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2026-03-10',
  'User-Agent': 'Noeis public repo maintenance contact@noeis.io',
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

const fetchJson = async ({ url, fetchImpl = global.fetch, token = githubToken(), signal } = {}) => {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is not available for GitHub requests.');
  const response = await fetchImpl(url, { headers: githubHeaders(token), signal });
  if (!response?.ok) {
    const error = new Error(`GitHub request failed with HTTP ${response?.status || 'unknown'}.`);
    error.statusCode = response?.status || 500;
    throw error;
  }
  return response.json();
};

const repoApiUrl = ({ owner, repo, path = '' } = {}) => `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`;

const docPathRank = (path = '') => {
  const lower = String(path || '').toLowerCase();
  if (/^readme(\.|$)/.test(lower)) return 0;
  if (/^architecture(\.|$)|(^|\/)architecture(\.|\/|$)/.test(lower)) return 1;
  if (/^contributing(\.|$)/.test(lower)) return 2;
  if (/^changelog(\.|$)|^changes(\.|$)/.test(lower)) return 3;
  if (/^(docs|documentation)\//.test(lower)) return 4;
  if (/(^|\/)(adr|adrs|decisions)\//.test(lower)) return 5;
  return 10;
};

const repoEvidencePathRank = (path = '') => {
  const lower = String(path || '').toLowerCase();
  if (lower === 'package.json') return 0;
  if (/(^|\/)package\.json$/.test(lower)) return lower === 'package.json' ? 0 : 1;
  if (/^readme(\.|$)/.test(lower)) return 2;
  if (/(^|\/)readme(\.|$)/.test(lower)) return 3;
  if (/^(\.env\.example|render\.ya?ml|vercel\.json|dockerfile|docker-compose\.ya?ml)$/.test(lower)) return 4;
  if (lower === 'contributing.md') return 3;
  if (/^\.github\/workflows\/[^/]+\.(ya?ml)$/.test(lower)) return 4;
  if (/^(architecture|adr|adrs|decisions)(\.|\/|$)/.test(lower)) return 5;
  if (/^(docs|documentation)\/.*(architecture|developer|dev|deploy|runbook|getting-started|setup|adr|decision|design|system|product)[^/]*\.(md|mdx|rst|txt)$/i.test(lower)) return 6;
  if (/^(docs|documentation)\//.test(lower) && /\.(md|mdx|rst|txt)$/i.test(lower)) return 7;
  if (/^(server|api)\/(server|app|index)\.[jt]sx?$/.test(lower)) return 5;
  if (/^server\/models\/index\.[jt]s$/.test(lower)) return 6;
  if (/^server\/routes\/(?:index|api|app|server|wiki|auth|agentchat)[^/]*\.[jt]s$/.test(lower)) return 7;
  if (/^server\/services\/(?:wiki|github|repo|agent|auth|search|retrieval)[^/]*\.[jt]s$/.test(lower)) return 8;
  if (/^(note-taker-ui|client|web|app|frontend)\/src\/api\/wiki\.[jt]sx?$/.test(lower)) return 8;
  if (/^(note-taker-ui|client|web|app|frontend)\/src\/components\/wiki\/(?:wikirepocreatecomposer|wikipagereadview|wikifrontpage|wikibuildpagecomposer)\.[jt]sx?$/.test(lower)) return 8;
  if (/^(note-taker-ui|client|web|app|frontend)\/src\/system\/systemstatuscontext\.[jt]sx?$/.test(lower)) return 8;
  if (/^(note-taker-ui|client|web|app|frontend)\/src\/pages\/(?:dataintegrations|sharedwikipage)\.[jt]sx?$/.test(lower)) return 9;
  if (/^server\/(routes|services|models)\//.test(lower) && /\.(js|ts)$/.test(lower)) return 9;
  if (/^server\/(config|ai)\//.test(lower) && /\.(js|ts)$/.test(lower)) return 9;
  if (/^src\/(index|main|app|server)\.[jt]sx?$/.test(lower)) return 10;
  if (/^(packages|libs|modules)\/[^/]+\/src\/(index|main|agent|runner|run|tool|tools|handoff|model|models|realtime|extension|extensions)\.[jt]sx?$/.test(lower)) return 9;
  if (/^(packages|libs|modules)\/[^/]+\/src\/.*\.(js|jsx|ts|tsx)$/.test(lower)) return 12;
  if (/^(note-taker-ui|client|web|app|frontend)\/src\/(app|index|main|routes|api|utils|layout|pages)\b/.test(lower) && /\.(js|jsx|ts|tsx)$/.test(lower)) return 10;
  if (/^(note-taker-ui|client|web|app|frontend)\/src\/(components|pages)\/(?:wiki|library|think|app|home)/.test(lower) && /\.(js|jsx|ts|tsx)$/.test(lower)) return 11;
  if (/^architecture(\.|$)|(^|\/)architecture(\.|\/|$)/.test(lower)) return 8;
  if (/^changelog(\.|$)|^changes(\.|$)/.test(lower)) return 21;
  if (isRepoPolicyPath(lower)) return 30;
  return 100;
};

const repoEvidencePathTieBreak = (path = '') => {
  const lower = String(path || '').toLowerCase();
  if (/^server\/routes\/wikiroutes\.[jt]s$/.test(lower)) return 0;
  if (/^server\/routes\/agentchat/i.test(lower)) return 1;
  if (/^server\/routes\/authroutes\.[jt]s$/.test(lower)) return 2;
  if (/^server\/routes\//.test(lower)) return 20;
  if (/^server\/services\/wikimaintenanceservice\.[jt]s$/.test(lower)) return 0;
  if (/^server\/services\/githubrepowatcherservice\.[jt]s$/.test(lower)) return 1;
  if (/^server\/services\/wikiaskservice\.[jt]s$/.test(lower)) return 2;
  if (/^server\/services\/wikimaintenance/i.test(lower)) return 3;
  if (/^server\/services\/githubrepo/i.test(lower)) return 4;
  if (/^server\/services\//.test(lower)) return 20;
  if (/^(note-taker-ui|client|web|app|frontend)\/src\/app\.[jt]sx?$/.test(lower)) return 0;
  if (/^(note-taker-ui|client|web|app|frontend)\/src\/api\//.test(lower)) return 1;
  if (/^(note-taker-ui|client|web|app|frontend)\/src\/components\/wiki\//.test(lower)) return 2;
  return 10;
};

const repoPolicyPathRank = (path = '') => {
  const lower = String(path || '').toLowerCase();
  if (lower === 'agents.md') return 0;
  if (lower === 'claude.md') return 1;
  if (lower === '.cursorrules') return 2;
  if (lower === '.github/copilot-instructions.md') return 3;
  return 10;
};

const isUsefulDocPath = (path = '') => {
  const lower = String(path || '').toLowerCase();
  if (!/\.(md|mdx|rst|txt)$/i.test(lower) && !/^(readme|contributing|changelog|changes|architecture)(\.|$)/i.test(lower)) return false;
  if (/(^|\/)(node_modules|dist|build|vendor|coverage|test-results|playwright-report)\//.test(lower)) return false;
  return docPathRank(lower) < 10;
};

const isUsefulRepoEvidencePath = (path = '') => {
  const lower = String(path || '').toLowerCase();
  if (/(^|\/)(node_modules|dist|build|vendor|coverage|test-results|playwright-report|\.next|\.vercel|tmp|temp)\//.test(lower)) return false;
  if (/(^|\/)(__tests__|test|tests|fixtures|mocks)\//.test(lower)) return false;
  if (/\.(test|spec)\.[jt]sx?$/.test(lower)) return false;
  if (isRepoPolicyPath(lower)) return true;
  if (!/\.(md|mdx|rst|txt|json|ya?ml|js|jsx|ts|tsx)$/i.test(lower)
    && !/^(readme|contributing|changelog|changes|architecture|agents|claude)(\.|$)/i.test(lower)
    && !/^(\.env\.example|dockerfile)$/i.test(lower)) return false;
  return repoEvidencePathRank(lower) < 100;
};

const selectRepoDocEntries = (tree = [], limit = DEFAULT_DOC_PATH_LIMIT) => (
  (Array.isArray(tree) ? tree : [])
    .filter(entry => entry?.type === 'blob' && isUsefulDocPath(entry.path))
    .sort((a, b) => docPathRank(a.path) - docPathRank(b.path) || String(a.path).localeCompare(String(b.path)))
    .slice(0, Math.max(1, Math.min(Number(limit) || DEFAULT_DOC_PATH_LIMIT, 30)))
);

const selectRepoEvidenceEntries = (tree = [], limit = DEFAULT_DOC_PATH_LIMIT) => {
  const max = Math.max(1, Math.min(Number(limit) || DEFAULT_DOC_PATH_LIMIT, 60));
  const ranked = (Array.isArray(tree) ? tree : [])
    .filter(entry => entry?.type === 'blob' && isUsefulRepoEvidencePath(entry.path))
    .sort((a, b) => (
      repoEvidencePathRank(a.path) - repoEvidencePathRank(b.path)
      || repoEvidencePathTieBreak(a.path) - repoEvidencePathTieBreak(b.path)
      || String(a.path).localeCompare(String(b.path))
    ));
  const policyEntries = ranked
    .filter(entry => isRepoPolicyPath(entry.path))
    .sort((a, b) => repoPolicyPathRank(a.path) - repoPolicyPathRank(b.path) || String(a.path).localeCompare(String(b.path)))
    .slice(0, Math.min(4, max));
  const evidenceEntries = ranked.filter(entry => !isRepoPolicyPath(entry.path));
  const selected = [];
  const selectedPaths = new Set();
  const add = (entries = [], count = entries.length) => {
    for (const entry of entries) {
      if (selected.length >= max - policyEntries.length || count <= 0) break;
      const key = String(entry.path || '').toLowerCase();
      if (!key || selectedPaths.has(key)) continue;
      selected.push(entry);
      selectedPaths.add(key);
      count -= 1;
    }
  };

  const operationalCorePatterns = [
    /^server\/routes\/(?:wikiRoutes|authDiscoveryRoutes|agentChatRoutes)\.[jt]s$/i,
    /^server\/services\/(?:wikiMaintenanceService|wikiMaintenancePublicationService|githubRepoWatcherService|wikiScheduledMaintenanceWorker|wikiAskService)\.[jt]s$/i,
    /^server\/models\/index\.[jt]s$/i,
    /^note-taker-ui\/src\/(?:App|api\/wiki|system\/SystemStatusContext)\.[jt]sx?$/i,
    /^note-taker-ui\/src\/components\/wiki\/(?:WikiRepoCreateComposer|WikiPageReadView)\.[jt]sx?$/i,
    /^note-taker-ui\/src\/pages\/(?:DataIntegrations|SharedWikiPage)\.[jt]sx?$/i
  ];

  // Reserve the source budget by evidence job. A single large docs/ tree must
  // not crowd out the files that actually own runtime behavior.
  add(evidenceEntries.filter(entry => {
    const path = String(entry.path || '').toLowerCase();
    return path === 'package.json'
      || /(^|\/)package\.json$/.test(path)
      || /(^|\/)readme(\.|$)/.test(path)
      || /^(\.env\.example|render\.ya?ml|vercel\.json|dockerfile|docker-compose\.ya?ml)$/.test(path)
      || /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path);
  }), 10);
  // Keep the request/publication/render chain before filling the general code
  // budget. Large route trees must not crowd out transaction boundaries.
  add(evidenceEntries.filter(entry => (
    operationalCorePatterns.some(pattern => pattern.test(String(entry.path || '')))
  )), 20);
  add(evidenceEntries.filter(entry => {
    const path = String(entry.path || '').toLowerCase();
    return /\.(js|jsx|ts|tsx)$/.test(path)
      && /^(server|api|src|note-taker-ui|client|web|app|frontend)\//.test(path);
  }), 18);
  add(evidenceEntries.filter(entry => {
    const path = String(entry.path || '').toLowerCase();
    return /^(packages|libs|modules)\/[^/]+\/src\/.*\.(js|jsx|ts|tsx)$/.test(path);
  }), 18);
  add(evidenceEntries.filter(entry => {
    const path = String(entry.path || '').toLowerCase();
    return /\.(md|mdx|rst|txt)$/.test(path)
      && !/(^|\/)readme(\.|$)/.test(path)
      && classifyRepoDocClass(path) !== 'planned';
  }), 12);
  add(evidenceEntries.filter(entry => classifyRepoDocClass(entry.path) === 'planned'), 4);
  add(evidenceEntries.filter(entry => classifyRepoDocClass(entry.path) !== 'planned'));
  add(evidenceEntries);
  return [...selected, ...policyEntries].slice(0, max);
};

const decodeBase64 = (value = '') => Buffer.from(String(value || '').replace(/\s/g, ''), 'base64').toString('utf8');

const classifyRepoDocClass = (path = '') => {
  const lower = String(path || '').toLowerCase();
  if (lower === '__repo_inventory__/code-inventory.txt') return 'inventory';
  if (isRepoPolicyPath(lower)) return 'policy';
  if (/(^|\/)package\.json$/.test(lower) || /^\.github\/workflows\//.test(lower)) return 'config';
  if (/\.(js|jsx|ts|tsx)$/i.test(lower)) return 'code';
  if (/(^|\/)readme(\.|$)/.test(lower)) return 'readme';
  if (lower === 'agents.md' || /(^|\/)(runbook|setup|getting-started|developer|dev|deploy)[^/]*\.(md|mdx|rst|txt)$/i.test(lower)) return 'runbook';
  if (/(^|\/)(adr|adrs|decisions)\//.test(lower)) return 'decision';
  if (/(^|\/)[^/]*(spec|roadmap|plan|investigation|spike|qa-report|sweep)[^/]*\.(md|mdx|rst|txt)$/i.test(lower)) return 'planned';
  if (/^docs\/growth\//i.test(lower) || /^docs\/superpowers\/plans\//i.test(lower)) return 'planned';
  if (/^changelog(\.|$)|^changes(\.|$)/.test(lower)) return 'changelog';
  return 'document';
};

const isRepoPolicyPath = (path = '') => {
  const lower = String(path || '').toLowerCase();
  return lower === 'agents.md'
    || lower === 'claude.md'
    || lower === '.cursorrules'
    || lower === '.github/copilot-instructions.md'
    || /(^|\/)(cursor|claude|agent|agents)[^/]*\.(md|mdx|rst|txt)$/i.test(lower)
    || /(^|\/)prompts?\//i.test(lower);
};

const buildCodeInventoryDoc = ({ owner, repo, headSha, tree = [] } = {}) => {
  const entries = (Array.isArray(tree) ? tree : [])
    .filter(entry => entry?.type === 'blob')
    .map(entry => String(entry.path || ''))
    .filter(Boolean);
  const dirs = Array.from(new Set(entries.map(path => path.split('/')[0]).filter(Boolean))).sort();
  const pick = (pattern, limit = 24) => entries.filter(path => pattern.test(path)).sort().slice(0, limit);
  const lines = [
    `${owner}/${repo} repository code inventory.`,
    `Head commit: ${headSha}.`,
    '',
    `Top-level directories: ${dirs.join(', ') || 'none'}.`,
    '',
    'Package/config files:',
    ...pick(/(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|turbo\.json|vite\.config\.[jt]s|next\.config\.[jt]s|tsconfig\.json)$/i, 40).map(path => `- ${path}`),
    '',
    'Workflow files:',
    ...pick(/^\.github\/workflows\/[^/]+\.(ya?ml)$/i, 40).map(path => `- ${path}`),
    '',
    'Server routes:',
    ...pick(/^(server|api)\/routes\/.*\.[jt]s$/i, 48).map(path => `- ${path}`),
    '',
    'Server services:',
    ...pick(/^(server|api)\/services\/.*\.[jt]s$/i, 64).map(path => `- ${path}`),
    '',
    'Models and persistence:',
    ...pick(/^(server|api)\/models\/.*\.[jt]s$/i, 32).map(path => `- ${path}`),
    '',
    'Frontend wiki/library/think surfaces:',
    ...pick(/^(note-taker-ui|client|web|app|frontend)\/src\/(components|pages|api)\/.*(Wiki|Library|Think|wiki|library|think).*?\.[jt]sx?$/i, 64).map(path => `- ${path}`)
  ];
  return {
    path: '__repo_inventory__/code-inventory.txt',
    sha: headSha,
    size: lines.join('\n').length,
    text: trim(lines.join('\n'), 12000),
    htmlUrl: `https://github.com/${owner}/${repo}/tree/${headSha}`,
    synthetic: true
  };
};

const fetchRecentCommits = async ({
  owner,
  repo,
  branch,
  fetchImpl = global.fetch,
  token = githubToken(),
  limit = DEFAULT_REPO_COMMIT_LIMIT
} = {}) => {
  try {
    const commits = await fetchJson({
      url: repoApiUrl({
        owner,
        repo,
        path: `/commits?sha=${encodeURIComponent(branch || 'main')}&per_page=${Math.max(1, Math.min(Number(limit) || DEFAULT_REPO_COMMIT_LIMIT, 20))}`
      }),
      fetchImpl,
      token
    });
    return (Array.isArray(commits) ? commits : [])
      .map((commit) => ({
        sha: trim(commit.sha || '', 80),
        message: trim(commit.commit?.message || '', 500),
        authorName: trim(commit.commit?.author?.name || '', 120),
        committedAt: commit.commit?.author?.date || commit.commit?.committer?.date || null,
        htmlUrl: commit.html_url || ''
      }))
      .filter(commit => commit.sha && commit.message)
      .slice(0, Math.max(1, Math.min(Number(limit) || DEFAULT_REPO_COMMIT_LIMIT, 20)));
  } catch (error) {
    if (![404, 403, 409].includes(Number(error.statusCode))) throw error;
    return [];
  }
};

const fetchRepoHead = async ({
  owner,
  repo,
  fetchImpl = global.fetch,
  token = githubToken(),
  signal
} = {}) => {
  const repository = await fetchJson({ url: repoApiUrl({ owner, repo }), fetchImpl, token, signal });
  if (repository.private) {
    const error = new Error('Private GitHub repositories are not supported for public repo wiki v1.');
    error.statusCode = 400;
    throw error;
  }
  const defaultBranch = trim(repository.default_branch || 'main', 120);
  const branch = await fetchJson({ url: repoApiUrl({ owner, repo, path: `/branches/${encodeURIComponent(defaultBranch)}` }), fetchImpl, token, signal });
  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    description: trim(repository.description || '', 500),
    defaultBranch,
    headSha: trim(branch?.commit?.sha || repository.default_branch_sha || '', 80)
  };
};

const fetchRepoSnapshot = async ({
  owner,
  repo,
  fetchImpl = global.fetch,
  token = githubToken(),
  docLimit = DEFAULT_DOC_PATH_LIMIT,
  blobTextLimit = DEFAULT_BLOB_TEXT_LIMIT
} = {}) => {
  const head = await fetchRepoHead({ owner, repo, fetchImpl, token });
  const { defaultBranch, headSha } = head;
  const tree = await fetchJson({
    url: repoApiUrl({ owner, repo, path: `/git/trees/${encodeURIComponent(headSha || defaultBranch)}?recursive=1` }),
    fetchImpl,
    token
  });
  const docEntries = selectRepoEvidenceEntries(tree.tree, docLimit);
  const docs = [];
  const inventoryDoc = buildCodeInventoryDoc({ owner, repo, headSha, tree: tree.tree });
  if (inventoryDoc.text) docs.push(inventoryDoc);
  for (const entry of docEntries) {
    const blob = await fetchJson({ url: repoApiUrl({ owner, repo, path: `/git/blobs/${encodeURIComponent(entry.sha)}` }), fetchImpl, token });
    docs.push({
      path: entry.path,
      sha: entry.sha,
      size: Number(entry.size || 0),
      text: trim(decodeBase64(blob.content || ''), blobTextLimit),
      htmlUrl: `https://github.com/${owner}/${repo}/blob/${headSha}/${entry.path}`
    });
  }
  let latestRelease = null;
  try {
    const release = await fetchJson({ url: repoApiUrl({ owner, repo, path: '/releases/latest' }), fetchImpl, token });
    latestRelease = {
      tagName: trim(release.tag_name || '', 120),
      name: trim(release.name || release.tag_name || '', 240),
      body: trim(release.body || '', 7000),
      publishedAt: release.published_at || null,
      htmlUrl: release.html_url || ''
    };
  } catch (error) {
    if (![404, 403].includes(Number(error.statusCode))) throw error;
  }
  const recentCommits = await fetchRecentCommits({
    owner,
    repo,
    branch: defaultBranch,
    fetchImpl,
    token,
    limit: DEFAULT_REPO_COMMIT_LIMIT
  });
  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    description: head.description,
    defaultBranch,
    headSha,
    docs,
    recentCommits,
    latestRelease
  };
};

const checkGitHubRepoHeadForPage = async ({
  WikiPage,
  page,
  fetchImpl = global.fetch,
  token = githubToken(),
  now = () => new Date(),
  signal
} = {}) => {
  if (!page) {
    const error = new Error('Wiki page is required for GitHub repo head check.');
    error.statusCode = 404;
    throw error;
  }
  const watch = page.externalWatches?.githubRepo || {};
  const owner = normalizeOwnerOrRepo(watch.owner);
  const repo = normalizeOwnerOrRepo(watch.repo);
  if (!owner || !repo) {
    const error = new Error('This page does not have a GitHub repo configured.');
    error.statusCode = 400;
    throw error;
  }
  const head = await fetchRepoHead({ owner, repo, fetchImpl, token, signal });
  const publishedGeneratorVersion = String(watch.publishedGeneratorVersion || '').trim();
  const generatorStale = publishedGeneratorVersion !== REPO_WIKI_GENERATOR_VERSION;
  const changed = Boolean(head.headSha && (
    head.headSha !== watch.publishedHeadSha ||
    generatorStale
  ));
  const patch = {
    owner,
    repo,
    defaultBranch: head.defaultBranch,
    lastHeadProbeAt: now(),
    lastHeadSha: head.headSha,
    candidateHeadSha: changed ? head.headSha : '',
    candidateGeneratorVersion: changed ? REPO_WIKI_GENERATOR_VERSION : '',
    buildStatus: changed ? 'queued' : 'ready',
    errorMessage: ''
  };
  if (WikiPage?.findOneAndUpdate && page._id && page.userId) {
    const updates = Object.fromEntries(Object.entries(patch).map(([key, value]) => [
      `externalWatches.githubRepo.${key}`,
      value
    ]));
    const updated = await WikiPage.findOneAndUpdate(
      { _id: page._id, userId: page.userId, status: { $ne: 'archived' } },
      { $set: updates },
      { new: true }
    );
    return { page: updated || page, head, changed };
  }
  setGitHubRepoWatch({ page, patch });
  if (typeof page.save === 'function') await page.save();
  return { page, head, changed };
};

const repoDocExternalId = ({ owner, repo, headSha, doc } = {}) => `github-doc:${owner}/${repo}:${headSha}:${doc?.path || ''}:${doc?.sha || ''}`;
const repoReleaseExternalId = ({ owner, repo, release } = {}) => `github-release:${owner}/${repo}:${release?.tagName || ''}`;
const repoCommitsExternalId = ({ owner, repo, headSha } = {}) => `github-commits:${owner}/${repo}:${headSha || ''}`;
const repoSnapshotExternalId = ({ owner, repo, headSha } = {}) => `github-snapshot:${owner}/${repo}:${headSha || ''}`;

const buildRepoDocEventPayload = ({ userId, page, snapshot, doc } = {}) => ({
  userId,
  sourceType: 'external',
  provider: 'github-repo',
  externalId: repoDocExternalId({ owner: snapshot.owner, repo: snapshot.repo, headSha: snapshot.headSha, doc }),
  eventType: 'synced',
  title: trim(`${snapshot.fullName} ${doc.path}`, 240),
  summary: trim(`${doc.path} from ${snapshot.fullName} at ${snapshot.headSha.slice(0, 7)}.`, 1200),
  text: [
    `${snapshot.fullName} repository developer evidence source.`,
    `Path: ${doc.path}.`,
    `Commit: ${snapshot.headSha}.`,
    doc.text
  ].filter(Boolean).join('\n\n'),
  url: doc.htmlUrl,
  sourceUpdatedAt: null,
  affectedPageIds: [page?._id].filter(Boolean),
  metadata: {
    source: 'github-repo',
    owner: snapshot.owner,
    repo: snapshot.repo,
    fullName: snapshot.fullName,
    path: doc.path,
    evidenceType: doc.path === '__repo_inventory__/code-inventory.txt'
      ? 'inventory'
      : isRepoPolicyPath(doc.path)
        ? 'policy'
        : /\.(json|ya?ml)$/i.test(doc.path) ? 'config' : /\.(js|jsx|ts|tsx)$/i.test(doc.path) ? 'code' : 'document',
    docClass: classifyRepoDocClass(doc.path),
    blobSha: doc.sha,
    commitSha: snapshot.headSha,
    ref: `${doc.path} @ ${snapshot.headSha.slice(0, 7)}`,
    pageId: String(page?._id || '')
  }
});

const buildRepoCommitsEventPayload = ({ userId, page, snapshot, commits = [] } = {}) => ({
  userId,
  sourceType: 'external',
  provider: 'github-repo',
  externalId: repoCommitsExternalId({ owner: snapshot.owner, repo: snapshot.repo, headSha: snapshot.headSha }),
  eventType: 'synced',
  title: trim(`${snapshot.fullName} recent commits`, 240),
  summary: trim(`${snapshot.fullName} recent work at ${snapshot.headSha.slice(0, 7)}.`, 1200),
  text: [
    `${snapshot.fullName} recent commits.`,
    `Default branch: ${snapshot.defaultBranch}.`,
    `Head commit: ${snapshot.headSha}.`,
    ...(Array.isArray(commits) ? commits : []).map((commit, index) => (
      `${index + 1}. ${commit.sha.slice(0, 7)} ${commit.committedAt || 'unknown date'} — ${commit.message}`
    ))
  ].filter(Boolean).join('\n'),
  url: `https://github.com/${snapshot.owner}/${snapshot.repo}/commits/${snapshot.headSha}`,
  sourceUpdatedAt: commits?.[0]?.committedAt || null,
  affectedPageIds: [page?._id].filter(Boolean),
  metadata: {
    source: 'github-repo',
    owner: snapshot.owner,
    repo: snapshot.repo,
    fullName: snapshot.fullName,
    evidenceType: 'recent_commits',
    commitSha: snapshot.headSha,
    ref: `recent commits @ ${snapshot.headSha.slice(0, 7)}`,
    pageId: String(page?._id || '')
  }
});

const buildRepoReleaseEventPayload = ({ userId, page, snapshot, release } = {}) => ({
  userId,
  sourceType: 'external',
  provider: 'github-repo',
  externalId: repoReleaseExternalId({ owner: snapshot.owner, repo: snapshot.repo, release }),
  eventType: 'synced',
  title: trim(`${snapshot.fullName} release ${release.tagName || release.name}`, 240),
  summary: trim(`${snapshot.fullName} published ${release.name || release.tagName}${release.publishedAt ? ` on ${release.publishedAt}` : ''}.`, 1200),
  text: [
    `${snapshot.fullName} release notes.`,
    release.tagName ? `Tag: ${release.tagName}.` : '',
    release.publishedAt ? `Published: ${release.publishedAt}.` : '',
    release.body
  ].filter(Boolean).join('\n\n'),
  url: release.htmlUrl,
  sourceUpdatedAt: release.publishedAt || null,
  affectedPageIds: [page?._id].filter(Boolean),
  metadata: {
    source: 'github-repo',
    owner: snapshot.owner,
    repo: snapshot.repo,
    fullName: snapshot.fullName,
    tagName: release.tagName,
    releaseName: release.name,
    ref: `${release.tagName || release.name} release`,
    pageId: String(page?._id || '')
  }
});

const findExistingRepoSourceEvent = async ({ WikiSourceEvent, userId, provider, externalId } = {}) => {
  const query = WikiSourceEvent.findOne({ userId, provider, externalId });
  if (query && typeof query.lean === 'function') return query.lean();
  if (query && typeof query.select === 'function') {
    const selected = query.select('');
    if (selected && typeof selected.lean === 'function') return selected.lean();
    return selected;
  }
  return query;
};

const markRepoEvidenceEventAttached = async ({ WikiSourceEvent, event, snapshotKey } = {}) => {
  if (!event) return event;
  const metadata = {
    ...(event.metadata?.toObject ? event.metadata.toObject() : event.metadata || {}),
    batchStatus: 'attached',
    snapshotKey
  };
  if (WikiSourceEvent?.findOneAndUpdate) {
    return WikiSourceEvent.findOneAndUpdate(
      { _id: event._id },
      { $set: { status: 'ignored', metadata, errorMessage: '' } },
      { new: true }
    );
  }
  event.status = 'ignored';
  event.metadata = metadata;
  event.errorMessage = '';
  if (typeof event.save === 'function') await event.save();
  return event;
};

const createMissingRepoEvents = async ({ WikiSourceEvent, userId, page, snapshot } = {}) => {
  if (!WikiSourceEvent || !userId || !page || !snapshot) return { evidenceEvents: [], maintenanceEvent: null };
  const payloads = [
    ...(snapshot.docs || []).map(doc => buildRepoDocEventPayload({ userId, page, snapshot, doc })),
    ...(snapshot.recentCommits?.length ? [buildRepoCommitsEventPayload({ userId, page, snapshot, commits: snapshot.recentCommits })] : []),
    ...(snapshot.latestRelease?.tagName ? [buildRepoReleaseEventPayload({ userId, page, snapshot, release: snapshot.latestRelease })] : [])
  ];
  const created = [];
  for (const payload of payloads) {
    const existing = await findExistingRepoSourceEvent({
      WikiSourceEvent,
      userId,
      provider: payload.provider,
      externalId: payload.externalId
    });
    if (existing) {
      created.push(await markRepoEvidenceEventAttached({
        WikiSourceEvent,
        event: existing,
        snapshotKey: repoSnapshotExternalId(snapshot)
      }) || existing);
      continue;
    }
    const event = await createWikiSourceEvent({
      WikiSourceEvent,
      ...payload,
      status: 'ignored',
      metadata: {
        ...(payload.metadata || {}),
        batchStatus: 'attached',
        snapshotKey: repoSnapshotExternalId(snapshot)
      }
    });
    if (event) created.push(event);
  }
  const snapshotExternalId = repoSnapshotExternalId(snapshot);
  const maintenanceExternalId = `${snapshotExternalId}:page:${String(page._id || '')}`;
  let maintenanceEvent = await findExistingRepoSourceEvent({
    WikiSourceEvent,
    userId,
    provider: 'github-repo-snapshot',
    externalId: maintenanceExternalId
  });
  if (!maintenanceEvent) {
    maintenanceEvent = await createWikiSourceEvent({
      WikiSourceEvent,
      userId,
      sourceType: 'external',
      provider: 'github-repo-snapshot',
      externalId: maintenanceExternalId,
      eventType: 'synced',
      title: trim(`${snapshot.fullName} repository snapshot`, 240),
      summary: trim(`${created.length} repository evidence records collected at ${snapshot.headSha.slice(0, 7)}.`, 1200),
      text: `${snapshot.fullName} repository snapshot at ${snapshot.headSha}.`,
      url: `https://github.com/${snapshot.owner}/${snapshot.repo}/tree/${snapshot.headSha}`,
      affectedPageIds: [page._id].filter(Boolean),
      metadata: {
        source: 'github-repo-snapshot',
        owner: snapshot.owner,
        repo: snapshot.repo,
        fullName: snapshot.fullName,
        commitSha: snapshot.headSha,
        snapshotKey: snapshotExternalId,
        documentEventIds: created.map(event => event._id).filter(Boolean),
        evidenceCount: created.length,
        pageId: String(page._id || ''),
        enforcePublicationQuality: true
      }
    });
  }
  return { evidenceEvents: created, maintenanceEvent };
};

const setGitHubRepoWatch = ({ page, patch = {} } = {}) => {
  page.externalWatches = {
    ...(page.externalWatches?.toObject ? page.externalWatches.toObject() : page.externalWatches || {}),
    githubRepo: {
      ...((page.externalWatches?.githubRepo?.toObject ? page.externalWatches.githubRepo.toObject() : page.externalWatches?.githubRepo) || {}),
      ...patch
    }
  };
  if (typeof page.markModified === 'function') page.markModified('externalWatches');
};

const checkGitHubRepoWatchForPage = async ({
  WikiSourceEvent,
  page,
  fetchImpl = global.fetch,
  token = githubToken(),
  now = () => new Date()
} = {}) => {
  if (!page) {
    const error = new Error('Wiki page is required for GitHub repo watch.');
    error.statusCode = 404;
    throw error;
  }
  const watch = page.externalWatches?.githubRepo || {};
  const owner = normalizeOwnerOrRepo(watch.owner);
  const repo = normalizeOwnerOrRepo(watch.repo);
  if (!owner || !repo) {
    const error = new Error('This page does not have a GitHub repo configured.');
    error.statusCode = 400;
    throw error;
  }
  try {
    const snapshot = await fetchRepoSnapshot({ owner, repo, fetchImpl, token });
    const publishedGeneratorVersion = String(watch.publishedGeneratorVersion || '').trim();
    const buildRequired = snapshot.headSha !== watch.publishedHeadSha
      || publishedGeneratorVersion !== REPO_WIKI_GENERATOR_VERSION;
    const { evidenceEvents: events, maintenanceEvent } = await createMissingRepoEvents({
      WikiSourceEvent,
      userId: page.userId,
      page,
      snapshot
    });
    setGitHubRepoWatch({
      page,
      patch: {
        owner,
        repo,
        defaultBranch: snapshot.defaultBranch,
        status: 'active',
        lastCheckedAt: now(),
        lastHeadSha: snapshot.headSha,
        candidateHeadSha: buildRequired ? snapshot.headSha : '',
        candidateGeneratorVersion: buildRequired ? REPO_WIKI_GENERATOR_VERSION : '',
        buildStatus: buildRequired ? 'queued' : 'ready',
        lastReleaseTag: snapshot.latestRelease?.tagName || watch.lastReleaseTag || '',
        lastEventIds: [maintenanceEvent?._id, ...events.map(event => event._id)].filter(Boolean).slice(0, 20),
        errorMessage: ''
      }
    });
    if (typeof page.save === 'function') await page.save();
    return { page, snapshot, events, maintenanceEvent, buildRequired };
  } catch (error) {
    setGitHubRepoWatch({
      page,
      patch: {
        owner,
        repo,
        status: 'error',
        lastCheckedAt: now(),
        errorMessage: error.message || 'GitHub repo watch failed.'
      }
    });
    if (typeof page.save === 'function') await page.save();
    throw error;
  }
};

const armGitHubRepoWatchForPage = async ({
  WikiPage,
  WikiSourceEvent,
  userId,
  pageId,
  repo: repoInput = '',
  owner = '',
  repoName = '',
  fetchImpl = global.fetch,
  token = githubToken(),
  now = () => new Date(),
  checkNow = true
} = {}) => {
  if (!WikiPage || !userId || !pageId) {
    const error = new Error('WikiPage, userId, and pageId are required to arm GitHub repo watch.');
    error.statusCode = 400;
    throw error;
  }
  const parsed = repoInput ? parseGitHubRepo(repoInput) : { owner: normalizeOwnerOrRepo(owner), repo: normalizeOwnerOrRepo(repoName) };
  if (!parsed.owner || !parsed.repo) {
    const error = new Error('GitHub repo owner and repo are required.');
    error.statusCode = 400;
    throw error;
  }
  const page = await WikiPage.findOne({ _id: pageId, userId, status: { $ne: 'archived' } });
  if (!page) {
    const error = new Error('Wiki page not found.');
    error.statusCode = 404;
    throw error;
  }
  const currentWatch = page.externalWatches?.githubRepo?.toObject
    ? page.externalWatches.githubRepo.toObject()
    : page.externalWatches?.githubRepo || {};
  const sameRepo = normalizeOwnerOrRepo(currentWatch.owner).toLowerCase() === parsed.owner.toLowerCase()
    && normalizeOwnerOrRepo(currentWatch.repo).toLowerCase() === parsed.repo.toLowerCase();
  setGitHubRepoWatch({
    page,
    patch: {
      owner: parsed.owner,
      repo: parsed.repo,
      defaultBranch: '',
      status: 'active',
      lastCheckedAt: null,
      lastHeadSha: '',
      publishedHeadSha: sameRepo ? currentWatch.publishedHeadSha || '' : '',
      candidateHeadSha: sameRepo ? currentWatch.candidateHeadSha || '' : '',
      lastPublishedAt: sameRepo ? currentWatch.lastPublishedAt || null : null,
      lastBuildAttemptAt: sameRepo ? currentWatch.lastBuildAttemptAt || null : null,
      lastBuildError: sameRepo ? currentWatch.lastBuildError || '' : '',
      buildStatus: sameRepo ? currentWatch.buildStatus || 'idle' : 'idle',
      buildLease: sameRepo
        ? currentWatch.buildLease || { token: '', headSha: '', acquiredAt: null, expiresAt: null }
        : { token: '', headSha: '', acquiredAt: null, expiresAt: null },
      lastReleaseTag: '',
      lastEventIds: [],
      errorMessage: ''
    }
  });
  if (typeof page.save === 'function') await page.save();
  if (!checkNow) return { page, snapshot: null, events: [] };
  return checkGitHubRepoWatchForPage({ WikiSourceEvent, page, fetchImpl, token, now });
};

const dueGitHubRepoWatchQuery = ({ cutoff = new Date(Date.now() - DEFAULT_GITHUB_REPO_WATCH_MAX_AGE_MS) } = {}) => ({
  status: { $ne: 'archived' },
  'externalWatches.githubRepo.status': 'active',
  'externalWatches.githubRepo.owner': { $nin: ['', null] },
  'externalWatches.githubRepo.repo': { $nin: ['', null] },
  $or: [
    { 'externalWatches.githubRepo.lastCheckedAt': null },
    { 'externalWatches.githubRepo.lastCheckedAt': { $exists: false } },
    { 'externalWatches.githubRepo.lastCheckedAt': { $lte: cutoff } }
  ]
});

const drainDueGitHubRepoWatches = async ({
  models = {},
  limit = 5,
  maxAgeMs = DEFAULT_GITHUB_REPO_WATCH_MAX_AGE_MS,
  fetchImpl = global.fetch,
  token = githubToken(),
  checkGitHubRepoWatchForPageFn = checkGitHubRepoWatchForPage,
  now = new Date()
} = {}) => {
  const { WikiPage, WikiSourceEvent } = models;
  if (!WikiPage || !WikiSourceEvent) return { processed: 0, failed: 0, skipped: true, results: [] };
  const max = Math.max(1, Math.min(Number(limit) || 5, 25));
  const cutoff = new Date(now.getTime() - Math.max(60 * 60 * 1000, Number(maxAgeMs) || DEFAULT_GITHUB_REPO_WATCH_MAX_AGE_MS));
  const pages = await WikiPage.find(dueGitHubRepoWatchQuery({ cutoff }))
    .sort({ 'externalWatches.githubRepo.lastCheckedAt': 1, updatedAt: 1 })
    .limit(max);
  const results = [];
  for (const page of Array.isArray(pages) ? pages : []) {
    try {
      const result = await checkGitHubRepoWatchForPageFn({
        WikiSourceEvent,
        page,
        fetchImpl,
        token,
        now: () => now
      });
      results.push({
        pageId: String(page._id || ''),
        repo: `${page.externalWatches?.githubRepo?.owner || ''}/${page.externalWatches?.githubRepo?.repo || ''}`,
        status: 'completed',
        headSha: result.snapshot?.headSha || '',
        sourceEvents: Array.isArray(result.events) ? result.events.length : 0
      });
    } catch (error) {
      results.push({
        pageId: String(page._id || ''),
        repo: `${page.externalWatches?.githubRepo?.owner || ''}/${page.externalWatches?.githubRepo?.repo || ''}`,
        status: 'failed',
        error: error.message || String(error)
      });
    }
  }
  return {
    processed: results.filter(result => result.status === 'completed').length,
    failed: results.filter(result => result.status === 'failed').length,
    results
  };
};

module.exports = {
  DEFAULT_GITHUB_REPO_WATCH_MAX_AGE_MS,
  armGitHubRepoWatchForPage,
  buildRepoDocEventPayload,
  buildRepoCommitsEventPayload,
  buildRepoReleaseEventPayload,
  checkGitHubRepoHeadForPage,
  checkGitHubRepoWatchForPage,
  classifyRepoDocClass,
  drainDueGitHubRepoWatches,
  dueGitHubRepoWatchQuery,
  fetchRepoHead,
  fetchRepoSnapshot,
  githubToken,
  isUsefulDocPath,
  isUsefulRepoEvidencePath,
  normalizeOwnerOrRepo,
  parseGitHubRepo,
  repoDocExternalId,
  repoCommitsExternalId,
  repoReleaseExternalId,
  repoSnapshotExternalId,
  selectRepoDocEntries,
  selectRepoEvidenceEntries
};
