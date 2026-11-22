/* The outline beside a draft is a flat list of points, each with a depth.
   A point's branch is the point and every deeper point after it. Every move
   here takes a branch, so a point never leaves its children behind. */

export const MAX_DEPTH = 5;

export const branchEnd = (points, index) => {
  let end = index + 1;
  while (end < points.length && points[end].depth > points[index].depth) end += 1;
  return end;
};

export const hasChildren = (points, index) => (points[index + 1]?.depth ?? -1) > (points[index]?.depth ?? 0);

/** The points you can see: nothing under a folded point. */
export const visiblePoints = (points) => {
  const shown = [];
  for (let index = 0; index < points.length; index += 1) {
    shown.push({ point: points[index], index });
    if (points[index].folded) index = branchEnd(points, index) - 1;
  }
  return shown;
};

const shifted = (branch, delta) => branch.map(point => ({ ...point, depth: point.depth + delta }));

/** Tab and Shift-Tab: a point can go one deeper than the point above it, never deeper. */
export const shiftBranch = (points, index, delta) => {
  const point = points[index];
  if (!point) return points;
  const ceiling = index === 0 ? 0 : Math.min(MAX_DEPTH, points[index - 1].depth + 1);
  const depth = Math.max(0, Math.min(ceiling, point.depth + delta));
  const end = branchEnd(points, index);
  const branch = points.slice(index, end);
  if (depth === point.depth || branch.some(item => item.depth + depth - point.depth > MAX_DEPTH)) return points;
  return [...points.slice(0, index), ...shifted(branch, depth - point.depth), ...points.slice(end)];
};

const previousSibling = (points, index) => {
  const { depth } = points[index];
  for (let at = index - 1; at >= 0; at -= 1) {
    if (points[at].depth === depth) return at;
    if (points[at].depth < depth) return -1;
  }
  return -1;
};

/** Swap a branch with the sibling branch above or below it. */
export const moveBranch = (points, index, direction) => {
  if (!points[index]) return points;
  const end = branchEnd(points, index);
  if (direction === 'up') {
    const above = previousSibling(points, index);
    if (above < 0) return points;
    return [...points.slice(0, above), ...points.slice(index, end), ...points.slice(above, index), ...points.slice(end)];
  }
  if (points[end]?.depth !== points[index].depth) return points;
  const belowEnd = branchEnd(points, end);
  return [...points.slice(0, index), ...points.slice(end, belowEnd), ...points.slice(index, end), ...points.slice(belowEnd)];
};

/** Drop a branch just before another point, at that point's depth, or at the end. */
export const dropBranch = (points, from, before) => {
  const end = branchEnd(points, from);
  if (before >= from && before < end) return points;
  const branch = points.slice(from, end);
  const rest = [...points.slice(0, from), ...points.slice(end)];
  const at = before >= end ? before - branch.length : before;
  const depth = at < rest.length ? rest[at].depth : 0;
  const moved = shifted(branch, depth - branch[0].depth);
  if (moved.some(point => point.depth > MAX_DEPTH)) return points;
  return [...rest.slice(0, at), ...moved, ...rest.slice(at)];
};

/** Enter: a new point under an open point that has children, otherwise after its branch. */
export const addPoint = (points, index, point) => {
  const current = points[index];
  if (!current) return { points: [...points, { ...point, depth: 0 }], index: points.length };
  const under = hasChildren(points, index) && !current.folded;
  const at = under ? index + 1 : branchEnd(points, index);
  const next = { ...point, depth: under ? current.depth + 1 : current.depth };
  return { points: [...points.slice(0, at), next, ...points.slice(at)], index: at };
};

/** Backspace on an empty point. One with children stays, so nothing under it is lost. */
export const removePoint = (points, index) => (
  hasChildren(points, index) ? points : [...points.slice(0, index), ...points.slice(index + 1)]
);

export const toggleFold = (points, index) => (hasChildren(points, index)
  ? points.map((point, at) => (at === index ? { ...point, folded: !point.folded } : point))
  : points);

const textNode = text => (text ? [{ type: 'text', text }] : []);

/* Writing a branch out: the point becomes a heading, and every point under it
   comes into the draft in pencil, to be written over. The point remembers the
   heading, so the outline knows it is in the draft. */
export const writeOut = (points, index, createId) => {
  const root = points[index];
  if (!root?.text.trim()) return null;
  const blockId = root.blockId || createId();
  const nodes = [
    { type: 'heading', attrs: { level: root.depth ? 3 : 2, blockId }, content: textNode(root.text.trim()) },
    ...points.slice(index + 1, branchEnd(points, index))
      .filter(point => point.text.trim())
      .map(point => ({ type: 'paragraph', attrs: { blockId: createId(), pencil: true }, content: textNode(point.text.trim()) }))
  ];
  return { nodes, points: points.map((point, at) => (at === index ? { ...point, blockId } : point)) };
};

const escape = value => String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

/** The same write-out as HTML, for dragging a point onto the page. */
export const writtenHtml = nodes => nodes.map(node => {
  const tag = node.type === 'heading' ? `h${node.attrs.level}` : 'p';
  const pencil = node.attrs.pencil ? ' data-pencil=""' : '';
  return `<${tag} data-block-id="${escape(node.attrs.blockId)}"${pencil}>${escape(node.content[0]?.text || '')}</${tag}>`;
}).join('');
