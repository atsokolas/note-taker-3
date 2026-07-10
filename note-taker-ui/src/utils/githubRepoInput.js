const normalizeText = (value = '') => String(value || '').trim();

export const normalizeGitHubRepoInput = (value = '') => normalizeText(value)
  .replace(/^https?:\/\/github\.com\//i, '')
  .replace(/^github\.com\//i, '')
  .replace(/\.git(?:[/?#].*)?$/i, '')
  .replace(/[?#].*$/, '')
  .replace(/\/+$/, '');

export const parseGitHubRepoInput = (value = '') => {
  const repoInput = normalizeGitHubRepoInput(value);
  if (!repoInput || !repoInput.includes('/')) return null;
  const [owner = '', repo = ''] = repoInput.split('/').filter(Boolean);
  if (!owner || !repo) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  return { owner, repo, fullName: `${owner}/${repo}` };
};

export const isValidGitHubRepoInput = (value = '') => Boolean(parseGitHubRepoInput(value));

export const githubRepoUrl = ({ owner = '', repo = '' } = {}) => (
  owner && repo ? `https://github.com/${owner}/${repo}` : ''
);

export const buildRepoWikiTitle = (repoSlug = '') => {
  const slug = normalizeText(repoSlug);
  return slug ? `${slug} — repo wiki` : 'repo wiki';
};
