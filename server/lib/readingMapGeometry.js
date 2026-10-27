/**
 * The geometry of a reading map, in plain arithmetic.
 *
 * Every step is deterministic — fixed starting vectors, fixed seeds, ties
 * broken by index — so the same library always draws the same picture. A map
 * that rearranged itself on every visit would teach nothing about where
 * anything lives.
 *
 *   vectors ─ pca(d) ─▶ a denoised space where clusters are found
 *                └──── first two components become the page
 */

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const norm = (v) => Math.sqrt(dot(v, v));
const distance2 = (a, b) => a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);

const normalize = (v) => {
  const length = norm(v);
  return length ? v.map(value => value / length) : v.map(() => 0);
};

const mean = (rows) => {
  const out = new Array(rows[0]?.length || 0).fill(0);
  rows.forEach(row => row.forEach((value, index) => { out[index] += value / rows.length; }));
  return out;
};

/* Principal components by power iteration with deflation. The starting
   vector is fixed rather than random, and each component's sign is set so
   its largest coordinate is positive — otherwise the map could flip between
   two equally true mirror images. Returns each row's scores. */
const pca = (rows, dimensions = 2, iterations = 40) => {
  const width = rows[0]?.length || 0;
  const centre = mean(rows);
  const centred = rows.map(row => row.map((value, index) => value - centre[index]));
  const components = [];
  for (let c = 0; c < Math.min(dimensions, width); c += 1) {
    let v = normalize(Array.from({ length: width }, (_, j) => 1 + ((j * 7 + c * 3) % 11) / 11));
    for (let step = 0; step < iterations; step += 1) {
      const scores = centred.map(row => dot(row, v));
      let next = new Array(width).fill(0);
      centred.forEach((row, i) => row.forEach((value, j) => { next[j] += value * scores[i]; }));
      components.forEach((u) => {
        const along = dot(next, u);
        next = next.map((value, j) => value - along * u[j]);
      });
      if (!norm(next)) break;
      v = normalize(next);
    }
    const lead = v.reduce((best, value, j) => (Math.abs(value) > Math.abs(v[best]) ? j : best), 0);
    components.push(v[lead] < 0 ? v.map(value => -value) : v);
  }
  return centred.map(row => components.map(u => dot(row, u)));
};

/* Lloyd's k-means from a farthest-point start: the first centre is fixed,
   each next one the point farthest from those chosen. */
const lloyd = (points, k, first, iterations) => {
  const centres = [points[first]];
  while (centres.length < k) {
    const far = points.reduce((best, p, i) => {
      const gap = Math.min(...centres.map(c => distance2(p, c)));
      return gap > best.gap ? { i, gap } : best;
    }, { i: 0, gap: -1 });
    centres.push(points[far.i]);
  }
  let assignment = points.map(() => -1);
  for (let step = 0; step < iterations; step += 1) {
    const next = points.map(p => centres.reduce((best, c, j) => (
      distance2(p, c) < distance2(p, centres[best]) ? j : best
    ), 0));
    const settled = next.every((value, i) => value === assignment[i]);
    assignment = next;
    if (settled) break;
    centres.forEach((_, j) => {
      const members = points.filter((__, i) => assignment[i] === j);
      if (members.length) centres[j] = mean(members);
    });
  }
  const inertia = points.reduce((sum, p, i) => sum + distance2(p, centres[assignment[i]]), 0);
  return { assignment, centres, inertia };
};

/* A farthest-point start is at the mercy of an outlier, so several fixed
   starts are run — the point nearest the middle, then points spread through
   the list — and the tightest result is kept. Still deterministic. */
const kmeans = (points, k, { starts = 6, iterations = 60 } = {}) => {
  const middle = mean(points);
  const nearestMiddle = points.reduce((best, p, i) => (
    distance2(p, middle) < distance2(points[best], middle) ? i : best
  ), 0);
  const firsts = [...new Set([nearestMiddle, ...Array.from(
    { length: starts - 1 },
    (_, s) => Math.floor(((s + 1) * points.length) / starts)
  )])];
  return firsts
    .map(first => lloyd(points, k, first, iterations))
    .reduce((best, run) => (run.inertia < best.inertia - 1e-12 ? run : best));
};

/* Mean silhouette: how much nearer each point sits to its own cluster than
   to the next one. It is what decides how many subjects a library holds. */
const silhouette = (points, assignment, k) => {
  const scores = points.map((p, i) => {
    const sums = new Array(k).fill(0);
    const counts = new Array(k).fill(0);
    points.forEach((q, j) => {
      if (i === j) return;
      sums[assignment[j]] += Math.sqrt(distance2(p, q));
      counts[assignment[j]] += 1;
    });
    const own = assignment[i];
    if (!counts[own]) return 0;
    const a = sums[own] / counts[own];
    const b = Math.min(...sums.map((s, c) => (c === own || !counts[c] ? Infinity : s / counts[c])));
    return Number.isFinite(b) ? (b - a) / Math.max(a, b) : 0;
  });
  return scores.reduce((sum, value) => sum + value, 0) / (scores.length || 1);
};

/* A subject holds tens of sources, not hundreds. Left alone, silhouette
   settles on two for a large library (one tight corner, then everything
   else under one name), so the fewest subjects tried grows with the library:
   one per SOURCES_PER_SUBJECT sources. */
const SOURCES_PER_SUBJECT = 40;

/* Try from that floor up to eight subjects (never a cluster thinner than
   four on average) and keep the clearest. Ties go to fewer. */
const clusterBySilhouette = (points, maxK = 8) => {
  const ceiling = Math.max(2, Math.min(maxK, Math.floor(points.length / 4)));
  const floor = Math.min(ceiling, Math.max(2, Math.ceil(points.length / SOURCES_PER_SUBJECT)));
  let best = null;
  for (let k = floor; k <= ceiling; k += 1) {
    const run = kmeans(points, k);
    const score = silhouette(points, run.assignment, k);
    if (!best || score > best.score + 1e-9) best = { ...run, k, score };
  }
  return best;
};

/* Fit to the unit square without distorting it, gather each cluster toward
   its middle so subjects read as places, then nudge apart any dots sitting on
   top of each other. */
const layout = (scores2d, assignment, { gather = 0.42, spacing = 0.045, passes = 24 } = {}) => {
  const reach = Math.max(1e-9, ...scores2d.flat().map(Math.abs));
  let points = scores2d.map(([x, y]) => [x / reach, y / reach]);
  const ids = [...new Set(assignment)];
  const centreOf = (id) => mean(points.filter((_, i) => assignment[i] === id));
  const centres = Object.fromEntries(ids.map(id => [id, centreOf(id)]));
  points = points.map(([x, y], i) => {
    const [cx, cy] = centres[assignment[i]];
    return [cx + (x - cx) * (1 - gather), cy + (y - cy) * (1 - gather)];
  });
  for (let pass = 0; pass < passes; pass += 1) {
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const dx = points[j][0] - points[i][0];
        const dy = points[j][1] - points[i][1];
        const d = Math.hypot(dx, dy);
        if (d >= spacing) continue;
        const angle = d ? null : ((i * 37 + j * 17) % 360) * (Math.PI / 180);
        const ux = d ? dx / d : Math.cos(angle);
        const uy = d ? dy / d : Math.sin(angle);
        const push = (spacing - d) / 2;
        points[i] = [points[i][0] - ux * push, points[i][1] - uy * push];
        points[j] = [points[j][0] + ux * push, points[j][1] + uy * push];
      }
    }
  }
  return points.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
};

/* The emptiest point on the page: the grid cell farthest from every dot and
   every label already placed. Used only to set a blind spot's name down
   where the reading is not — never to decide that one exists. */
const emptiestPoint = (occupied, { inset = 0.82, steps = 24 } = {}) => {
  let best = { x: 0, y: 0, gap: -1 };
  for (let i = 0; i <= steps; i += 1) {
    for (let j = 0; j <= steps; j += 1) {
      const x = -inset + (2 * inset * i) / steps;
      const y = -inset + (2 * inset * j) / steps;
      const gap = Math.min(...occupied.map(([ox, oy]) => Math.hypot(x - ox, y - oy)));
      if (gap > best.gap + 1e-9) best = { x, y, gap };
    }
  }
  return [Math.round(best.x * 1000) / 1000, Math.round(best.y * 1000) / 1000];
};

module.exports = {
  normalize,
  mean,
  pca,
  kmeans,
  silhouette,
  clusterBySilhouette,
  layout,
  emptiestPoint
};
