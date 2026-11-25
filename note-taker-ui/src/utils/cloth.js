const CLOTHS = 6;

/* A book's cloth, the same every visit: a name always wears the same colour. */
export const clothOf = (name = '') => {
  const hash = [...String(name)].reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) >>> 0, 7);
  return `var(--noeis-cloth-${(hash % CLOTHS) + 1})`;
};
