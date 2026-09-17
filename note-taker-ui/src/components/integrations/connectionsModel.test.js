import {
  createConnectionHandoff,
  projectAgentGrant,
  projectConnectionActivity,
  projectSourceConnection
} from './connectionsModel';

describe('Connections production model', () => {
  it('keeps authorization, import, and search readiness independent', () => {
    expect(projectSourceConnection({
      provider: 'readwise',
      connection: {
        id: 'readwise-1',
        provider: 'readwise',
        accountLabel: 'Reader',
        status: 'connected',
        health: 'healthy',
        lastValidatedAt: '2026-09-17T10:00:00.000Z',
        lastSyncAt: '2026-09-17T10:04:00.000Z',
        lastSyncResult: {
          importedArticles: 3,
          importedHighlights: 12,
          indexingFailures: 1
        }
      }
    })).toEqual(expect.objectContaining({
      id: 'readwise-1',
      label: 'Reader',
      access: 'connected',
      importState: 'partial',
      searchState: 'needs_retry',
      stateLabel: 'Saved · search needs a retry',
      nextAction: 'Review import'
    }));
  });

  it('does not infer current access from a historical import', () => {
    const projected = projectSourceConnection({
      provider: 'notion',
      connection: {
        id: 'notion-1',
        provider: 'notion',
        accountLabel: 'Product HQ',
        status: 'revoked',
        health: 'error',
        lastSyncAt: '2026-09-10T09:18:00.000Z',
        lastSyncResult: { importedNotes: 6 }
      }
    });

    expect(projected.access).toBe('revoked');
    expect(projected.importState).toBe('saved_history');
    expect(projected.stateLabel).toBe('Access revoked');
    expect(projected.detail).toMatch(/6 saved notes remain/i);
    expect(projected.nextAction).toBe('Reconnect');
  });

  it('projects zero-change activity as a successful check, not a new import', () => {
    const [activity] = projectConnectionActivity({
      sessions: [{
        id: 'session-1',
        provider: 'readwise',
        sourceLabel: 'Reader',
        status: 'completed',
        updatedAt: '2026-09-17T10:04:00.000Z',
        result: {
          importedArticles: 0,
          importedHighlights: 0,
          skippedRows: 4,
          indexingFailures: 0
        }
      }]
    });

    expect(activity.outcome).toBe('No new material');
    expect(activity.detail).toMatch(/4 unchanged or skipped/i);
    expect(activity.tone).toBe('quiet');
  });

  it('labels approved, observed, expired, and revoked grants truthfully', () => {
    expect(projectAgentGrant({
      id: 'token-1',
      label: 'Research companion',
      runtime: 'codex',
      scopes: ['read'],
      status: 'active',
      lastUsedAt: null
    })).toEqual(expect.objectContaining({
      scopeLabel: 'Read only',
      stateLabel: 'Approved · waiting for first request',
      ready: false
    }));

    expect(projectAgentGrant({
      id: 'token-2',
      label: 'Edition worker',
      scopes: ['read', 'agent-write'],
      status: 'active',
      lastUsedAt: '2026-09-17T10:04:00.000Z'
    })).toEqual(expect.objectContaining({
      scopeLabel: 'Read and write',
      stateLabel: 'A request was received',
      ready: true
    }));

    expect(projectAgentGrant({
      id: 'token-3',
      label: 'Old worker',
      scopes: ['read'],
      status: 'active',
      expiresAt: '2026-09-01T00:00:00.000Z'
    }, new Date('2026-09-17T00:00:00.000Z'))).toEqual(expect.objectContaining({
      stateLabel: 'Access expired',
      ready: false
    }));
  });

  it('derives Markdown and JSON from one secret-free handoff intent', () => {
    const handoff = createConnectionHandoff({
      label: 'Research <companion>',
      runtime: 'codex',
      scope: 'read',
      task: 'Find material I already saved',
      target: 'Concept: Optionality'
    });

    expect(handoff.intent).toEqual(expect.objectContaining({
      format: 'noeis.connection-handoff',
      version: 1,
      requestedScopes: ['read'],
      runTaskAfterConnection: false,
      containsCredential: false
    }));
    expect(handoff.markdown).toContain('noeis connect codex --scope read');
    expect(handoff.markdown).toContain('Find material I already saved');
    expect(handoff.markdown).toContain('Concept: Optionality');
    expect(handoff.markdown).toContain('Do not start the task');
    expect(JSON.parse(handoff.json)).toEqual(handoff.intent);
    expect(handoff.markdown).not.toMatch(/ntk_at_|password|poll_secret/i);
    expect(handoff.filename).toBe('connect-research-companion.md');
  });

  it('fails closed for unsupported handoff scopes', () => {
    expect(() => createConnectionHandoff({
      label: 'Unsafe',
      runtime: 'codex',
      scope: 'admin'
    })).toThrow('Unsupported connection scope');
  });

  it('quotes user labels as one inert shell argument', () => {
    const handoff = createConnectionHandoff({
      label: "Research '$(echo owned)'",
      runtime: 'openclaw',
      scope: 'read'
    });

    expect(handoff.markdown).toContain("--label 'Research '\\''$(echo owned)'\\'''");
    expect(handoff.markdown).not.toContain('--label "Research');
  });
});
