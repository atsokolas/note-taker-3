import { extractRepoDeveloperQuickstart, hasRepoDeveloperQuickstart } from './wikiRepoQuickstart';

const repoPage = {
  pageType: 'project',
  externalWatches: {
    githubRepo: { owner: 'openai', repo: 'agents-js', status: 'active' }
  }
};

const noteTakerHandoffPlainText = [
  'Five-minute setup',
  'Install API dependencies from the repository root with npm install.',
  'Install UI dependencies with cd note-taker-ui && npm install.',
  'Environment: copy .env.example locally, then configure JWT_SECRET and MONGODB_URI; text generation uses OPENROUTER_API_KEY when present, while HF_TOKEN remains the embedding credential.',
  'Run: npm run start - node server/server.js',
  'UI: npm run start from note-taker-ui/package.json - react-scripts start',
  'Test: npm run wiki:qa - git diff --check && node -c server/routes/wikiRoutes.js && node -c server/services/wikiMaintenanceService.js && node -c server/services/wikiMaintenanceOrchestrator.js',
  'Build: npm run build from note-taker-ui/package.json - react-scripts build',
  'Key paths',
  'note-taker-ui/',
  'server/server.js',
  'server/routes/wikiRoutes.js'
].join('\n');

describe('wikiRepoQuickstart', () => {
  it('extracts structured quickstart metadata when present', () => {
    const quickstart = extractRepoDeveloperQuickstart({
      ...repoPage,
      metadata: {
        quickstart: {
          install: { command: 'npm install', cwd: 'repository root' },
          installUi: { command: 'npm install', cwd: 'note-taker-ui', sourceFile: 'note-taker-ui/package.json' },
          apiRun: {
            command: 'npm run start',
            cwd: 'repository root',
            entrypoint: 'node server/server.js',
            sourceFile: 'package.json'
          },
          uiRun: {
            command: 'npm run start',
            cwd: 'note-taker-ui',
            entrypoint: 'react-scripts start',
            sourceFile: 'note-taker-ui/package.json'
          },
          test: { command: 'npm run wiki:qa', cwd: 'repository root', sourceFile: 'package.json' },
          build: { command: 'CI=true npm run build', cwd: 'note-taker-ui', sourceFile: 'note-taker-ui/package.json' },
          envVars: ['JWT_SECRET', 'MONGODB_URI'],
          localUrls: [{ label: 'API', url: 'http://localhost:5001' }]
        },
        deployFrontend: 'Vercel · https://www.noeis.io',
        deployApi: 'Render · https://note-taker-3-unrg.onrender.com',
        keyPaths: ['note-taker-ui/', 'server/server.js']
      }
    });

    expect(quickstart?.apiRun).toEqual({
      command: 'npm run start',
      cwd: 'repository root',
      entrypoint: 'node server/server.js',
      sourceFile: 'package.json'
    });
    expect(quickstart?.test).toEqual({
      command: 'npm run wiki:qa',
      cwd: 'repository root',
      entrypoint: '',
      sourceFile: 'package.json'
    });
    expect(quickstart?.build?.command).toBe('CI=true npm run build');
    expect(quickstart?.envVars).toEqual(['JWT_SECRET', 'MONGODB_URI']);
    expect(quickstart?.keyPaths).toEqual(expect.arrayContaining(['note-taker-ui/', 'server/server.js']));
  });

  it('parses five-minute setup bullets without expanding package scripts', () => {
    const quickstart = extractRepoDeveloperQuickstart({
      ...repoPage,
      plainText: noteTakerHandoffPlainText
    });

    expect(quickstart?.apiRun?.command).toBe('npm run start');
    expect(quickstart?.apiRun?.entrypoint).toBe('node server/server.js');
    expect(quickstart?.uiRun?.command).toBe('npm run start');
    expect(quickstart?.uiRun?.cwd).toBe('note-taker-ui');
    expect(quickstart?.test?.command).toBe('npm run wiki:qa');
    expect(quickstart?.test?.entrypoint).toBe('');
    expect(quickstart?.test?.sourceFile).toBe('package.json');
    expect(quickstart?.build?.command).toBe('CI=true npm run build');
    expect(quickstart?.build?.sourceFile).toBe('note-taker-ui/package.json');
    expect(quickstart?.envVars).toEqual(expect.arrayContaining(['JWT_SECRET', 'MONGODB_URI']));
    expect(quickstart?.keyPaths).toEqual(expect.arrayContaining(['server/server.js']));
  });

  it('keeps card and article aligned on server/server.js entrypoint', () => {
    const quickstart = extractRepoDeveloperQuickstart({
      ...repoPage,
      plainText: noteTakerHandoffPlainText
    });

    expect(quickstart?.apiRun?.entrypoint).toBe('node server/server.js');
    expect(quickstart?.keyPaths).toContain('server/server.js');
  });

  it('maps legacy metadata run/test fields to apiRun and proof command', () => {
    const quickstart = extractRepoDeveloperQuickstart({
      ...repoPage,
      metadata: {
        runCommand: 'npm run start',
        testCommand: 'npm run wiki:qa',
        keyPaths: ['note-taker-ui/', 'server/']
      }
    });

    expect(quickstart?.apiRun?.command).toBe('npm run start');
    expect(quickstart?.apiRun?.entrypoint).toBe('node server/server.js');
    expect(quickstart?.test?.command).toBe('npm run wiki:qa');
    expect(quickstart?.test?.sourceFile).toBe('package.json');
  });

  it('falls back to github source metadata paths', () => {
    const quickstart = extractRepoDeveloperQuickstart({
      ...repoPage,
      plainText: 'Run: npm run dev - nodemon server/server.js',
      sourceRefs: [{
        title: 'openai/agents-js docs/architecture.md',
        metadata: { source: 'github-repo', path: 'docs/architecture.md' }
      }]
    });

    expect(quickstart?.apiRun?.command).toBe('npm run dev');
    expect(quickstart?.apiRun?.entrypoint).toBe('nodemon server/server.js');
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
