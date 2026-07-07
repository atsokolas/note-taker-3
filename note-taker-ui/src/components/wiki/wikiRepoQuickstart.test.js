import { extractRepoDeveloperQuickstart, hasRepoDeveloperQuickstart } from './wikiRepoQuickstart';

const repoPage = {
  pageType: 'project',
  externalWatches: {
    githubRepo: { owner: 'openai', repo: 'agents-js', status: 'active' }
  }
};

describe('wikiRepoQuickstart', () => {
  it('extracts metadata fields when present', () => {
    const quickstart = extractRepoDeveloperQuickstart({
      ...repoPage,
      metadata: {
        runCommand: 'npm start',
        testCommand: 'CI=1 npm test -- --watchAll=false',
        deployFrontend: 'Vercel · https://www.noeis.io',
        deployApi: 'Render · https://note-taker-3-unrg.onrender.com',
        keyPaths: ['note-taker-ui/', 'server/']
      }
    });

    expect(quickstart).toEqual({
      run: 'npm start',
      test: 'CI=1 npm test -- --watchAll=false',
      deploy: {
        summary: 'Frontend: Vercel · https://www.noeis.io · API: Render · https://note-taker-3-unrg.onrender.com',
        frontend: 'Vercel · https://www.noeis.io',
        api: 'Render · https://note-taker-3-unrg.onrender.com'
      },
      keyPaths: ['note-taker-ui/', 'server/']
    });
  });

  it('extracts commands and paths from plainText heuristics', () => {
    const quickstart = extractRepoDeveloperQuickstart({
      ...repoPage,
      plainText: [
        'Developer quickstart',
        'Run: npm start',
        'Test: CI=1 npm test -- --watchAll=false --runInBand src/components/wiki',
        'Deploy: Frontend at https://www.noeis.io (Vercel) · API at https://note-taker-3-unrg.onrender.com (Render)',
        'Key paths',
        'note-taker-ui/',
        'server/',
        'scripts/'
      ].join('\n')
    });

    expect(quickstart?.run).toBe('npm start');
    expect(quickstart?.test).toMatch(/CI=1 npm test/);
    expect(quickstart?.deploy?.frontend).toMatch(/noeis\.io|Vercel/i);
    expect(quickstart?.deploy?.api).toMatch(/render/i);
    expect(quickstart?.keyPaths).toEqual(expect.arrayContaining(['note-taker-ui/', 'server/', 'scripts/']));
  });

  it('extracts verification commands from repo handoff sections', () => {
    const quickstart = extractRepoDeveloperQuickstart({
      ...repoPage,
      plainText: [
        'Five-minute setup',
        'Backend: npm run start - node server/server.js',
        'Run, test, build',
        'Wiki proof: npm run wiki:qa.',
        'Frontend build: npm run build from note-taker-ui/package.json.',
        'Architecture map',
        'server/routes/wikiRoutes.js owns the wiki HTTP surface.'
      ].join('\n'),
      sourceRefs: [{
        metadata: { source: 'github-repo', path: 'server/routes/wikiRoutes.js' }
      }]
    });

    expect(quickstart?.run).toMatch(/npm run start/);
    expect(quickstart?.test).toBe('npm run wiki:qa');
    expect(quickstart?.keyPaths).toContain('server/routes/wikiRoutes.js');
  });

  it('falls back to github source metadata paths', () => {
    const quickstart = extractRepoDeveloperQuickstart({
      ...repoPage,
      plainText: 'Run: npm run dev',
      sourceRefs: [{
        title: 'openai/agents-js docs/architecture.md',
        metadata: { source: 'github-repo', path: 'docs/architecture.md' }
      }]
    });

    expect(quickstart?.run).toBe('npm run dev');
    expect(quickstart?.keyPaths).toContain('docs/architecture.md');
  });

  it('returns null for non-repo pages', () => {
    expect(extractRepoDeveloperQuickstart({
      pageType: 'concept',
      plainText: 'Run: npm start'
    })).toBeNull();
    expect(hasRepoDeveloperQuickstart({ pageType: 'concept', plainText: 'Run: npm start' })).toBe(false);
  });

  it('returns null when repo page has no quickstart data', () => {
    expect(extractRepoDeveloperQuickstart({
      pageType: 'project',
      plainText: 'Repository sources are being attached.'
    })).toBeNull();
  });
});
