// A name matched as the reader wrote it, in any case: their words, never a pattern.
/** @param {unknown} [value] */
const escapeRegExp = (value = '') => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** @param {unknown} name */
const sameName = name => new RegExp(`^${escapeRegExp(name)}$`, 'i');

module.exports = { escapeRegExp, sameName };
