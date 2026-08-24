import { buildThinkSurfaceDescriptor } from './thinkSurfaceModel';

describe('buildThinkSurfaceDescriptor', () => {
  it('binds an accepted Wiki investigation to the exact Concept and basis', () => {
    expect(buildThinkSurfaceDescriptor({
      activeView: 'concepts',
      concept: { _id: 'concept-1', name: 'Compounding' },
      requestedConceptId: 'concept-1',
      wikiPageId: 'page-1',
      revisionId: 'revision-1',
      claimId: 'claim-1',
      investigation: true
    })).toMatchObject({
      room: 'think',
      objectType: 'concept',
      objectId: 'concept-1',
      title: 'Compounding',
      pageId: 'page-1',
      revisionId: 'revision-1',
      claimId: 'claim-1',
      mode: 'investigate'
    });
  });

  it('uses exact ids for Question, thread, and handoff postures', () => {
    expect(buildThinkSurfaceDescriptor({
      activeView: 'questions',
      question: { _id: 'question-1', text: 'What changed?' }
    })).toMatchObject({ objectType: 'question', objectId: 'question-1', title: 'What changed?' });

    expect(buildThinkSurfaceDescriptor({
      activeView: 'threads',
      selectedThreadId: 'thread-1',
      thread: { title: 'Research thread' }
    })).toMatchObject({ objectType: 'agent_thread', objectId: 'thread-1', title: 'Research thread' });

    expect(buildThinkSurfaceDescriptor({
      activeView: 'handoffs',
      selectedHandoffId: 'handoff-1',
      handoff: { title: 'Review handoff' }
    })).toMatchObject({ objectType: 'agent_handoff', objectId: 'handoff-1', title: 'Review handoff' });
  });

  it('does not promote a legacy Concept display name into stable identity', () => {
    expect(buildThinkSurfaceDescriptor({
      activeView: 'concepts',
      conceptName: 'Compound interest'
    })).toMatchObject({
      objectType: 'concept',
      objectId: '',
      title: 'Compound interest'
    });
  });
});
