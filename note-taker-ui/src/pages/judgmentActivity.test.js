import { AVOIDED_AFTER_DAYS, activityNote, buildJudgmentIndex, judgmentActivity } from './judgmentModel';

const NOW = new Date('2026-08-18T12:00:00.000Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = days => new Date(NOW - days * DAY).toISOString();

const page = (judgment = {}, updatedAt = daysAgo(120)) => ({
  _id: 'p1',
  judgment: { currentJudgment: 'Compute is scarce.', falsifiers: [{ falsifierId: 'f1', text: 'Capacity converts inside 90 days.' }], ...judgment },
  updatedAt
});

const event = (at, pageId = 'p1') => ({ _id: `e-${at}`, affectedPageIds: [pageId], sourceUpdatedAt: at });

describe('judgmentActivity', () => {
  it('is quiet when nothing has arrived — and quiet is not a problem', () => {
    expect(judgmentActivity(page(), [], NOW)).toMatchObject({ state: 'quiet', arrived: 0 });
    expect(activityNote({ state: 'quiet' })).toBe('');
  });

  it('is live when evidence arrived recently', () => {
    const activity = judgmentActivity(page(), [event(daysAgo(3))], NOW);
    expect(activity.state).toBe('live');
    expect(activity.arrived).toBe(1);
    // Live says nothing either. The index is allowed to be silent.
    expect(activityNote(activity)).toBe('');
  });

  it('is avoided once arrived evidence has sat unread past the threshold', () => {
    const activity = judgmentActivity(page(), [event(daysAgo(AVOIDED_AFTER_DAYS + 5)), event(daysAgo(60))], NOW);
    expect(activity.state).toBe('avoided');
    expect(activity.arrived).toBe(2);
    expect(activityNote(activity)).toBe('2 things arrived about this and are unread');
  });

  it('counts only what arrived after the reader was last here', () => {
    const seen = page({ lastReviewedAt: daysAgo(10) });
    // One arrival predates the visit, one follows it.
    const activity = judgmentActivity(seen, [event(daysAgo(40)), event(daysAgo(2))], NOW);
    expect(activity.arrived).toBe(1);
    expect(activity.state).toBe('live');
  });

  it('is forgiving: engaging clears an avoided claim', () => {
    const stale = [event(daysAgo(AVOIDED_AFTER_DAYS + 5))];
    expect(judgmentActivity(page(), stale, NOW).state).toBe('avoided');
    expect(judgmentActivity(page({ lastReviewedAt: daysAgo(1) }), stale, NOW).state).toBe('quiet');
  });

  it('ignores events the reader dismissed, and events about other pages', () => {
    const noise = [
      { ...event(daysAgo(2)), status: 'ignored' },
      event(daysAgo(2), 'someone-else')
    ];
    expect(judgmentActivity(page(), noise, NOW)).toMatchObject({ state: 'quiet', arrived: 0 });
  });

  it('says once when nothing could ever bear on the claim', () => {
    const activity = judgmentActivity(page({ falsifiers: [] }), [], NOW);
    expect(activity.state).toBe('unfalsifiable');
    expect(activityNote(activity)).toBe('Nothing could change your mind about this yet');
  });

  it('does not raise a missing falsifier on a claim that is gathering evidence', () => {
    expect(judgmentActivity(page({ falsifiers: [] }), [event(daysAgo(2))], NOW).state).toBe('live');
  });

  it('never bubbles a parked claim — the reader already said so', () => {
    const parked = page({ status: 'parked', falsifiers: [] });
    const activity = judgmentActivity(parked, [event(daysAgo(90))], NOW);
    expect(activity.state).toBe('parked');
    expect(activityNote(activity)).toBe('Parked');
  });
});

describe('buildJudgmentIndex with activity', () => {
  it('carries the state and the note onto each row', () => {
    const index = buildJudgmentIndex(
      [page(), { _id: 'p2', judgment: { currentJudgment: 'Rates matter.' }, updatedAt: daysAgo(200) }],
      [event(daysAgo(AVOIDED_AFTER_DAYS + 2))],
      NOW
    );
    const avoided = index.find(item => item.id === 'p1');
    expect(avoided.state).toBe('avoided');
    expect(avoided.note).toBe('1 thing arrived about this and is unread');

    const other = index.find(item => item.id === 'p2');
    expect(other.state).toBe('unfalsifiable');
  });

  it('still works when no events are passed at all', () => {
    const index = buildJudgmentIndex([page()], undefined, NOW);
    expect(index).toHaveLength(1);
    expect(index[0].state).toBe('quiet');
    expect(index[0].note).toBe('');
  });
});

describe('evergreen', () => {
  const evergreenPage = { ...page({ falsifiers: [] }), evergreen: true, updatedAt: daysAgo(400) };

  it('outranks the clock: never quiet, never avoided, never told it lacks a falsifier', () => {
    const activity = judgmentActivity(evergreenPage, [event(daysAgo(300))], NOW);
    expect(activity.state).toBe('evergreen');
    expect(activityNote(activity)).toBe('Kept');
  });

  it('reaches the index row', () => {
    const index = buildJudgmentIndex([evergreenPage], [], NOW);
    expect(index[0].state).toBe('evergreen');
    expect(index[0].evergreen).toBe(true);
  });

  it('still reads as kept after the stored page is projected again', () => {
    const stored = { ...evergreenPage, evergreen: true, evergreenAt: daysAgo(10) };
    const afterReload = buildJudgmentIndex([stored], [], NOW);
    expect(afterReload[0].evergreen).toBe(true);
    expect(afterReload[0].note).toBe('Kept');
  });

  it('leaves an unmarked claim alone', () => {
    expect(judgmentActivity(page(), [], NOW).state).toBe('quiet');
  });
});
