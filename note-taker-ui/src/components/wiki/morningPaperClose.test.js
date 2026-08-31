import {
  completeLeadSentence,
  formatCheckInTally,
  formatVerdictTally,
  isEditorialBriefing,
  isPaperCheckIn,
  morningPulseTarget,
  QUIET_SIGNOFFS,
  selectQuietSignOff,
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
    expect(wikiLivingBriefingLine({
      briefing: { summary: 'eight wiki pages have queued signals awaiting a rebuild, most notably Survivorship Bias with 5' }
    })).toBe('');
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
    })).toBe('NVDA filed a 10-Q. Nvidia dossier.');
  });

  it('names a watcher rebuild against a claim still held, and stays silent without that collision', () => {
    const lead = {
      eventId: 'evt-1',
      title: 'NVDA filed a 10-Q',
      page: { id: 'wiki-nvda', title: 'Nvidia dossier' },
      impactSummary: '2 claims touched · 1 contradicted'
    };
    expect(wikiLivingBriefingLine({
      briefing: {
        lead,
        watcherLeads: [lead],
        claimCheckIn: {
          pageId: 'wiki-nvda',
          claimId: 'c1',
          text: 'Integration retains pricing power.',
          changedSinceLastCheck: true
        }
      }
    })).toBe('NVDA filed a 10-Q. It touched a claim you still hold.');
    expect(wikiLivingBriefingLine({
      briefing: {
        lead,
        watcherLeads: [lead],
        claimCheckIn: {
          pageId: 'wiki-nvda',
          text: 'Integration retains pricing power.',
          changedSinceLastCheck: false
        }
      }
    })).toBe('NVDA filed a 10-Q. Nvidia dossier.');
    expect(wikiLivingBriefingLine({
      briefing: {
        claimCheckIn: {
          pageId: 'wiki-nvda',
          text: 'Integration retains pricing power.',
          changedSinceLastCheck: true
        }
      }
    })).toBe('');
  });

  it('prints an honestly aged drift line and stays quiet when nothing new arrived', () => {
    expect(wikiLivingBriefingLine({
      briefing: {
        summary: 'Survivorship Bias has been waiting on a rebuild for 5 days — clear it?',
        aliveness: {
          register: 'aged',
          waitingDays: 5,
          copy: 'Survivorship Bias has been waiting on a rebuild for 5 days — clear it?'
        }
      }
    })).toBe('Survivorship Bias has been waiting on a rebuild for 5 days — clear it?');
    expect(wikiLivingBriefingLine({
      briefing: {
        summary: 'Your wiki is quiet today — no new sources, updates, or drift signals in the last 24 hours.',
        aliveness: { register: 'quiet' }
      }
    })).toBe('');
    expect(wikiLivingBriefingLine({
      briefing: {
        summary: 'eight wiki pages have queued signals awaiting a rebuild, most notably Survivorship Bias with 5'
      }
    })).toBe('');
  });

  it('names two wiki closes and does not invent a third from a due claim on another page', () => {
    const first = {
      eventId: 'evt-1',
      title: 'NVDA filed a 10-Q',
      page: { id: 'wiki-nvda', title: 'Nvidia dossier' }
    };
    const second = {
      eventId: 'evt-2',
      title: 'Costco restated the gap',
      page: { id: 'wiki-costco', title: 'Costco' }
    };
    expect(wikiLivingBriefingLine({
      briefing: { lead: first, watcherLeads: [first, second] }
    })).toBe('NVDA filed a 10-Q. Another close: Costco restated the gap.');
    expect(wikiLivingBriefingLine({
      briefing: {
        lead: first,
        watcherLeads: [first, second],
        claimCheckIn: {
          pageId: 'wiki-other',
          text: 'A claim elsewhere is due.',
          changedSinceLastCheck: true
        }
      }
    })).toBe('NVDA filed a 10-Q. Another close: Costco restated the gap.');
    expect(wikiLivingBriefingLine({
      briefing: {
        lead: first,
        watcherLeads: [first, second],
        claimCheckIn: {
          pageId: 'wiki-nvda',
          text: 'Integration retains pricing power.',
          changedSinceLastCheck: true
        }
      }
    })).toBe('NVDA filed a 10-Q. It touched a claim you still hold.');
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

  it('never amputates mid-word when no sentence fits', () => {
    const amputated = 'Use these traces before editing because repo bugs usually cross UI, API, service, persistence, and render boundaries debugging only the v';
    expect(completeLeadSentence(amputated, 80)).toBe('');
    expect(completeLeadSentence(amputated, 80)).not.toMatch(/…|\.\.\.|the v$/);
  });
});

describe('quiet-day sign-off', () => {
  it('prints one of the six lines and keeps the same line for the same morning', () => {
    const monday = new Date('2026-08-31T09:00:00');
    const first = selectQuietSignOff({ now: monday });
    const again = selectQuietSignOff({ now: monday });
    expect(QUIET_SIGNOFFS).toContain(first);
    expect(again).toBe(first);
  });

  it('does not repeat on consecutive days across the rotation', () => {
    const start = new Date('2026-08-31T09:00:00');
    const month = Array.from({ length: 31 }, (_, offset) => {
      const day = new Date(start);
      day.setDate(start.getDate() + offset);
      return selectQuietSignOff({ now: day });
    });
    month.forEach((line, index) => {
      expect(QUIET_SIGNOFFS).toContain(line);
      if (index) expect(line).not.toBe(month[index - 1]);
    });
  });

  it('is six lines of craft, not the deleted quiet-today filler', () => {
    expect(QUIET_SIGNOFFS).toHaveLength(6);
    QUIET_SIGNOFFS.forEach((line) => {
      expect(line).not.toMatch(/quiet today|no new sources, updates, or drift/i);
    });
  });
});

describe('the one blue thing', () => {
  const close = {
    summary: 'NVDA filed a 10-Q.',
    lead: { title: 'NVDA filed a 10-Q', page: { title: 'Nvidia dossier' } },
    claimCheckIn: {
      pageId: 'wiki-nvda',
      claimId: 'c1',
      text: 'Integration retains pricing power.'
    }
  };

  it('puts the pulse on the lead when there is a close, even if a check-in is due', () => {
    expect(morningPulseTarget({ briefing: close })).toBe('lead');
    expect(isPaperCheckIn(close.claimCheckIn)).toBe(true);
  });

  it('puts the pulse on the check-in when the morning is otherwise quiet', () => {
    expect(morningPulseTarget({
      briefing: { aliveness: { register: 'quiet' }, claimCheckIn: close.claimCheckIn }
    })).toBe('check-in');
  });

  it('puts the pulse on a verdict when the morning is otherwise quiet', () => {
    expect(morningPulseTarget({
      briefing: {
        aliveness: { register: 'quiet' },
        claimVerdicts: [{
          pageId: 'wiki-nvda',
          claimId: 'c1',
          text: 'Integration retains pricing power.',
          trigger: 'horizon'
        }]
      }
    })).toBe('verdict');
  });

  it('puts the pulse on a qualified consequence ahead of lead, verdict, and check-in', () => {
    const consequence = {
      eventId: 'evt-1',
      pageId: 'wiki-nvda',
      claimId: 'c1',
      prior: 'NVIDIA demand still outruns deliverable capacity.',
      proposed: 'NVIDIA demand still outruns deliverable capacity. 2026-08-28: Confirmed signed capacity converts within 90 days.',
      passage: 'Confirmed signed capacity converts within 90 days.'
    };
    expect(morningPulseTarget({
      briefing: { ...close, consequence }
    })).toBe('consequence');
    expect(wikiLivingBriefingLine({ briefing: { ...close, consequence } })).toBe('');
  });

  it('is silent when nothing is alive', () => {
    expect(morningPulseTarget({
      briefing: { aliveness: { register: 'quiet' } }
    })).toBe('');
  });

  it('does not serve the repo-wiki dump as a check-in', () => {
    expect(isPaperCheckIn({
      pageId: 'wiki-repo',
      claimId: 'observed',
      text: 'Use these traces before editing because repo bugs usually cross UI, API, service, persistence, and render boundaries… WikiRepoCreateComposer, createRepoWikiFromGitHub, POST /api/wiki/pages/from-github… debugging only the v…'
    })).toBe(false);
  });
});

describe('check-in tally', () => {
  it('ticks in the mono register without calling it a streak', () => {
    expect(formatCheckInTally({ action: 'reaffirmed', count: 4, heldDays: 212 }))
      .toBe('reaffirmed · 4th · held 212 days');
    expect(formatCheckInTally({ action: 'reaffirmed', count: 4, heldDays: 212 }))
      .not.toMatch(/strongest|streak|score/i);
  });
});

describe('verdict tally', () => {
  it('ticks in the same mono register as a check-in', () => {
    expect(formatVerdictTally({ verdict: 'held_up', trigger: 'horizon', count: 1 }))
      .toBe('held up · 1st · horizon');
    expect(formatVerdictTally({ verdict: 'broke', trigger: 'evidence', count: 2 }))
      .toBe('broke · 2nd · evidence');
  });
});
