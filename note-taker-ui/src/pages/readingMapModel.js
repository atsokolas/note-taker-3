// The arithmetic of looking at a reading map: where a world point lands on
// the screen, how the camera moves, and which subject an arrow key reaches.
// The server decides where things are; this decides only how you look.

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 6;
export const IDENTITY = Object.freeze({ k: 1, tx: 0, ty: 0 });

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/* Fit every point (and every label) into the frame with a margin, keeping
   the map's proportions. */
export const frameFor = (points = [], width = 0, height = 0, margin = 56) => {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs, -0.1);
  const maxX = Math.max(...xs, 0.1);
  const minY = Math.min(...ys, -0.1);
  const maxY = Math.max(...ys, 0.1);
  const scale = Math.max(1, Math.min(
    (width - margin * 2) / (maxX - minX),
    (height - margin * 2) / (maxY - minY)
  ));
  return { width, height, scale, mx: (minX + maxX) / 2, my: (minY + maxY) / 2 };
};

export const project = (point, frame, view = IDENTITY) => ({
  x: (frame.width / 2 + (point.x - frame.mx) * frame.scale) * view.k + view.tx,
  y: (frame.height / 2 + (point.y - frame.my) * frame.scale) * view.k + view.ty
});

/* Zoom by `factor` keeping the screen point under the cursor fixed. */
export const zoomAt = (view, factor, at) => {
  const k = clamp(view.k * factor, MIN_ZOOM, MAX_ZOOM);
  const f = k / view.k;
  return { k, tx: at.x - (at.x - view.tx) * f, ty: at.y - (at.y - view.ty) * f };
};

export const panBy = (view, dx, dy) => ({ ...view, tx: view.tx + dx, ty: view.ty + dy });

/* Bring a world point to the middle of the frame at zoom `k`. */
export const centreOn = (point, frame, k = 1) => {
  const base = project(point, frame);
  const zoom = clamp(k, MIN_ZOOM, MAX_ZOOM);
  return { k: zoom, tx: frame.width / 2 - base.x * zoom, ty: frame.height / 2 - base.y * zoom };
};

/* A cluster fills about half the frame when you step into it. */
export const zoomForCluster = (cluster, frame) => clamp(
  (Math.min(frame.width, frame.height) * 0.28) / Math.max(0.08, cluster.radius || 0) / frame.scale,
  1,
  MAX_ZOOM
);

export const tween = (from, to, t) => ({
  k: from.k + (to.k - from.k) * t,
  tx: from.tx + (to.tx - from.tx) * t,
  ty: from.ty + (to.ty - from.ty) * t
});

/* Dots grow with how much was marked, gently: the tenth passage matters
   less than the first. */
export const dotRadius = (marks = 0, k = 1) => (3 + 2.4 * Math.sqrt(Math.max(0, marks))) * Math.sqrt(clamp(k, 1, 3));

const DIRECTIONS = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1]
};

/* The nearest neighbour lying in the arrow's direction, favouring ones
   straight ahead over ones off to the side. Nothing that way: stay put. */
export const stepToward = (fromIndex, places = [], key) => {
  const direction = DIRECTIONS[key];
  const from = places[fromIndex];
  if (!direction || !from) return fromIndex;
  let best = { index: fromIndex, cost: Infinity };
  places.forEach((place, index) => {
    if (index === fromIndex) return;
    const dx = place.x - from.x;
    const dy = place.y - from.y;
    const ahead = dx * direction[0] + dy * direction[1];
    if (ahead <= 1e-9) return;
    const aside = Math.abs(dx * direction[1] - dy * direction[0]);
    const cost = ahead + aside * 2;
    if (cost < best.cost) best = { index, cost };
  });
  return best.index;
};

/* Reading order for the list and for the first focus: biggest subject
   first, then left to right. */
export const orderClusters = (clusters = []) => [...clusters]
  .sort((a, b) => b.size - a.size || a.x - b.x || String(a.id).localeCompare(String(b.id)));

export const sourcesIn = (map, clusterId) => (map?.sources || [])
  .filter(source => source.cluster === clusterId)
  .sort((a, b) => b.marks - a.marks || a.title.localeCompare(b.title));

export const gapSentence = ({ writing = 0, reading = 0 } = {}) => {
  const places = writing === 1 ? 'one place' : `${writing} places`;
  return reading
    ? `You write about this in ${places}; one source you saved holds it.`
    : `You write about this in ${places}; nothing you saved holds it yet.`;
};
