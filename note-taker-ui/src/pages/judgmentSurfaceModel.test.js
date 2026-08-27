import { buildJudgmentSurfaceDescriptor } from './judgmentSurfaceModel';

describe('buildJudgmentSurfaceDescriptor', () => {
  it('names the Judgment index without inventing a claim identity', () => {
    expect(buildJudgmentSurfaceDescriptor()).toEqual({
      room: 'judgment',
      objectType: 'judgment_index',
      objectId: 'all',
      title: 'Your judgments',
      projection: 'index',
      mode: 'browse'
    });
  });

  it('preserves exact claim, accepted basis, decision, outcome, and lesson identities', () => {
    expect(buildJudgmentSurfaceDescriptor({
      pageId: 'route-page',
      page: {
        _id: 'page-1',
        title: 'NVIDIA',
        evergreen: true,
        judgment: {
          claimId: 'claim-1',
          currentJudgment: 'Demand still outruns deliverable capacity.',
          status: 'monitoring',
          decisions: [
            { decisionId: 'decision-1', acceptedRevisionId: 'revision-1' },
            {
              decisionId: 'decision-2',
              acceptedRevisionId: 'revision-2',
              recordedRevisionId: 'revision-3',
              outcome: {
                observedAt: '2026-08-20T12:00:00.000Z',
                summary: 'Capacity converted more slowly than expected.'
              }
            }
          ],
          lessons: [
            { lessonId: 'lesson-1', text: 'Power was the tighter constraint.' },
            { lessonId: 'lesson-2', text: 'Signed supply was not delivered supply.' }
          ]
        }
      }
    })).toEqual({
      room: 'judgment',
      objectType: 'judgment_claim',
      objectId: 'page-1',
      title: 'NVIDIA',
      pageId: 'page-1',
      claimId: 'claim-1',
      projection: 'case',
      mode: 'review',
      status: 'monitoring',
      decisionIds: ['decision-1', 'decision-2'],
      outcomeDecisionIds: ['decision-2'],
      lessonIds: ['lesson-1', 'lesson-2'],
      latestDecisionId: 'decision-2',
      latestOutcomeDecisionId: 'decision-2',
      latestLessonId: 'lesson-2',
      acceptedRevisionId: 'revision-2',
      recordedRevisionId: 'revision-3',
      evergreen: true
    });
  });

  it('uses the exact page as the claim identity when the storage contract has no claim id', () => {
    const descriptor = buildJudgmentSurfaceDescriptor({
      pageId: 'page-from-route',
      page: { title: 'A claim without a loaded id', judgment: {} }
    });

    expect(descriptor).toMatchObject({
      objectType: 'judgment_claim',
      objectId: 'page-from-route',
      pageId: 'page-from-route',
      claimId: 'page-from-route',
      title: 'A claim without a loaded id'
    });
  });

  it('does not treat an empty outcome envelope as an observed outcome', () => {
    const descriptor = buildJudgmentSurfaceDescriptor({
      page: {
        _id: 'page-1',
        judgment: {
          decisions: [{ decisionId: 'decision-1', outcome: {} }]
        }
      }
    });

    expect(descriptor.decisionIds).toEqual(['decision-1']);
    expect(descriptor.outcomeDecisionIds).toEqual([]);
    expect(descriptor.latestOutcomeDecisionId).toBe('');
  });
});
