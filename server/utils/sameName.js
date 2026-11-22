// A name matched as the reader wrote it, in any case: their words, never a pattern.
const escapeRegExp = (value = '') => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sameName = name => new RegExp(`^${escapeRegExp(name)}$`, 'i');

module.exports = { escapeRegExp, sameName };
