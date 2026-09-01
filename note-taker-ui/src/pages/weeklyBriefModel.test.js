import { briefOpening, buildWeeklyBrief } from './weeklyBriefModel';

const NOW = new Date('2026-08-18T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = days => new Date(NOW - days * DAY).toISOString();

const claim = (id, sentence, { judgment = {}, ...rest } = {}) => ({
  _id: id,
  updatedAt: daysAgo(200),
  ...rest,
  judgment: {
    currentJudgment: sentence,
    falsifiers: [{ falsifierId: `f-${id}`, text: 'Something would change my mind.' }],
    lastReviewedAt: daysAgo(200),
    ...judgment
  }
});

const event = (pageId, at) => ({ _id: `e-${pageId}-${at}`, affectedPageIds: [pageId], sourceUpdatedAt: at });

describe('buildWeeklyBrief', () => {
  it('counts the week and sorts the claims into the states already on the index', () => {
    const brief = buildWeeklyBrief({
      pages: [
        claim('live', 'Compute stays scarce.'),
        claim('avoided', 'Capex discipline is returning.'),
        claim('quiet', 'Rates still matter.'),
        claim('cantcheck', 'Founder-led companies outperform.', { judgment: { falsifiers: [] } })
      ],
      articles: [
        { _id: 'a1', createdAt: daysAgo(2) },
        { _id: 'a2', createdAt: daysAgo(5) },
        { _id: 'a3', createdAt: daysAgo(30) }
      ],
      events: [event('live', daysAgo(2)), event('avoided', daysAgo(40))],
      now: NOW
    });

    expect(brief.read).toBe(2);
    expect(brief.boreOnBeliefs).toBe(1);
    expect(brief.working.map(r => r.id)).toEqual(['live']);
    expect(brief.avoided.map(r => r.id)).toEqual(['avoided']);
    expect(brief.quiet.map(r => r.id)).toEqual(['quiet']);
    expect(brief.unfalsifiable.map(r => r.id)).toEqual(['cantcheck']);
    expect(brief.avoided[0].note).toBe('1 thing arrived about this and is unread');
  });

  it('gathers only the lessons written this week', () => {
    const brief = buildWeeklyBrief({
      pages: [
        claim('a', 'Compute stays scarce.', { judgment: { lessons: [
          { lessonId: 'l1', text: 'Announced is not delivered.', at: daysAgo(3) },
          { lessonId: 'l2', text: 'An older lesson.', at: daysAgo(60) }
        ] } })
      ],
      now: NOW
    });
    expect(brief.learned.map(l => l.text)).toEqual(['Announced is not delivered.']);
    expect(brief.learned[0].claim).toBe('Compute stays scarce.');
  });

  it('counts what is kept, across sources and pages', () => {
    const brief = buildWeeklyBrief({
      pages: [{ _id: 'p', evergreen: true }],
      articles: [{ _id: 'a', evergreen: true }, { _id: 'b' }],
      now: NOW
    });
    expect(brief.kept).toBe(2);
  });

  it('says a quiet week was quiet rather than manufacturing something', () => {
    const brief = buildWeeklyBrief({ pages: [claim('q', 'Rates still matter.')], now: NOW });
    expect(brief.isQuiet).toBe(true);
    expect(briefOpening(brief)).toBe('A quiet week. Nothing arrived, and nothing needed you.');
  });

  it('is not quiet when something is being avoided, even if nothing was read', () => {
    const brief = buildWeeklyBrief({
      pages: [claim('a', 'Capex discipline is returning.')],
      events: [event('a', daysAgo(40))],
      now: NOW
    });
    expect(brief.isQuiet).toBe(false);
  });

  it('survives being given nothing at all', () => {
    const brief = buildWeeklyBrief();
    expect(brief.read).toBe(0);
    expect(brief.working).toEqual([]);
    expect(brief.isQuiet).toBe(true);
  });

  it('returns one completed owner-reviewed maintenance consequence', () => {
    const brief = buildWeeklyBrief({
      receipts: [
        {
          id: 'accepted',
          kind: 'company_dossier_maintenance_accepted',
          status: 'completed',
          summary: 'Research changed the utilization claim.',
          completedAt: daysAgo(2),
          touched: [{ type: 'wiki_page', id: 'dossier', title: 'CoreWeave' }]
        },
        {
          id: 'reviewed',
          kind: 'company_dossier_judgment_review',
          status: 'completed',
          summary: 'Reviewed the accepted research and kept the current judgment.',
          completedAt: daysAgo(3),
          touched: [{ type: 'wiki_page', id: 'dossier', title: 'CoreWeave' }]
        }
      ],
      now: NOW
    });

    expect(brief.maintenanceReturn).toMatchObject({
      id: 'reviewed',
      label: 'Judgment reviewed',
      href: '/judgment/dossier'
    });
    expect(brief.isQuiet).toBe(false);
  });

  it('stays silent for pending, generic, or malformed receipt activity', () => {
    const brief = buildWeeklyBrief({
      receipts: [
        { id: 'pending', kind: 'company_dossier_judgment_review', status: 'awaiting_review' },
        { id: 'import', kind: 'readwise_import', status: 'completed', summary: 'Imported 20 things.' },
        { id: 'thin', kind: 'company_dossier_maintenance_accepted', status: 'completed', summary: '' }
      ],
      now: NOW
    });

    expect(brief.maintenanceReturn).toBeNull();
    expect(brief.isQuiet).toBe(true);
  });
});

describe('briefOpening', () => {
  it('counts rather than exhorts', () => {
    expect(briefOpening({ read: 11, boreOnBeliefs: 3 })).toBe('You read 11 things, and it bore on 3 claims you hold.');
    expect(briefOpening({ read: 1, boreOnBeliefs: 1 })).toBe('You read one thing, and it bore on one claim you hold.');
  });

  it('says plainly when a week of reading touched nothing you hold', () => {
    expect(briefOpening({ read: 6, boreOnBeliefs: 0 })).toBe('You read 6 things. None of it touched what you hold.');
  });
});

/* The paper's line shipped saying "A quiet week" every week, because the paper
   passes no articles and the briefing has no sourceEvents field — so read was
   always 0 and isQuiet was always true. These pin the thing that was wrong:
   the line has to change when the facts change. */
describe('paperWeekLine', () => {
  const { paperWeekLine } = require('./weeklyBriefModel');

  it('leads with evidence you have not read, because that is the only thing waiting', () => {
    const brief = buildWeeklyBrief({
      pages: [claim('a', 'Capex discipline is returning.')],
      events: [event('a', daysAgo(40))],
      now: NOW
    });
    expect(paperWeekLine(brief)).toBe('One claim has evidence you have not read.');
  });

  it('counts them when there is more than one', () => {
    const brief = buildWeeklyBrief({
      pages: [claim('a', 'One.'), claim('b', 'Two.')],
      events: [event('a', daysAgo(40)), event('b', daysAgo(50))],
      now: NOW
    });
    expect(paperWeekLine(brief)).toBe('2 claims have evidence you have not read.');
  });

  it('falls back to what you learned when nothing is waiting', () => {
    const brief = buildWeeklyBrief({
      pages: [claim('a', 'Compute stays scarce.', { judgment: { lessons: [
        { lessonId: 'l1', text: 'Announced is not delivered.', at: daysAgo(2) }
      ] } })],
      now: NOW
    });
    expect(paperWeekLine(brief)).toBe('You learned one thing this week.');
  });

  it('says nothing needed you only when nothing did', () => {
    expect(paperWeekLine(buildWeeklyBrief({ pages: [claim('a', 'Rates matter.')], now: NOW })))
      .toBe('Nothing has needed you this week.');
  });

  it('never mentions reading, because the paper cannot see what was saved', () => {
    const brief = buildWeeklyBrief({
      pages: [claim('a', 'Capex discipline is returning.')],
      events: [event('a', daysAgo(40))],
      now: NOW
    });
    expect(paperWeekLine(brief)).not.toMatch(/read \d|You read/);
  });
});
