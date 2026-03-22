import {
  cardIdentity,
  mergeCards,
  mergeGenericTimeline,
  mergeWorkbenchStates
} from './ideaWorkbenchMerge';

const buildState = (overrides = {}) => ({
  version: 1,
  header: {
    label: 'Idea',
    title: 'Local idea',
    prompt: 'Prompt',
    stage: 'Forming'
  },
  workspaceDraft: '',
  workspaceDraftType: 'Note',
  importedSourceKeys: [],
  cards: [],
  hypothesis: {
    html: '<p>Local hypothesis</p>',
    versions: []
  },
  agent: {
    comments: [],
    messages: []
  },
  ...overrides
});

describe('ideaWorkbenchMerge', () => {
  it('uses source key as the primary card identity', () => {
    expect(cardIdentity({ sourceKey: 'highlight:1', id: 'local-card' })).toBe('highlight:1');
    expect(cardIdentity({ id: 'local-card', type: 'Note', title: 'Fallback' })).toBe('local-card');
  });

  it('merges cards by logical identity and unions tags', () => {
    const merged = mergeCards(
      [
        {
          id: 'local-card',
          sourceKey: 'highlight:1',
          title: 'Local title',
          content: 'Local content',
          tags: ['claim'],
          createdAt: '2026-03-21T01:00:00.000Z'
        },
        {
          id: 'local-unique',
          sourceKey: 'note:1',
          title: 'Local unique',
          content: 'Unique local content',
          tags: ['theme'],
          createdAt: '2026-03-21T02:00:00.000Z'
        }
      ],
      [
        {
          id: 'remote-card',
          sourceKey: 'highlight:1',
          title: 'Remote title',
          content: 'Remote content',
          tags: ['evidence'],
          createdAt: '2026-03-21T00:00:00.000Z'
        }
      ]
    );

    expect(merged).toHaveLength(2);
    expect(merged).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceKey: 'highlight:1',
        title: 'Local title',
        tags: ['evidence', 'claim']
      }),
      expect.objectContaining({
        sourceKey: 'note:1',
        title: 'Local unique'
      })
    ]));
  });

  it('merges timeline items without duplicating shared ids', () => {
    const merged = mergeGenericTimeline(
      [
        { id: 'shared', title: 'Local shared', createdAt: '2026-03-21T01:00:00.000Z' },
        { id: 'local-only', title: 'Local only', createdAt: '2026-03-21T02:00:00.000Z' }
      ],
      [
        { id: 'shared', title: 'Remote shared', createdAt: '2026-03-21T00:00:00.000Z' },
        { id: 'remote-only', title: 'Remote only', createdAt: '2026-03-20T23:00:00.000Z' }
      ],
      'message'
    );

    expect(merged).toHaveLength(3);
    expect(merged).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'shared', title: 'Local shared' }),
      expect.objectContaining({ id: 'local-only' }),
      expect.objectContaining({ id: 'remote-only' })
    ]));
  });

  it('respects section choices while merging cards, versions, and agent history', () => {
    const localState = buildState({
      header: { label: 'Idea', title: 'Local title', prompt: 'Local prompt', stage: 'Testing' },
      workspaceDraft: 'Unsaved local draft',
      workspaceDraftType: 'Note',
      importedSourceKeys: ['local-source'],
      cards: [
        {
          id: 'local-card',
          sourceKey: 'local-source',
          zone: 'workspace',
          type: 'Note',
          title: 'Local card',
          content: 'Local content',
          tags: ['claim'],
          createdAt: '2026-03-21T01:00:00.000Z'
        }
      ],
      hypothesis: {
        html: '<p>Local hypothesis</p>',
        versions: [
          { id: 'local-version', label: 'v2', html: '<p>Local hypothesis</p>', createdAt: '2026-03-21T01:00:00.000Z' }
        ]
      },
      agent: {
        comments: [
          { id: 'local-comment', title: 'Local comment', body: 'Local body', createdAt: '2026-03-21T01:00:00.000Z' }
        ],
        messages: [
          { id: 'local-message', text: 'Local message', createdAt: '2026-03-21T01:00:00.000Z' }
        ]
      }
    });
    const remoteState = buildState({
      header: { label: 'Idea', title: 'Remote title', prompt: 'Remote prompt', stage: 'Gathering' },
      importedSourceKeys: ['remote-source'],
      cards: [
        {
          id: 'remote-card',
          sourceKey: 'remote-source',
          zone: 'supports',
          type: 'Highlight',
          title: 'Remote card',
          content: 'Remote content',
          tags: ['evidence'],
          createdAt: '2026-03-21T00:00:00.000Z'
        }
      ],
      hypothesis: {
        html: '<p>Remote hypothesis</p>',
        versions: [
          { id: 'remote-version', label: 'v1', html: '<p>Remote hypothesis</p>', createdAt: '2026-03-21T00:00:00.000Z' }
        ]
      },
      agent: {
        comments: [
          { id: 'remote-comment', title: 'Remote comment', body: 'Remote body', createdAt: '2026-03-21T00:00:00.000Z' }
        ],
        messages: [
          { id: 'remote-message', text: 'Remote message', createdAt: '2026-03-21T00:00:00.000Z' }
        ]
      }
    });

    const merged = mergeWorkbenchStates(localState, remoteState, {
      header: 'remote',
      cards: 'merge',
      hypothesis: 'local',
      agent: 'merge'
    });

    expect(merged.header.title).toBe('Remote title');
    expect(merged.workspaceDraft).toBe('Unsaved local draft');
    expect(merged.importedSourceKeys).toEqual(['remote-source', 'local-source']);
    expect(merged.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Remote card' }),
      expect.objectContaining({ title: 'Local card' })
    ]));
    expect(merged.hypothesis.html).toBe('<p>Local hypothesis</p>');
    expect(merged.hypothesis.versions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'remote-version' }),
      expect.objectContaining({ id: 'local-version' })
    ]));
    expect(merged.agent.comments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'remote-comment' }),
      expect.objectContaining({ id: 'local-comment' })
    ]));
    expect(merged.agent.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'remote-message' }),
      expect.objectContaining({ id: 'local-message' })
    ]));
  });
});
