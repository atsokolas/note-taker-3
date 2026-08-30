import {
  completeLeadSentence,
  isEditorialBriefing,
  shelfCount,
  wikiLivingBriefingLine
} from './morningPaperClose';

describe('wikiLivingBriefingLine', () => {
  it('names an editorial close and stays silent for safety boilerplate', () => {
    expect(wikiLivingBriefingLine({
      briefing: { summary: 'While you were away I rebuilt Opportunity Cost.' }
    })).toBe('While you were away I rebuilt Opportunity Cost.');
    expect(wikiLivingBriefingLine({
      briefing: { summary: 'User Safety: safe.', counts: { driftingPages: 4 } }
    })).toBe('');
    expect(wikiLivingBriefingLine({ briefing: {} })).toBe('');
  });

  it('never invents that pages are ready for review', () => {
    const line = wikiLivingBriefingLine({
      briefing: { summary: 'Quality Gate: skipped.', counts: { driftingPages: 4 } }
    });
    expect(line).toBe('');
    expect(line).not.toMatch(/ready for review/i);
    expect(line).not.toMatch(/needs your review/i);
  });

  it('prefers a watcher close over a generic summary', () => {
    expect(wikiLivingBriefingLine({
      briefing: {
        summary: 'While you were away the corpus stirred.',
        lead: {
          title: 'NVDA filed a 10-Q',
          page: { title: 'Nvidia dossier' },
          impactSummary: '2 claims touched'
        }
      }
    })).toBe('NVDA filed a 10-Q. Nvidia dossier. 2 claims touched.');
  });
});

describe('shelfCount', () => {
  it('hides a zero so Recently updated cannot wear a ready badge', () => {
    expect(shelfCount(0)).toBeUndefined();
    expect(shelfCount(undefined)).toBeUndefined();
    expect(shelfCount(3)).toBe(3);
  });
});

describe('completeLeadSentence', () => {
  it('keeps a finished sentence and closes a dangling one', () => {
    expect(completeLeadSentence('The filing restated the gap.')).toBe('The filing restated the gap.');
    expect(isEditorialBriefing('User Safety: safe.')).toBe(false);
    expect(isEditorialBriefing('The filing restated the gap.')).toBe(true);
  });
});
