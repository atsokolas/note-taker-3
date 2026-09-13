const {
  canPublishConcept,
  canPublishQuestion,
  freezeThinkSnapshot,
  hashPublicConcept,
  hashPublicQuestion,
  missingSnapshot,
  projectPublicConcept,
  projectPublicQuestion,
  thinkShareState
} = require('./authoredThinkShare');

describe('authored think share', () => {
  it('projects question paragraphs and withholds library doors', () => {
    const preview = projectPublicQuestion({
      text: 'What survives compounding?',
      status: 'open',
      conceptName: 'Compounding',
      blocks: [
        { id: 'p1', type: 'paragraph', text: 'Public paragraph.' },
        { id: 'h1', type: 'highlight-ref', text: 'secret highlight' },
        {
          id: 'private',
          type: 'paragraph',
          text: 'An exact excerpt from the owner Library.',
          articleId: '64f2000000000000000000aa',
          articleTitle: 'Private source',
          sourcePath: '/library?articleId=private'
        }
      ]
    }, 'Athan');
    expect(preview.question.text).toBe('What survives compounding?');
    expect(preview.question.paragraphs).toEqual([
      { id: 'p1', type: 'paragraph', text: 'Public paragraph.' }
    ]);
    expect(JSON.stringify(preview)).not.toMatch(/library\?/);
    expect(JSON.stringify(preview)).not.toMatch(/secret highlight/);
    expect(canPublishQuestion(preview)).toBe(true);
    expect(canPublishQuestion(projectPublicQuestion({ text: '   ' }, 'Athan'))).toBe(false);
  });

  it('projects concept cards without source trails or ConceptNote', () => {
    const preview = projectPublicConcept({
      name: 'Opportunity Cost',
      description: 'Tradeoffs over hidden alternatives.',
      ideaWorkbench: {
        hypothesis: { html: '<p>Tradeoffs compound.</p>' },
        header: { prompt: 'What does this explain?' },
        cards: [{
          id: 'card-1',
          zone: 'supports',
          type: 'highlight',
          title: 'Public argument',
          content: 'Choosing one path excludes another.',
          source: 'Private article title',
          whyItMatters: 'It makes hidden alternatives visible.',
          sourcePath: '/library?articleId=private'
        }]
      }
    }, 'Athan');
    expect(preview.concept.name).toBe('Opportunity Cost');
    expect(preview.concept.supports[0].title).toBe('Public argument');
    expect(preview.concept.supports[0].source).toBeUndefined();
    expect(preview.concept.note).toBeUndefined();
    expect(JSON.stringify(preview)).not.toMatch(/Private article title/);
    expect(JSON.stringify(preview)).not.toMatch(/library\?/);
    expect(canPublishConcept(preview)).toBe(true);
  });

  it('hashes the public payload without dates so a later freeze is not a rewrite', () => {
    const preview = projectPublicQuestion({ text: 'What survives compounding?' }, 'Athan');
    const frozen = freezeThinkSnapshot(preview, '2026-09-13T12:00:00.000Z', {
      revisedAt: '2026-09-13T15:00:00.000Z',
      correction: 'The exception now leads.'
    });
    expect(frozen.publishedAt).toBe('2026-09-13T12:00:00.000Z');
    expect(frozen.revisedAt).toBe('2026-09-13T15:00:00.000Z');
    expect(frozen.correction).toBe('The exception now leads.');
    expect(hashPublicQuestion(preview)).toBe(hashPublicQuestion(frozen));
    expect(hashPublicConcept(projectPublicConcept({ name: 'Cost' }, 'Athan')))
      .toBe(hashPublicConcept(freezeThinkSnapshot(projectPublicConcept({ name: 'Cost' }, 'Athan'), new Date())));
  });

  it('marks a share stale only when the live hash moved', () => {
    const preview = projectPublicQuestion({ text: 'What survives compounding?' }, 'Athan');
    const hash = hashPublicQuestion(preview);
    const shared = thinkShareState({
      slug: 'qslug',
      snapshot: freezeThinkSnapshot(preview, '2026-09-13T12:00:00.000Z'),
      contentHash: hash,
      publishedAt: '2026-09-13T12:00:00.000Z'
    }, { preview, currentHash: hash, kind: 'question' });
    expect(shared.stale).toBe(false);
    const moved = projectPublicQuestion({ text: 'What survives the rewrite?' }, 'Athan');
    expect(thinkShareState({
      slug: 'qslug',
      snapshot: shared.snapshot,
      contentHash: hash
    }, { preview: moved, currentHash: hashPublicQuestion(moved), kind: 'question' }).stale).toBe(true);
    expect(missingSnapshot({})).toBe(true);
    expect(missingSnapshot({ snapshot: preview })).toBe(false);
  });
});
