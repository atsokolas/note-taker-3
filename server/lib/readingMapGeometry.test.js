const test = require('node:test');
const assert = require('node:assert/strict');
const { pca, kmeans, clusterBySilhouette, layout, emptiestPoint, normalize } = require('./readingMapGeometry');

/* Three tight groups in ten dimensions, interleaved so order cannot help. */
const groups = () => {
  const rows = [];
  for (let i = 0; i < 15; i += 1) {
    const group = i % 3;
    const row = new Array(10).fill(0).map((_, j) => ((i * 13 + j * 7) % 5) / 100);
    row[group * 3] += 1;
    row[group * 3 + 1] += 0.8;
    rows.push(normalize(row));
  }
  return rows;
};

test('pca is deterministic, sign-stable and orders components by variance', () => {
  const rows = groups();
  const first = pca(rows, 3);
  const again = pca(rows.map(row => [...row]), 3);
  assert.deepEqual(first, again);
  const variance = c => first.reduce((sum, row) => sum + row[c] ** 2, 0);
  assert.ok(variance(0) >= variance(1) - 1e-9);
  assert.ok(variance(1) >= variance(2) - 1e-9);
});

test('kmeans recovers separated groups whatever their order', () => {
  const rows = groups();
  const { assignment } = kmeans(pca(rows, 4), 3);
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = 0; j < rows.length; j += 1) {
      assert.equal(assignment[i] === assignment[j], i % 3 === j % 3, `${i} and ${j}`);
    }
  }
});

test('silhouette chooses the number of subjects the library holds', () => {
  const best = clusterBySilhouette(pca(groups(), 4));
  assert.equal(best.k, 3);
  assert.deepEqual(clusterBySilhouette(pca(groups(), 4)).assignment, best.assignment);
});

test('a large library is never drawn as two subjects', () => {
  // 250 sources: one tight corner, and the rest spread loosely over six themes.
  const rows = Array.from({ length: 250 }, (_, i) => {
    const row = new Array(12).fill(0).map((_, j) => ((i * 31 + j * 17) % 23) / 25);
    if (i < 40) row[11] += 10;
    else row[i % 6] += 0.5;
    return normalize(row);
  });
  const { k, assignment } = clusterBySilhouette(pca(rows, 8));
  assert.ok(k >= 7, `k = ${k}`);
  const largest = Math.max(...Array.from({ length: k }, (_, c) => assignment.filter(a => a === c).length));
  assert.ok(largest < 125, `largest subject holds ${largest}`);
});

test('layout fits the unit square and keeps dots apart', () => {
  const scores = [[0, 0], [0, 0], [10, 0], [10, 0.001], [-10, 5]];
  const points = layout(scores, [0, 0, 1, 1, 2]);
  assert.deepEqual(points, layout(scores, [0, 0, 1, 1, 2]));
  points.forEach(([x, y]) => assert.ok(Math.abs(x) <= 1.1 && Math.abs(y) <= 1.1));
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      assert.ok(Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]) > 0.02);
    }
  }
});

test('the emptiest point sits away from everything already placed', () => {
  const [x, y] = emptiestPoint([[-0.8, -0.8], [-0.8, 0.8], [0.8, -0.8], [0, 0]]);
  assert.ok(x > 0.4 && y > 0.4);
});
