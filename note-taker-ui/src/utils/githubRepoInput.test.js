import {
  buildRepoWikiTitle,
  parseGitHubRepoInput
} from './githubRepoInput';

describe('githubRepoInput', () => {
  it('preserves owner/repo casing from GitHub URLs', () => {
    expect(parseGitHubRepoInput('https://github.com/atsokolas/note-taker-3')).toEqual({
      owner: 'atsokolas',
      repo: 'note-taker-3',
      fullName: 'atsokolas/note-taker-3'
    });
    expect(parseGitHubRepoInput('Atsokolas/Note-Taker-3')).toEqual({
      owner: 'Atsokolas',
      repo: 'Note-Taker-3',
      fullName: 'Atsokolas/Note-Taker-3'
    });
  });

  it('builds repo wiki titles from the repo slug with original casing', () => {
    expect(buildRepoWikiTitle('note-taker-3')).toBe('note-taker-3 — repo wiki');
    expect(buildRepoWikiTitle('Note-Taker-3')).toBe('Note-Taker-3 — repo wiki');
  });
});
