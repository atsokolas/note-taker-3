import {
  IDENTITY,
  centreOn,
  frameFor,
  gapSentence,
  orderClusters,
  project,
  stepToward,
  zoomAt
} from './readingMapModel';

describe('readingMapModel', () => {
  const frame = frameFor([{ x: -1, y: -1 }, { x: 1, y: 1 }], 800, 600);

  it('fits the map into the frame and keeps the middle in the middle', () => {
    expect(project({ x: 0, y: 0 }, frame)).toEqual({ x: 400, y: 300 });
    const corner = project({ x: 1, y: 1 }, frame);
    expect(corner.y).toBeLessThanOrEqual(600 - 56 + 1e-9);
  });

  it('zooms around the cursor without moving what is under it', () => {
    const under = { x: 250, y: 120 };
    const view = zoomAt(IDENTITY, 2, under);
    const world = { x: (under.x - 400) / frame.scale, y: (under.y - 300) / frame.scale };
    const after = project(world, frame, view);
    expect(after.x).toBeCloseTo(under.x);
    expect(after.y).toBeCloseTo(under.y);
    expect(zoomAt(IDENTITY, 100, under).k).toBe(6);
  });

  it('centres on a subject', () => {
    const view = centreOn({ x: 0.5, y: -0.5 }, frame, 2);
    const point = project({ x: 0.5, y: -0.5 }, frame, view);
    expect(point.x).toBeCloseTo(400);
    expect(point.y).toBeCloseTo(300);
  });

  it('steps to the nearest subject in the arrow direction, or stays put', () => {
    const places = [{ x: 0, y: 0 }, { x: 1, y: 0.1 }, { x: 0.4, y: 0.9 }, { x: -1, y: 0 }];
    expect(stepToward(0, places, 'ArrowRight')).toBe(1);
    expect(stepToward(0, places, 'ArrowLeft')).toBe(3);
    expect(stepToward(0, places, 'ArrowDown')).toBe(2);
    expect(stepToward(1, places, 'ArrowRight')).toBe(1);
    expect(stepToward(0, places, 'Tab')).toBe(0);
  });

  it('orders subjects biggest first', () => {
    const ordered = orderClusters([{ id: 'a', size: 2, x: 0 }, { id: 'b', size: 5, x: 1 }]);
    expect(ordered.map(c => c.id)).toEqual(['b', 'a']);
  });

  it('says what a blind spot is made of', () => {
    expect(gapSentence({ writing: 4, reading: 0 })).toBe('You write about this in 4 places; nothing you saved holds it yet.');
    expect(gapSentence({ writing: 3, reading: 1 })).toBe('You write about this in 3 places; one source you saved holds it.');
  });
});
