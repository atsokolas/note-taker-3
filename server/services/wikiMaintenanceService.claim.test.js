const { __testables, maintainWikiPage, selectCandidateSources } = require('./wikiMaintenanceService');

const {
  attachClaimCitationIds,
  buildSectionMaintenancePlan,
  buildPrompt,
  collectClaimsFromDoc,
  deriveClaimsFromDoc,
  docFromArticle,
  evaluateWikiArticleQuality,
  fallbackMaintenance,
  findGitHubRepoDeveloperDossierFailures,
  findUnsupportedGitHubRepoClaims,
  inferMaintainedPageType,
  normalizeSourceIndexesUsed,
  formatKnownWikiPages,
  resolveClaimCitationIds,
  selectMaintenanceCandidates,
  toPlainText
} = __testables;

const findClaimMarks = (doc) => {
  const marks = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object') return;
    if (Array.isArray(node.marks)) {
      node.marks
        .filter(mark => mark?.type === 'claim')
        .forEach(mark => marks.push({ text: node.text, attrs: mark.attrs }));
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(doc);
  return marks;
};

const headings = (doc) => {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object') return;
    if (node.type === 'heading') {
      out.push((node.content || []).map(child => child.text || '').join(''));
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(doc);
  return out;
};

const findWikiLinkMarks = (doc) => {
  const marks = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object') return;
    if (Array.isArray(node.marks)) {
      node.marks
        .filter(mark => mark?.type === 'wikiLink')
        .forEach(mark => marks.push({ text: node.text, attrs: mark.attrs }));
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(doc);
  return marks;
};

const fakeFindModel = (records = []) => ({
  find: () => ({
    sort: () => ({
      limit: () => ({
        lean: () => Promise.resolve(records)
      })
    })
  })
});

describe('wikiMaintenanceService — claim marks in docFromArticle', () => {
  it('appends the wiki schema conventions to maintenance prompts', () => {
    const prompt = buildPrompt({
      page: { title: 'AI Memory', pageType: 'topic', body: {}, sourceRefs: [] },
      candidates: [],
      wikiSchemaContent: '## Ingest workflow\n- Update related pages first.',
      knownWikiPages: [{ _id: 'page-related', title: 'Compounding Interest', pageType: 'concept' }]
    });
    expect(prompt).toContain('User wiki schema conventions');
    expect(prompt).toContain('Update related pages first.');
    expect(prompt).toContain('mention existing related wiki pages by their exact titles');
    expect(prompt).toContain('Compounding Interest');
  });

  it('adds concrete anti-hallucination rules for GitHub repo pages', () => {
    const prompt = buildPrompt({
      page: {
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        pageType: 'project',
        body: {},
        createdFrom: {
          type: 'search',
          text: 'https://github.com/atsokolas/note-taker-3',
          label: 'GitHub repo: atsokolas/note-taker-3'
        }
      },
      candidates: [{
        index: 1,
        type: 'external',
        provider: 'github-repo',
        title: 'atsokolas/note-taker-3 README.md',
        text: 'Repository documentation source. Path: README.md.'
      }]
    });

    expect(prompt).toContain('GitHub repository page rules');
    expect(prompt).toContain('Write only what the repository evidence actually supports');
    expect(prompt).toContain('developer dossier');
    expect(prompt).toContain('Run locally');
    expect(prompt).toContain('Key files');
    expect(prompt).toContain('Developer quickstart');
    expect(prompt).toContain('docClass="planned"');
    expect(prompt).toContain('Do not claim the repo is published to npm');
    expect(prompt).toContain('Prefer concrete repo facts');
    expect(prompt).toContain('Do not describe them as Library highlights');
  });

  it('surfaces GitHub repo metadata in source blocks so specs stay quarantined', () => {
    const prompt = buildPrompt({
      page: {
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        pageType: 'project',
        createdFrom: { text: 'https://github.com/atsokolas/note-taker-3' }
      },
      candidates: [{
        index: 1,
        type: 'external',
        provider: 'github-repo',
        title: 'atsokolas/note-taker-3 docs/noeis-public-proof-gallery-spec-2026-07-03.md',
        text: 'Planned public proof gallery wedge.',
        metadata: {
          source: 'github-repo',
          path: 'docs/noeis-public-proof-gallery-spec-2026-07-03.md',
          evidenceType: 'document',
          docClass: 'planned',
          commitSha: '795f0dae1234567890'
        }
      }]
    });

    expect(prompt).toContain('Repository metadata: provider=github-repo');
    expect(prompt).toContain('path=docs/noeis-public-proof-gallery-spec-2026-07-03.md');
    expect(prompt).toContain('docClass=planned');
    expect(prompt).toContain('commit=795f0da');
  });

  it('does not add GitHub repo rules to ordinary wiki pages', () => {
    const prompt = buildPrompt({
      page: { title: 'Opportunity Cost', pageType: 'concept', body: {}, sourceRefs: [] },
      candidates: [{
        index: 1,
        type: 'article',
        title: 'Decision note',
        text: 'Opportunity cost compares the chosen path with the next-best alternative.'
      }]
    });

    expect(prompt).not.toContain('GitHub repository page rules');
    expect(prompt).not.toContain('Do not claim the repo is published to npm');
  });

  it('prefers attached GitHub repository evidence over unrelated library sources', () => {
    const candidates = selectMaintenanceCandidates({
      page: {
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        createdFrom: {
          type: 'search',
          text: 'https://github.com/atsokolas/note-taker-3',
          label: 'GitHub repo: atsokolas/note-taker-3'
        },
        sourceRefs: [{
          type: 'external',
          title: 'atsokolas/note-taker-3 README.md',
          snippet: 'Repository documentation source. Path: README.md. Modern JavaScript SPA for quick note capture.',
          metadata: { source: 'github-repo' }
        }]
      },
      sources: [{
        type: 'article',
        title: 'Debug Fixture - Library Source Provenance',
        text: 'This unrelated fixture discusses provenance-aware claims.'
      }],
      limit: 8
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe('atsokolas/note-taker-3 README.md');
    expect(candidates[0].text).not.toContain('Debug Fixture');
  });

  it('prioritizes current GitHub head code and config before stale planning docs', () => {
    const candidates = selectMaintenanceCandidates({
      page: {
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        createdFrom: {
          type: 'search',
          text: 'https://github.com/atsokolas/note-taker-3',
          label: 'GitHub repo: atsokolas/note-taker-3'
        },
        externalWatches: {
          githubRepo: {
            lastHeadSha: 'current1234567890'
          }
        },
        sourceRefs: [{
          type: 'external',
          title: 'atsokolas/note-taker-3 docs/deep-dive-qa-report-2026-06-04.md',
          snippet: 'Old QA sweep and Evernote OAuth spike notes.',
          provider: 'github-repo',
          metadata: {
            source: 'github-repo',
            path: 'docs/deep-dive-qa-report-2026-06-04.md',
            evidenceType: 'document',
            docClass: 'planned',
            commitSha: 'oldsha123'
          }
        }, {
          type: 'external',
          title: 'atsokolas/note-taker-3 package.json',
          snippet: '{"scripts":{"start":"node server/server.js","wiki:qa":"node scripts/wiki_qa.js"}}',
          provider: 'github-repo',
          metadata: {
            source: 'github-repo',
            path: 'package.json',
            evidenceType: 'config',
            docClass: 'config',
            commitSha: 'current1234567890'
          }
        }, {
          type: 'external',
          title: 'atsokolas/note-taker-3 server/server.js',
          snippet: 'const app = express();',
          provider: 'github-repo',
          metadata: {
            source: 'github-repo',
            path: 'server/server.js',
            evidenceType: 'code',
            docClass: 'code',
            commitSha: 'current1234567890'
          }
        }, {
          type: 'external',
          title: 'atsokolas/note-taker-3 recent commits',
          snippet: 'recent commits. current1 2026-07-05 - fix repo wiki grounding.',
          provider: 'github-repo',
          metadata: {
            source: 'github-repo',
            evidenceType: 'recent_commits',
            commitSha: 'current1234567890'
          }
        }]
      },
      sources: [],
      limit: 3
    });

    expect(candidates.slice(0, 3).map(source => source.metadata?.path || source.title)).toEqual([
      'package.json',
      'atsokolas/note-taker-3 recent commits',
      'server/server.js'
    ]);
    expect(candidates.slice(0, 3).map(source => source.metadata?.path || '')).not.toContain('docs/deep-dive-qa-report-2026-06-04.md');
  });

  it('falls back to a developer dossier for GitHub repo pages when model output is unavailable', () => {
    const result = fallbackMaintenance({
      page: {
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        pageType: 'project',
        createdFrom: {
          text: 'https://github.com/atsokolas/note-taker-3',
          label: 'GitHub repo: atsokolas/note-taker-3'
        }
      },
      candidates: [{
        index: 1,
        type: 'external',
        title: 'atsokolas/note-taker-3 package.json',
        text: '{"scripts":{"start":"node server/server.js","wiki:qa":"node scripts/wiki_qa.js","build":"cd note-taker-ui && npm run build"}}',
        provider: 'github-repo',
        metadata: { source: 'github-repo', path: 'package.json', evidenceType: 'config', docClass: 'config' }
      }, {
        index: 2,
        type: 'external',
        title: 'atsokolas/note-taker-3 server/server.js',
        text: 'const app = express();',
        provider: 'github-repo',
        metadata: { source: 'github-repo', path: 'server/server.js', evidenceType: 'code', docClass: 'code' }
      }, {
        index: 3,
        type: 'external',
        title: 'atsokolas/note-taker-3 note-taker-ui/src/App.js',
        text: 'React app routes.',
        provider: 'github-repo',
        metadata: { source: 'github-repo', path: 'note-taker-ui/src/App.js', evidenceType: 'code', docClass: 'code' }
      }, {
        index: 4,
        type: 'external',
        title: 'atsokolas/note-taker-3 recent commits',
        text: 'recent commits. current1 2026-07-05 - repo wiki grounding.',
        provider: 'github-repo',
        metadata: { source: 'github-repo', evidenceType: 'recent_commits' }
      }]
    });
    const text = toPlainText(docFromArticle({
      title: result.title,
      article: result.article
    }));

    expect(text).toContain('Run locally');
    expect(text).toContain('Architecture');
    expect(text).toContain('Key files');
    expect(text).toContain('Tests and deploy');
    expect(text).toContain('npm run start');
    expect(text).toContain('npm run wiki:qa');
    expect(text).toContain('server/server.js');
    expect(text).not.toMatch(/still needs source-backed development/i);
    expect(result.sourceIndexesUsed).toEqual(expect.arrayContaining([1, 2, 3, 4]));
  });

  it('publishes deterministic developer dossier content when a repo model draft fails quality gates', async () => {
    const page = {
      _id: 'repo-page-1',
      title: 'Atsokolas/Note-Taker-3 Repo Wiki',
      pageType: 'repo',
      createdFrom: {
        text: 'https://github.com/atsokolas/note-taker-3',
        label: 'GitHub repo: atsokolas/note-taker-3'
      },
      externalWatches: { githubRepo: { owner: 'atsokolas', repo: 'note-taker-3', lastHeadSha: '0053101' } },
      body: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'atsokolas/note-taker-3 is a public GitHub repository. Noeis will maintain this as a developer dossier grounded in package files, entrypoints, workflows, docs, releases, and recent commits.' }]
        }, {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Developer quickstart' }]
        }, {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Run, test, deploy, architecture, and key-path details will appear after the first GitHub sync attaches repository evidence.' }]
        }]
      },
      sourceRefs: [{
        type: 'external',
        title: 'atsokolas/note-taker-3 package.json',
        snippet: 'Path: package.json. { "scripts": { "start": "node server/server.js", "wiki:qa": "node scripts/wiki_qa.js", "build": "cd note-taker-ui && npm run build" } }',
        provider: 'github-repo',
        metadata: { source: 'github-repo', path: 'package.json', evidenceType: 'config', docClass: 'config', commitSha: '0053101' }
      }, {
        type: 'external',
        title: 'atsokolas/note-taker-3 server/server.js',
        snippet: 'Path: server/server.js. const app = express();',
        provider: 'github-repo',
        metadata: { source: 'github-repo', path: 'server/server.js', evidenceType: 'code', docClass: 'code', commitSha: '0053101' }
      }, {
        type: 'external',
        title: 'atsokolas/note-taker-3 note-taker-ui/src/App.js',
        snippet: 'Path: note-taker-ui/src/App.js. React app routes.',
        provider: 'github-repo',
        metadata: { source: 'github-repo', path: 'note-taker-ui/src/App.js', evidenceType: 'code', docClass: 'code', commitSha: '0053101' }
      }, {
        type: 'external',
        title: 'atsokolas/note-taker-3 recent commits',
        snippet: 'recent commits. 0053101 2026-07-05 - prevent duplicate wiki build streams.',
        provider: 'github-repo',
        metadata: { source: 'github-repo', evidenceType: 'recent_commits', commitSha: '0053101' }
      }]
    };

    const maintained = await maintainWikiPage({
      page,
      userId: 'user-1',
      models: { WikiPage: fakeFindModel([]) },
      isConfigured: () => true,
      chat: async () => ({
        model: 'test-model',
        text: JSON.stringify({
          title: 'Atsokolas/Note-Taker-3 Repo Wiki',
          article: {
            summary: { text: 'Noeis will maintain this as a developer dossier after the first GitHub sync attaches repository evidence.' },
            sections: [{
              heading: 'Developer quickstart',
              paragraphs: [{ text: 'Run, test, deploy, architecture, and key-path details will appear after the first GitHub sync attaches repository evidence.' }]
            }]
          },
          maintenance: { summary: 'Weak scaffold.', changelog: [], health: {} },
          sourceIndexesUsed: [1]
        })
      })
    });

    const text = toPlainText(maintained.body);
    expect(text).toContain('Run locally');
    expect(text).toContain('Architecture');
    expect(text).toContain('Key files');
    expect(text).toContain('Tests and deploy');
    expect(text).toContain('npm run start');
    expect(text).toContain('npm run wiki:qa');
    expect(text).toContain('server/server.js');
    expect(text).not.toMatch(/will appear after the first GitHub sync/i);
    expect(text).not.toMatch(/Noeis will maintain this as a developer dossier/i);
    expect(maintained.aiState.quality.ok).toBe(true);
    expect(maintained.aiState.quality.fallbackApplied).toBe(true);
  });

  it('extracts repo commands from truncated package.json evidence', () => {
    const result = fallbackMaintenance({
      page: {
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        pageType: 'repo',
        externalWatches: { githubRepo: { owner: 'atsokolas', repo: 'note-taker-3' } }
      },
      candidates: [{
        index: 1,
        type: 'external',
        title: 'atsokolas/note-taker-3 package.json',
        text: 'Path: package.json. { "name": "note-taker-3-1", "scripts": { "start": "node server/server.js", "wiki:qa": "node scripts/wiki_qa.js", "build": "cd note-taker-ui && npm run build"...',
        provider: 'github-repo',
        metadata: { source: 'github-repo', path: 'package.json', evidenceType: 'config', docClass: 'config' }
      }, {
        index: 2,
        type: 'external',
        title: 'atsokolas/note-taker-3 recent commits',
        text: 'recent commits. 14ce289 2026-07-05 - repo wiki agent contract.',
        provider: 'github-repo',
        metadata: { source: 'github-repo', evidenceType: 'recent_commits' }
      }, {
        index: 3,
        type: 'external',
        title: 'atsokolas/note-taker-3 server/server.js',
        text: 'const app = express();',
        provider: 'github-repo',
        metadata: { source: 'github-repo', path: 'server/server.js', evidenceType: 'code', docClass: 'code' }
      }]
    });
    const text = toPlainText(docFromArticle({
      title: result.title,
      article: result.article
    }));

    expect(text).toContain('npm run start');
    expect(text).toContain('npm run wiki:qa');
    expect(text).toContain('npm run build');
    expect(text).toContain('Recent commit evidence is attached');
  });

  it('keeps mandatory repo evidence even when the model under-cites sources', () => {
    const indexes = normalizeSourceIndexesUsed({
      page: {
        pageType: 'repo',
        externalWatches: { githubRepo: { owner: 'atsokolas', repo: 'note-taker-3' } }
      },
      rawIndexes: [1],
      article: {
        summary: { text: 'Short repo summary.', citationIndexes: [1] },
        sections: []
      },
      changelog: [],
      candidates: [{
        index: 1,
        title: 'atsokolas/note-taker-3 package.json',
        provider: 'github-repo',
        metadata: { source: 'github-repo', path: 'package.json', evidenceType: 'config' }
      }, {
        index: 2,
        title: 'atsokolas/note-taker-3 README.md',
        provider: 'github-repo',
        metadata: { source: 'github-repo', path: 'README.md', evidenceType: 'document' }
      }, {
        index: 3,
        title: 'atsokolas/note-taker-3 server/server.js',
        provider: 'github-repo',
        metadata: { source: 'github-repo', path: 'server/server.js', evidenceType: 'code' }
      }, {
        index: 4,
        title: 'atsokolas/note-taker-3 recent commits',
        provider: 'github-repo',
        metadata: { source: 'github-repo', evidenceType: 'recent_commits' }
      }]
    });

    expect(indexes).toEqual(expect.arrayContaining([1, 3, 4]));
  });

  it('infers GitHub-backed pages as repo pages during maintenance', () => {
    expect(inferMaintainedPageType({
      page: {
        pageType: 'project',
        externalWatches: { githubRepo: { owner: 'atsokolas', repo: 'note-taker-3' } }
      },
      candidates: []
    })).toBe('repo');
  });

  it('fails unsupported generic claims on GitHub repo pages', () => {
    const body = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Packaged as an npm module, the project is provenance-aware and published to npm for reuse.'
          }]
        }
      ]
    };

    const quality = evaluateWikiArticleQuality({
      page: {
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        createdFrom: { text: 'https://github.com/atsokolas/note-taker-3' }
      },
      body,
      claims: [],
      sourceRefs: [{
        title: 'atsokolas/note-taker-3 README.md',
        snippet: 'Repository documentation source. Path: README.md. Modern JavaScript SPA for quick note capture.',
        metadata: { source: 'github-repo' }
      }]
    });

    expect(quality.ok).toBe(false);
    expect(quality.failures.join(' ')).toMatch(/unsupported npm distribution claim/i);
    expect(quality.failures.join(' ')).toMatch(/unsupported provenance boilerplate/i);
  });

  it('fails GitHub repo pages that read like stale roadmap notes instead of developer dossiers', () => {
    const body = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'The repo is a product roadmap with June 2026 QA sweeps, an Evernote OAuth spike, and public npm packaging work.'
          }]
        }
      ]
    };

    const quality = evaluateWikiArticleQuality({
      page: {
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        createdFrom: { text: 'https://github.com/atsokolas/note-taker-3' }
      },
      body,
      claims: [],
      sourceRefs: [{
        title: 'atsokolas/note-taker-3 README.md',
        snippet: 'Repository developer evidence source. Path: README.md. Product overview.',
        metadata: { source: 'github-repo', evidenceType: 'document', path: 'README.md' }
      }, {
        title: 'atsokolas/note-taker-3 docs/full-qa-sweep-2026-06-06.md',
        snippet: 'Repository developer evidence source. Path: docs/full-qa-sweep-2026-06-06.md.',
        metadata: { source: 'github-repo', evidenceType: 'document', path: 'docs/full-qa-sweep-2026-06-06.md' }
      }]
    });

    expect(quality.ok).toBe(false);
    expect(quality.failures.join(' ')).toMatch(/developer-dossier sections/i);
    expect(quality.failures.join(' ')).toMatch(/local run or test commands/i);
    expect(quality.failures.join(' ')).toMatch(/code\/config evidence/i);
    expect(quality.failures.join(' ')).toMatch(/stale planning or QA history/i);
  });

  it('treats pageType repo as a GitHub repo page and rejects invented current-work claims', () => {
    const failures = findGitHubRepoDeveloperDossierFailures({
      page: {
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        pageType: 'repo'
      },
      text: [
        'Summary: Noeis is a JavaScript SPA backed by Express and MongoDB.',
        'Run locally: use npm install and npm start.',
        'Architecture: server/server.js handles API routes and note-taker-ui/src/App.js owns the frontend.',
        'Key files: package.json, server/server.js, note-taker-ui/src/App.js.',
        'Tests and deploy: use npm run build.',
        'Current active work: current development efforts focus on backend performance and tasks are tracked in the issue tracker.',
        'How to extend: add routes or frontend components.',
        'Known risks: deployment documentation is limited.'
      ].join('\n\n'),
      sourceRefs: [{
        title: 'atsokolas/note-taker-3 package.json',
        snippet: 'Path: package.json. "scripts": {"start":"node server/server.js","build":"cd note-taker-ui && npm run build"}',
        metadata: { source: 'github-repo', evidenceType: 'config', path: 'package.json' }
      }, {
        title: 'atsokolas/note-taker-3 server/server.js',
        snippet: 'Path: server/server.js. const app = express();',
        metadata: { source: 'github-repo', evidenceType: 'code', path: 'server/server.js' }
      }, {
        title: 'atsokolas/note-taker-3 note-taker-ui/src/App.js',
        snippet: 'Path: note-taker-ui/src/App.js. React app routes.',
        metadata: { source: 'github-repo', evidenceType: 'code', path: 'note-taker-ui/src/App.js' }
      }]
    });

    expect(failures.join(' ')).toMatch(/current active-work signals/i);
  });

  it('rejects vague repo dossiers that avoid exact paths and scripts from evidence', () => {
    const failures = findGitHubRepoDeveloperDossierFailures({
      page: {
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        pageType: 'repo'
      },
      text: [
        'Summary: This repository provides a modern note-taking solution.',
        'Run locally: use npm install and npm start to launch the application.',
        'Architecture: the server handles API requests and the frontend communicates with REST APIs.',
        'Key files: important files include server.js and various route files.',
        'Tests and deploy: the repository includes a testing framework, although specific test files and deployment scripts are not detailed.',
        'Current active work: ongoing development focuses on enhancing user experience and expanding functionality.',
        'How to extend: add new routes in the server or frontend components.',
        'Known risks: data handling and user authentication need care.'
      ].join('\n\n'),
      sourceRefs: [{
        title: 'atsokolas/note-taker-3 package.json',
        snippet: 'Path: package.json. "scripts": {"start":"node server/server.js","wiki:qa":"node scripts/wiki_qa.js","build":"cd note-taker-ui && npm run build"}',
        metadata: { source: 'github-repo', evidenceType: 'config', path: 'package.json' }
      }, {
        title: 'atsokolas/note-taker-3 server/server.js',
        snippet: 'Path: server/server.js. const app = express();',
        metadata: { source: 'github-repo', evidenceType: 'code', path: 'server/server.js' }
      }, {
        title: 'atsokolas/note-taker-3 note-taker-ui/src/App.js',
        snippet: 'Path: note-taker-ui/src/App.js. React app routes.',
        metadata: { source: 'github-repo', evidenceType: 'code', path: 'note-taker-ui/src/App.js' }
      }, {
        title: 'atsokolas/note-taker-3 .github/workflows/agent-harness-regression.yml',
        snippet: 'Path: .github/workflows/agent-harness-regression.yml.',
        metadata: { source: 'github-repo', evidenceType: 'config', path: '.github/workflows/agent-harness-regression.yml' }
      }]
    });

    expect(failures.join(' ')).toMatch(/concrete file paths/i);
    expect(failures.join(' ')).toMatch(/package scripts/i);
    expect(failures.join(' ')).toMatch(/current active-work signals/i);
  });

  it('fails unsupported testing-framework claims on GitHub repo pages', () => {
    const failures = findUnsupportedGitHubRepoClaims({
      page: {
        title: 'Note-Taker-3 Repo Wiki',
        pageType: 'repo'
      },
      text: 'The repository includes a testing framework.',
      sourceRefs: [{
        title: 'atsokolas/note-taker-3 README.md',
        snippet: 'Path: README.md. Product overview.',
        metadata: { source: 'github-repo', evidenceType: 'document', path: 'README.md' }
      }]
    });

    expect(failures.join(' ')).toMatch(/testing framework claim/i);
  });

  it('passes GitHub repo developer dossier checks with code, config, commands, and current work', () => {
    const failures = findGitHubRepoDeveloperDossierFailures({
      page: {
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        createdFrom: { text: 'https://github.com/atsokolas/note-taker-3' }
      },
      text: [
        'Summary: Noeis is a React and Express knowledge workspace.',
        'Run locally: run npm start at the repo root and npm run build in note-taker-ui.',
        'Architecture: server/server.js hosts the API and note-taker-ui/src/App.js owns the client shell.',
        'Key files: server/routes/wikiRoutes.js, server/services/wikiMaintenanceService.js, and note-taker-ui/src/utils/wikiCreate.js.',
        'Tests and deploy: npm run wiki:qa covers the wiki path and Vercel/Render ship the app.',
        'Current active work: recent commits are focused on repo wiki grounding.',
        'How to extend: add a route, service, model, focused test, and browser proof.',
        'Known risks: watcher source selection must avoid stale planning docs.'
      ].join('\n\n'),
      sourceRefs: [{
        title: 'atsokolas/note-taker-3 package.json',
        snippet: 'Path: package.json. "scripts": {"start":"node server/server.js","wiki:qa":"node scripts/wiki_qa.js"}',
        metadata: { source: 'github-repo', evidenceType: 'config', path: 'package.json' }
      }, {
        title: 'atsokolas/note-taker-3 server/server.js',
        snippet: 'Path: server/server.js. const app = express();',
        metadata: { source: 'github-repo', evidenceType: 'code', path: 'server/server.js' }
      }, {
        title: 'atsokolas/note-taker-3 note-taker-ui/src/App.js',
        snippet: 'Path: note-taker-ui/src/App.js. React app routes.',
        metadata: { source: 'github-repo', evidenceType: 'code', path: 'note-taker-ui/src/App.js' }
      }, {
        title: 'atsokolas/note-taker-3 recent commits',
        snippet: 'recent commits. 795f0da 2026-07-05 - fix repo provenance boilerplate variants.',
        metadata: { source: 'github-repo', evidenceType: 'recent_commits' }
      }]
    });

    expect(failures).toEqual([]);
  });

  it('allows repo distribution wording when the repository evidence explicitly supports it', () => {
    const failures = findUnsupportedGitHubRepoClaims({
      page: {
        title: 'Package Repo Wiki',
        createdFrom: { text: 'https://github.com/example/package' }
      },
      text: 'The README says the package is published to npm.',
      sourceRefs: [{
        title: 'example/package README.md',
        snippet: 'Install from npm with npm install @example/package. Published to npm for library consumers.',
        metadata: { source: 'github-repo' }
      }]
    });

    expect(failures).toEqual([]);
  });

  it('catches unicode-hyphen provenance boilerplate on repo pages', () => {
    const failures = findUnsupportedGitHubRepoClaims({
      page: {
        title: 'Note-Taker-3 Repo Wiki',
        createdFrom: { text: 'https://github.com/atsokolas/note-taker-3' }
      },
      text: 'Provenance‑aware analysis treats the repository as a testbed.',
      sourceRefs: [{
        title: 'atsokolas/note-taker-3 README.md',
        snippet: 'Repository documentation source. Path: README.md.',
        metadata: { source: 'github-repo' }
      }]
    });

    expect(failures.join(' ')).toMatch(/unsupported provenance boilerplate/i);
  });

  it('formats known pages for prompt-time wiki references', () => {
    expect(formatKnownWikiPages([
      { id: 'page-1', title: 'Cash Flow Valuation', pageType: 'concept', summary: 'Valuing assets from owner cash flows.' }
    ])).toContain('Cash Flow Valuation (concept) — Valuing assets from owner cash flows.');
  });

  it('keeps a small evidence bundle for sparse pages instead of starving maintenance context', () => {
    const candidates = selectCandidateSources({
      page: {
        title: 'Complementary Machines and Human Capability',
        plainText: '',
        sourceRefs: []
      },
      sources: [
        {
          type: 'article',
          objectId: 'world-models',
          title: 'World Models',
          text: 'World-model agents predict future environment states before acting.',
          updatedAt: new Date('2026-05-09T12:00:00.000Z')
        },
        {
          type: 'article',
          objectId: 'complementary-machines',
          title: 'Complementary Machines',
          text: 'Complementary machines extend human capability on dangerous or tedious tasks.',
          updatedAt: new Date('2026-05-08T12:00:00.000Z')
        },
        {
          type: 'article',
          objectId: 'agent-limits',
          title: 'Limits of Autonomous Agents',
          text: 'Deployment depends on alignment, governance, and robust evaluation.',
          updatedAt: new Date('2026-05-07T12:00:00.000Z')
        }
      ]
    });

    expect(candidates).toHaveLength(3);
    expect(candidates[0].objectId).toBe('complementary-machines');
    expect(candidates.map(source => source.objectId).sort()).toEqual([
      'agent-limits',
      'complementary-machines',
      'world-models'
    ]);
  });

  it('wraps article summary text in a claim mark with citation indexes', () => {
    const doc = docFromArticle({
      title: 'Compounding interest',
      article: {
        summary: { text: 'Compounders need patience.', citationIndexes: [1, 2] },
        sections: []
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks).toHaveLength(1);
    expect(marks[0].text).toBe('Compounders need patience.');
    expect(marks[0].attrs.citationIndexes).toEqual([1, 2]);
    expect(marks[0].attrs.support).toBe('supported');
    expect(marks[0].attrs.claimId).toMatch(/^claim-/);
  });

  it('infers "partial" support when only one citation is attached', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'A claim with one source.', citationIndexes: [1] }
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks[0].attrs.support).toBe('partial');
  });

  it('infers "unsupported" when no citations are attached', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'A bare claim.', citationIndexes: [] }
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks[0].attrs.support).toBe('unsupported');
  });

  it('emits claim marks for each section paragraph', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        sections: [
          {
            heading: 'Core Idea',
            paragraphs: [
              { text: 'First claim.', citationIndexes: [1] },
              { text: 'Second claim.', citationIndexes: [2, 3] }
            ]
          }
        ]
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks).toHaveLength(2);
    expect(marks[0].text).toBe('First claim.');
    expect(marks[0].attrs.support).toBe('partial');
    expect(marks[1].text).toBe('Second claim.');
    expect(marks[1].attrs.support).toBe('supported');
  });

  it('emits claim marks for bullet items with their own citation indexes', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        sections: [
          {
            heading: 'Signals',
            paragraphs: [],
            bullets: [
              { text: 'A bullet point.', citationIndexes: [1] }
            ]
          }
        ]
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks.find(m => m.text === 'A bullet point.')?.attrs.citationIndexes).toEqual([1]);
  });

  it('emits contradiction indexes on conflicted claim marks without putting them in prose', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: {
          text: 'A claim with mixed evidence.',
          citationIndexes: [1],
          contradictionIndexes: [2],
          support: 'conflicted'
        }
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks[0].attrs).toMatchObject({
      citationIndexes: [1],
      contradictionIndexes: [2],
      support: 'conflicted'
    });
    expect(marks[0].text).not.toMatch(/\[2\]/);
  });

  it('does not append the legacy "[1, 2]" suffix into the claim text', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'Clean claim text.', citationIndexes: [1, 2] }
      }
    });
    const marks = findClaimMarks(doc);
    expect(marks[0].text).not.toMatch(/\[/);
  });

  it('gives each emitted claim a unique claimId', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'A.', citationIndexes: [1] },
        sections: [
          { heading: 'Section', paragraphs: [{ text: 'B.', citationIndexes: [1] }] }
        ]
      }
    });
    const marks = findClaimMarks(doc);
    const ids = marks.map(m => m.attrs.claimId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fills canonical question sections before rendering', () => {
    const { alignArticleToPageStructure } = require('./wikiPageStructureService');
    const article = alignArticleToPageStructure({
      pageType: 'question',
      article: {
        summary: { text: 'Short answer text.', citationIndexes: [1] },
        sections: [{ heading: 'Evidence', paragraphs: [{ text: 'Evidence text.', citationIndexes: [1] }] }]
      }
    });
    const doc = docFromArticle({ title: 'Why compound?', article });
    expect(headings(doc).slice(0, 5)).toEqual([
      'Short Answer',
      'Why It Matters',
      'Evidence',
      'What Would Change This',
      'Open Questions'
    ]);
  });

  it('extracts citation indexes from claim marks before persistence', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'Claim with two sources.', citationIndexes: [1, 2] }
      }
    });
    const claims = collectClaimsFromDoc(doc);
    expect(claims[0].citationIndexes).toEqual([1, 2]);
  });

  it('extracts contradiction indexes from claim marks before persistence', () => {
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: {
          text: 'Claim with a counter-source.',
          citationIndexes: [1],
          contradictionIndexes: [2],
          support: 'conflicted'
        }
      }
    });
    const claims = collectClaimsFromDoc(doc);
    expect(claims[0].citationIndexes).toEqual([1]);
    expect(claims[0].contradictionIndexes).toEqual([2]);
    expect(claims[0].support).toBe('conflicted');
  });

  it('maps claim citation indexes to persisted citation ids', () => {
    const citationIds = resolveClaimCitationIds({
      citationIndexes: [2, 1, 2, 99],
      citations: [
        { _id: 'citation-a', sourceRefId: 'source-a' },
        { _id: 'citation-b', sourceRefId: 'source-b' }
      ],
      sourceRefs: [
        { _id: 'source-a' },
        { _id: 'source-b' }
      ]
    });
    expect(citationIds).toEqual(['citation-b', 'citation-a']);
  });

  it('ignores invalid and out-of-range citation indexes', () => {
    const citationIds = resolveClaimCitationIds({
      citationIndexes: [0, -1, 'bad', 2, 9],
      citations: [{ _id: 'citation-a' }, { _id: 'citation-b' }],
      sourceRefs: [{ _id: 'source-a' }, { _id: 'source-b' }]
    });
    expect(citationIds).toEqual(['citation-b']);
  });

  it('attaches citation ids and removes transient citation indexes from claims', () => {
    const claims = attachClaimCitationIds({
      claims: [{
        claimId: 'claim-1',
        text: 'A claim.',
        support: 'supported',
        citationIndexes: [1]
      }],
      citations: [{ _id: 'citation-a', sourceRefId: 'source-a' }],
      sourceRefs: [{ _id: 'source-a' }]
    });
    expect(claims[0].citationIds).toEqual(['citation-a']);
    expect(claims[0].sourceRefIds).toEqual(['source-a']);
    expect(claims[0].confidence).toBeGreaterThan(0.45);
    expect(claims[0].citationIndexes).toBeUndefined();
  });

  it('normalizes frontend contradicted support to backend conflicted support', () => {
    const claims = attachClaimCitationIds({
      claims: [{
        claimId: 'claim-1',
        text: 'A disputed claim.',
        support: 'contradicted',
        citationIndexes: []
      }]
    });
    expect(claims[0].support).toBe('conflicted');
  });

  it('maps contradiction indexes separately from supporting citation ids', () => {
    const claims = attachClaimCitationIds({
      claims: [{
        claimId: 'claim-1',
        text: 'A mixed evidence claim.',
        support: 'conflicted',
        citationIndexes: [1],
        contradictionIndexes: [2]
      }],
      citations: [
        { _id: 'citation-a', sourceRefId: 'source-a' },
        { _id: 'citation-b', sourceRefId: 'source-b' }
      ],
      sourceRefs: [{ _id: 'source-a' }, { _id: 'source-b' }]
    });
    expect(claims[0].citationIds).toEqual(['citation-a']);
    expect(claims[0].sourceRefIds).toEqual(['source-a']);
    expect(claims[0].contradictedByCitationIds).toEqual(['citation-b']);
  });

  it('keeps legacy conflicted claims as contradictory when no contradiction indexes exist', () => {
    const claims = attachClaimCitationIds({
      claims: [{
        claimId: 'claim-legacy',
        text: 'Legacy conflicted claim.',
        support: 'conflicted',
        citationIndexes: [1]
      }],
      citations: [{ _id: 'citation-a', sourceRefId: 'source-a' }],
      sourceRefs: [{ _id: 'source-a' }]
    });
    expect(claims[0].contradictedByCitationIds).toEqual(['citation-a']);
  });

  it('derives ledger claims with confidence, verification time, and source refs', () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'A well sourced claim.', citationIndexes: [1, 2] }
      }
    });
    const claims = deriveClaimsFromDoc({
      body: doc,
      citations: [
        { _id: 'citation-a', sourceRefId: 'source-a' },
        { _id: 'citation-b', sourceRefId: 'source-b' }
      ],
      sourceRefs: [{ _id: 'source-a' }, { _id: 'source-b' }],
      now
    });

    expect(claims[0]).toMatchObject({
      text: 'A well sourced claim.',
      support: 'supported',
      citationIds: ['citation-a', 'citation-b'],
      sourceRefIds: ['source-a', 'source-b']
    });
    expect(claims[0].confidence).toBeGreaterThanOrEqual(0.8);
    expect(claims[0].lastReviewedAt).toEqual(now);
    expect(claims[0].lastVerifiedAt).toEqual(now);
    expect(claims[0].history[0].event).toBe('created');
  });

  it('derives mixed support and contradiction evidence into the claim ledger', () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: {
          text: 'A mixed evidence claim.',
          citationIndexes: [1],
          contradictionIndexes: [2],
          support: 'conflicted'
        }
      }
    });
    const claims = deriveClaimsFromDoc({
      body: doc,
      citations: [
        { _id: 'citation-a', sourceRefId: 'source-a' },
        { _id: 'citation-b', sourceRefId: 'source-b' }
      ],
      sourceRefs: [{ _id: 'source-a' }, { _id: 'source-b' }],
      now
    });
    expect(claims[0]).toMatchObject({
      support: 'conflicted',
      citationIds: ['citation-a'],
      sourceRefIds: ['source-a'],
      contradictedByCitationIds: ['citation-b']
    });
  });

  it('counts contradiction-only sources as used source indexes', () => {
    const used = normalizeSourceIndexesUsed({
      rawIndexes: [],
      article: {
        summary: { text: 'Summary', citationIndexes: [], contradictionIndexes: [2] },
        sections: [{
          heading: 'Evidence',
          paragraphs: [{ text: 'Paragraph', citationIndexes: [1], contradictionIndexes: [3] }],
          bullets: []
        }]
      },
      candidates: [{ index: 1 }, { index: 2 }, { index: 3 }]
    });
    expect(used).toEqual([2, 1, 3]);
  });

  it('does not attach arbitrary top sources when the model returns no citation indexes', () => {
    const used = normalizeSourceIndexesUsed({
      rawIndexes: [],
      article: { summary: { text: 'Summary' }, sections: [] },
      candidates: [{ index: 1 }, { index: 2 }, { index: 3 }]
    });
    expect(used).toEqual([]);
  });

  it('filters source candidates by topical relevance before recency bonuses', () => {
    const candidates = selectCandidateSources({
      page: { title: 'Cash flow valuation', plainText: 'discounted cash flow intrinsic value' },
      sources: [
        {
          title: 'Fresh unrelated note',
          text: 'A recent note about cooking and travel.',
          type: 'highlight',
          updatedAt: new Date().toISOString()
        },
        {
          title: 'Discounted cash flow memo',
          text: 'Intrinsic value and cash flow valuation process.',
          type: 'article',
          updatedAt: '2025-01-01T00:00:00.000Z'
        }
      ]
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe('Discounted cash flow memo');
  });

  it('adds one adjacent source when a maintenance page has a nearly complete evidence bundle', () => {
    const candidates = selectCandidateSources({
      page: {
        title: 'Capital Allocation',
        plainText: 'Old capital allocation note that overstates buybacks.'
      },
      sources: [
        {
          title: 'Reinvestment returns and capital allocation',
          text: 'Capital allocation compares reinvestment returns with alternatives.',
          type: 'article',
          updatedAt: '2026-05-09T00:00:00.000Z'
        },
        {
          title: 'Buyback discipline',
          text: 'Buybacks create value when shares trade below intrinsic value.',
          type: 'article',
          updatedAt: '2026-05-08T00:00:00.000Z'
        },
        {
          title: 'Dividend counterpoint',
          text: 'Dividends can be superior when reinvestment opportunities are weak.',
          type: 'article',
          updatedAt: '2026-05-07T00:00:00.000Z'
        }
      ]
    });

    expect(candidates).toHaveLength(3);
    expect(candidates.map(source => source.title)).toContain('Dividend counterpoint');
  });

  it('preserves claim history across regenerated claim ids by matching claim text', () => {
    const createdAt = new Date('2026-05-01T00:00:00.000Z');
    const now = new Date('2026-05-09T12:00:00.000Z');
    const doc = docFromArticle({
      title: 'X',
      article: {
        summary: { text: 'Durable claim text.', citationIndexes: [1, 2] }
      }
    });
    const previousClaims = [{
      claimId: 'old-claim-id',
      text: 'Durable claim text.',
      section: 'X',
      support: 'partial',
      citationIds: ['citation-a'],
      sourceRefIds: ['source-a'],
      confidence: 0.54,
      createdAt,
      history: [{
        at: createdAt,
        event: 'created',
        support: 'partial',
        text: 'Durable claim text.',
        section: 'X',
        citationIds: ['citation-a'],
        sourceRefIds: ['source-a'],
        summary: 'Original claim.'
      }]
    }];

    const claims = deriveClaimsFromDoc({
      body: doc,
      citations: [
        { _id: 'citation-a', sourceRefId: 'source-a' },
        { _id: 'citation-b', sourceRefId: 'source-b' }
      ],
      sourceRefs: [{ _id: 'source-a' }, { _id: 'source-b' }],
      previousClaims,
      now
    });

    expect(claims[0].claimId).not.toBe('old-claim-id');
    expect(claims[0].createdAt).toEqual(createdAt);
    expect(claims[0].history.map(entry => entry.event)).toEqual(['created', 'updated']);
    expect(claims[0].history[1].support).toBe('supported');
  });

  it('builds section-level maintenance state from the claim ledger and health signals', () => {
    const now = new Date('2026-05-09T12:00:00.000Z');
    const plan = buildSectionMaintenancePlan({
      now,
      claims: [
        { section: 'Core Idea', support: 'supported', confidence: 0.9, lastReviewedAt: now },
        { section: 'Core Idea', support: 'unsupported', confidence: 0.1, lastReviewedAt: now },
        { section: 'Evidence', support: 'conflicted', confidence: 0.3, lastReviewedAt: now }
      ],
      health: {
        missingCitations: [{ text: 'Needs a citation.', section: 'Core Idea' }],
        contradictions: [{ text: 'Source disagrees.', section: 'Evidence' }]
      },
      changeLog: [{ type: 'flagged_gap', target: 'Core Idea', summary: 'Marked a gap.' }]
    });

    expect(plan.updatedAt).toEqual(now);
    expect(plan.sections[0]).toMatchObject({
      section: 'Evidence',
      totalClaims: 1,
      conflictedClaims: 1
    });
    const core = plan.sections.find(section => section.section === 'Core Idea');
    expect(core).toMatchObject({
      totalClaims: 2,
      supportedClaims: 1,
      unsupportedClaims: 1,
      averageConfidence: 0.5
    });
    expect(core.actions.map(action => action.type)).toContain('missingCitations');
  });

  it('fails scaffold-like, thin articles so they can be rebuilt', () => {
    const body = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Investing' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'The page should explain investing.' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Evidence' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Evidence still needs source-backed development.' }] }
      ]
    };

    const quality = evaluateWikiArticleQuality({
      page: { title: 'Investing' },
      body,
      claims: [
        { support: 'unsupported', citationIds: [] },
        { support: 'partial', citationIds: [] },
        { support: 'unsupported', citationIds: [] },
        { support: 'partial', citationIds: [] },
        { support: 'unsupported', citationIds: [] },
        { support: 'partial', citationIds: [] }
      ],
      sourceRefs: Array.from({ length: 8 }, (_, index) => ({ _id: `source-${index}` }))
    });

    expect(quality.ok).toBe(false);
    expect(quality.status).toBe('needs_rebuild');
    expect(quality.failures.join(' ')).toMatch(/scaffold|too thin|weak/i);
  });

  it('migrates broad legacy topic pages to overview during maintenance', () => {
    expect(inferMaintainedPageType({
      page: { pageType: 'topic', title: 'Investing - Concepts, Ideas, and Strategies' },
      candidates: Array.from({ length: 6 }, (_, index) => ({ index }))
    })).toBe('overview');
    expect(inferMaintainedPageType({
      page: { pageType: 'topic', title: 'Feedback Loops' },
      candidates: []
    })).toBe('concept');
    expect(inferMaintainedPageType({
      page: { pageType: 'topic', title: 'Imported memo', createdFrom: { type: 'article' } },
      candidates: []
    })).toBe('source');
  });

  it('resolves known page title occurrences into wikiLink marks after maintenance drafts the body', async () => {
    const page = {
      _id: 'page-main',
      title: 'Investment Notes',
      pageType: 'topic',
      plainText: '',
      body: { type: 'doc', content: [] },
      sourceRefs: [],
      claims: [],
      aiState: {}
    };

    const chat = jest.fn().mockResolvedValue({
      model: 'test-model',
      provider: 'test-provider',
      text: JSON.stringify({
        title: 'Investment Notes',
        article: {
          summary: {
            text: 'Compounding interest rewards patience over long horizons.',
            citationIndexes: [1]
          },
          sections: []
        },
        maintenance: {
          summary: 'Drafted page.',
          changelog: [],
          health: {}
        },
        sourceIndexesUsed: [1]
      })
    });

    const { maintainWikiPage } = require('./wikiMaintenanceService');
    await maintainWikiPage({
      page,
      userId: 'user-1',
      chat,
      isConfigured: () => true,
      models: {
        Article: fakeFindModel([{ _id: 'article-1', title: 'Evidence', content: 'Evidence about investing.' }]),
        NotebookEntry: fakeFindModel([]),
        TagMeta: fakeFindModel([]),
        Question: fakeFindModel([]),
        WikiPage: fakeFindModel([
          { _id: 'page-main', title: 'Investment Notes', status: 'draft' },
          { _id: 'page-target', title: 'Compounding interest', status: 'draft' }
        ])
      }
    });

    const links = findWikiLinkMarks(page.body);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      text: 'Compounding interest',
      attrs: {
        pageId: 'page-target',
        title: 'Compounding interest'
      }
    });
  });

  it('resolves conservative near-title variants into wikiLink marks after maintenance drafts the body', async () => {
    const page = {
      _id: 'page-main',
      title: 'Investment Notes',
      pageType: 'topic',
      plainText: '',
      body: { type: 'doc', content: [] },
      sourceRefs: [],
      claims: [],
      aiState: {}
    };

    const chat = jest.fn().mockResolvedValue({
      model: 'test-model',
      provider: 'test-provider',
      text: JSON.stringify({
        title: 'Investment Notes',
        article: {
          summary: {
            text: 'Cash-flow valuations make growth assumptions explicit.',
            citationIndexes: [1]
          },
          sections: []
        },
        maintenance: {
          summary: 'Drafted page.',
          changelog: [],
          health: {}
        },
        sourceIndexesUsed: [1]
      })
    });

    const { maintainWikiPage } = require('./wikiMaintenanceService');
    await maintainWikiPage({
      page,
      userId: 'user-1',
      chat,
      isConfigured: () => true,
      models: {
        Article: fakeFindModel([{ _id: 'article-1', title: 'Evidence', content: 'Evidence about investing.' }]),
        NotebookEntry: fakeFindModel([]),
        TagMeta: fakeFindModel([]),
        Question: fakeFindModel([]),
        WikiPage: fakeFindModel([
          { _id: 'page-main', title: 'Investment Notes', status: 'draft' },
          { _id: 'page-target', title: 'Cash Flow Valuation', status: 'draft' }
        ])
      }
    });

    const links = findWikiLinkMarks(page.body);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      text: 'Cash-flow valuations',
      attrs: {
        pageId: 'page-target',
        title: 'Cash Flow Valuation'
      }
    });
  });

  it('drops stale page sources that are not cited by the current maintenance rebuild', async () => {
    const page = {
      _id: 'page-main',
      title: 'Investing',
      pageType: 'overview',
      plainText: '',
      body: { type: 'doc', content: [] },
      sourceRefs: [
        { type: 'article', objectId: 'stale-article', title: 'Flounder Mode', snippet: 'An unrelated retained source.' }
      ],
      claims: [],
      aiState: {}
    };

    const chat = jest.fn().mockResolvedValue({
      model: 'test-model',
      provider: 'test-provider',
      text: JSON.stringify({
        title: 'Investing',
        article: {
          summary: {
            text: 'Investing starts with cash-flow discipline and explicit risk checks.',
            citationIndexes: [1]
          },
          sections: [{
            heading: 'Overview',
            paragraphs: [{
              text: 'The maintained page should only carry sources that the rebuild actually cites.',
              citationIndexes: [1]
            }],
            bullets: []
          }]
        },
        maintenance: { summary: 'Rebuilt page.', changelog: [], health: {} },
        sourceIndexesUsed: [1]
      })
    });

    const { maintainWikiPage } = require('./wikiMaintenanceService');
    await maintainWikiPage({
      page,
      userId: 'user-1',
      chat,
      isConfigured: () => true,
      models: {
        Article: fakeFindModel([{ _id: 'article-1', title: 'Investing cash-flow evidence', content: 'Investing starts with cash-flow discipline and explicit risk checks.' }]),
        NotebookEntry: fakeFindModel([]),
        TagMeta: fakeFindModel([]),
        Question: fakeFindModel([]),
        WikiPage: fakeFindModel([])
      }
    });

    expect(page.sourceRefs).toHaveLength(1);
    expect(page.sourceRefs[0].objectId).toBe('article-1');
    expect(page.sourceRefs.map(source => source.title)).not.toContain('Flounder Mode');
  });

  it('automatically rebuilds once when the first maintenance draft fails quality gates', async () => {
    const page = {
      _id: 'page-main',
      title: 'Investment Process',
      pageType: 'topic',
      plainText: '',
      body: { type: 'doc', content: [] },
      sourceRefs: [],
      claims: [],
      aiState: {}
    };

    const chat = jest.fn()
      .mockResolvedValueOnce({
        model: 'test-model',
        provider: 'test-provider',
        text: JSON.stringify({
          title: 'Investment Process',
          article: {
            summary: {
              text: 'The page should explain investing process.',
              citationIndexes: [1]
            },
            sections: []
          },
          maintenance: { summary: 'Drafted weak page.', changelog: [], health: {} },
          sourceIndexesUsed: [1]
        })
      })
      .mockResolvedValueOnce({
        model: 'test-model',
        provider: 'test-provider',
        text: JSON.stringify({
          title: 'Investment Process',
          article: {
            summary: {
              text: 'Investment process matters because rules preserve judgment when markets make patience emotionally expensive.',
              citationIndexes: [1]
            },
            sections: [{
              heading: 'Core Idea',
              paragraphs: [{
                text: 'A useful process narrows attention to business quality, valuation discipline, and the conditions that would prove the thesis wrong.',
                citationIndexes: [1]
              }],
              bullets: []
            }]
          },
          maintenance: { summary: 'Rebuilt into a stronger page.', changelog: [], health: {} },
          sourceIndexesUsed: [1]
        })
      });

    const { maintainWikiPage } = require('./wikiMaintenanceService');
    await maintainWikiPage({
      page,
      userId: 'user-1',
      chat,
      isConfigured: () => true,
      models: {
        Article: fakeFindModel([{ _id: 'article-1', title: 'Process evidence', content: 'Rules preserve judgment when markets make patience emotionally expensive.' }]),
        NotebookEntry: fakeFindModel([]),
        TagMeta: fakeFindModel([]),
        Question: fakeFindModel([]),
        WikiPage: fakeFindModel([])
      }
    });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(page.plainText).toContain('Investment process matters');
    expect(page.plainText).not.toContain('should explain');
    expect(page.aiState.quality.rebuiltAutomatically).toBe(true);
    expect(page.aiState.quality.previousFailures.join(' ')).toMatch(/scaffold/i);
  });

  it('defers the quality rebuild in fast onboarding profile', async () => {
    const page = {
      _id: 'page-main',
      title: 'Fast Investment Process',
      pageType: 'topic',
      plainText: '',
      body: { type: 'doc', content: [] },
      sourceRefs: [],
      claims: [],
      aiState: {}
    };
    const progressEvents = [];
    const chat = jest.fn().mockResolvedValue({
      model: 'test-model',
      provider: 'test-provider',
      text: JSON.stringify({
        title: 'Fast Investment Process',
        article: {
          summary: {
            text: 'The page should explain investing process.',
            citationIndexes: [1]
          },
          sections: []
        },
        maintenance: { summary: 'Drafted weak page.', changelog: [], health: {} },
        sourceIndexesUsed: [1]
      })
    });

    const { maintainWikiPage } = require('./wikiMaintenanceService');
    await maintainWikiPage({
      page,
      userId: 'user-1',
      chat,
      isConfigured: () => true,
      maintenanceProfile: 'fast',
      sourceLimit: 8,
      sourceTextLimit: 800,
      skipQualityRebuild: true,
      onProgress: event => progressEvents.push(event),
      models: {
        Article: fakeFindModel([{ _id: 'article-1', title: 'Process evidence', content: 'Rules preserve judgment when markets make patience emotionally expensive.' }]),
        NotebookEntry: fakeFindModel([]),
        TagMeta: fakeFindModel([]),
        Question: fakeFindModel([]),
        WikiPage: fakeFindModel([])
      }
    });

    expect(chat).toHaveBeenCalledTimes(1);
    expect(page.aiState.maintenanceProfile).toBe('fast');
    expect(page.aiState.quality.rebuildDeferred).toBe(true);
    expect(page.aiState.quality.rebuiltAutomatically).toBe(false);
    expect(progressEvents.some(event => event.stage === 'quality_rebuild_deferred')).toBe(true);
  });

  it('streams draft fragments during fast onboarding maintenance', async () => {
    const page = {
      _id: 'page-main',
      title: 'Streaming Investment Process',
      pageType: 'topic',
      plainText: '',
      body: { type: 'doc', content: [] },
      sourceRefs: [],
      claims: [],
      aiState: {}
    };
    const progressEvents = [];
    const chat = jest.fn();
    const streamChat = jest.fn().mockImplementation(async ({ onDelta }) => {
      onDelta?.('{"article":{"summary":{"text":"Investment process turns noisy evidence into a repeatable decision routine."');
      return {
        model: 'test-stream-model',
        provider: 'test-provider',
        text: JSON.stringify({
          title: 'Streaming Investment Process',
          article: {
            summary: {
              text: 'Investment process turns noisy evidence into a repeatable decision routine.',
              citationIndexes: [1]
            },
            sections: []
          },
          maintenance: { summary: 'Streamed draft.', changelog: [], health: {} },
          sourceIndexesUsed: [1]
        })
      };
    });

    const { maintainWikiPage } = require('./wikiMaintenanceService');
    await maintainWikiPage({
      page,
      userId: 'user-1',
      chat,
      streamChat,
      isConfigured: () => true,
      maintenanceProfile: 'fast',
      streamDraft: true,
      skipQualityRebuild: true,
      onProgress: event => progressEvents.push(event),
      models: {
        Article: fakeFindModel([{ _id: 'article-1', title: 'Process evidence', content: 'Investment process turns noisy evidence into a repeatable decision routine.' }]),
        NotebookEntry: fakeFindModel([]),
        TagMeta: fakeFindModel([]),
        Question: fakeFindModel([]),
        WikiPage: fakeFindModel([])
      }
    });

    expect(chat).not.toHaveBeenCalled();
    expect(streamChat).toHaveBeenCalledTimes(1);
    expect(progressEvents.some(event => (
      event.stage === 'model_streaming'
      && /repeatable decision routine/i.test(event.delta || '')
    ))).toBe(true);
    expect(page.aiState.model).toContain('test-stream-model');
  });

  it('falls back to the standard model call when draft streaming is unavailable', async () => {
    const page = {
      _id: 'page-main',
      title: 'Fallback Investment Process',
      pageType: 'topic',
      plainText: '',
      body: { type: 'doc', content: [] },
      sourceRefs: [],
      claims: [],
      aiState: {}
    };
    const progressEvents = [];
    const streamChat = jest.fn().mockRejectedValue(new Error('stream unsupported'));
    const chat = jest.fn().mockResolvedValue({
      model: 'test-blocking-model',
      provider: 'test-provider',
      text: JSON.stringify({
        title: 'Fallback Investment Process',
        article: {
          summary: {
            text: 'Fallback drafting keeps the page source-backed when streaming is unavailable.',
            citationIndexes: [1]
          },
          sections: []
        },
        maintenance: { summary: 'Drafted after stream fallback.', changelog: [], health: {} },
        sourceIndexesUsed: [1]
      })
    });

    const { maintainWikiPage } = require('./wikiMaintenanceService');
    await maintainWikiPage({
      page,
      userId: 'user-1',
      chat,
      streamChat,
      isConfigured: () => true,
      maintenanceProfile: 'fast',
      streamDraft: true,
      skipQualityRebuild: true,
      onProgress: event => progressEvents.push(event),
      models: {
        Article: fakeFindModel([{ _id: 'article-1', title: 'Process evidence', content: 'Fallback drafting keeps the page source-backed when streaming is unavailable.' }]),
        NotebookEntry: fakeFindModel([]),
        TagMeta: fakeFindModel([]),
        Question: fakeFindModel([]),
        WikiPage: fakeFindModel([])
      }
    });

    expect(streamChat).toHaveBeenCalledTimes(1);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(progressEvents.some(event => event.stage === 'model_stream_fallback')).toBe(true);
    expect(page.aiState.model).toContain('test-blocking-model');
    expect(page.aiState.maintenanceSummary).toBe('Drafted after stream fallback.');
  });
});
