import { buildPaletteDestinations } from './paletteDestinations';

const labels = (rows) => rows.map(row => row.label);
const pathOf = (rows, label) => rows.find(row => row.label === label)?.path;

describe('the palette index', () => {
  it('reaches every room the product actually has', () => {
    const rows = buildPaletteDestinations();
    expect(labels(rows)).toEqual(expect.arrayContaining([
      'Library', 'Think', 'Wiki', 'Judgment', 'Connections', 'Settings'
    ]));
  });

  it('no longer advertises rooms that were dissolved', () => {
    const rows = buildPaletteDestinations();
    expect(labels(rows)).not.toContain('Review');
    expect(labels(rows)).not.toContain('Map');
    expect(rows.some(row => row.path === '/review' || row.path === '/map')).toBe(false);
  });

  it('reaches the three places on the desk and the shelf', () => {
    const rows = buildPaletteDestinations();
    expect(pathOf(rows, 'Later')).toBe('/library?scope=later');
    expect(pathOf(rows, 'Set aside')).toBe('/library?scope=set-aside');
    expect(pathOf(rows, 'Kept')).toBe('/library?scope=kept');
  });

  it('reaches a screened folder by its own name, never by the word feed', () => {
    const rows = buildPaletteDestinations({
      folders: [{ _id: 'f1', name: 'Costco', asFeed: true }],
      articles: [{ _id: 'a1', folder: { _id: 'f1' }, createdAt: '2026-09-01T00:00:00.000Z' }]
    });
    // The door keys on the folder's id, which is what the rail routes on;
    // the reader only ever sees the name.
    expect(pathOf(rows, 'Costco')).toBe('/library?scope=feed&topic=f1');
    expect(labels(rows)).not.toContain('Feed');
  });

  it('says nothing about screened folders when none are open', () => {
    const rows = buildPaletteDestinations({ folders: [], articles: [] });
    expect(rows.filter(row => row.kind === 'topic')).toEqual([]);
  });

  it('leads with the rooms, then the places, then what is screened', () => {
    const rows = buildPaletteDestinations({
      folders: [{ _id: 'f1', name: 'Costco', asFeed: true }],
      articles: [{ _id: 'a1', folder: { _id: 'f1' }, createdAt: '2026-09-01T00:00:00.000Z' }]
    });
    const kinds = rows.map(row => row.kind);
    expect(kinds.indexOf('surface')).toBeLessThan(kinds.indexOf('place'));
    expect(kinds.indexOf('place')).toBeLessThan(kinds.indexOf('topic'));
  });

  it('names every row and sends it somewhere', () => {
    const rows = buildPaletteDestinations({
      folders: [{ _id: 'f1', name: 'Costco', asFeed: true }],
      articles: [{ _id: 'a1', folder: { _id: 'f1' }, createdAt: '2026-09-01T00:00:00.000Z' }]
    });
    rows.forEach((row) => {
      expect(row.label).toBeTruthy();
      expect(row.path).toBeTruthy();
      expect(row.id).toBeTruthy();
    });
  });

  it('offers each destination once', () => {
    const rows = buildPaletteDestinations();
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
  });

  it('cannot go stale: a room added to the definitions arrives on its own', () => {
    const rows = buildPaletteDestinations();
    // Judgment was missing from the hand-written list this replaces.
    expect(pathOf(rows, 'Judgment')).toBe('/judgment');
  });
});
