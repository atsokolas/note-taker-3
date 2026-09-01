/**
 * Living proof, for the reader rather than the owner.
 *
 * A public casebook already lists what changed since the last accepted
 * edition. That is the owner's clock. It says nothing about whether *you*
 * have seen any of it, so a stranger arriving for the first time and someone
 * who read the case in March are shown exactly the same page.
 *
 * This remembers, in that reader's own browser and nowhere else, the newest
 * change they have already seen. On a return visit the page can say how much
 * is new to them and mark which rows those are.
 *
 * Three rules it does not bend:
 *
 *   A first visit says nothing. There is no "welcome" and no "0 new" - we
 *   have never seen this reader before, and inventing a greeting out of that
 *   is the same lie as reporting an uncounted corpus as empty.
 *
 *   A return visit with nothing new also says nothing. The case did not move;
 *   that is a fact about the case, not an occasion.
 *
 *   Nothing leaves the browser. No account, no beacon, no server write. Stage
 *   4's whole promise is that a public object travels without carrying private
 *   state, and a reader's history is exactly that.
 *
 * Storage can fail - private windows, blocked site data, a browser that
 * throws on access rather than returning null. Every path here treats that as
 * "we do not know this reader", which degrades to the first-visit behaviour:
 * silence.
 */

const KEY_PREFIX = 'noeis:casebook-seen:';

const keyFor = (slug) => {
  const id = String(slug || '').trim();
  return id ? `${KEY_PREFIX}${id}` : '';
};

const time = (value) => {
  // new Date(null) is the epoch, not an error, so an absent value would read
  // as "last seen in 1970" and make every change look new to a first-time
  // reader. Absence is checked before Date gets a say - the same rule the
  // Library count had to learn.
  if (value === null || value === undefined || value === '') return NaN;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? NaN : at.getTime();
};

/** The newest change in this edition, or NaN when there are none. */
const newestAt = (deltas = []) => (Array.isArray(deltas) ? deltas : [])
  .map(row => time(row?.at))
  .filter(at => !Number.isNaN(at))
  .reduce((newest, at) => (Number.isNaN(newest) || at > newest ? at : newest), NaN);

export const readLastSeen = (slug, storage) => {
  const key = keyFor(slug);
  if (!key) return null;
  try {
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    const at = time(store?.getItem(key));
    return Number.isNaN(at) ? null : at;
  } catch (_unreadable) {
    return null;
  }
};

export const rememberSeen = (slug, deltas = [], storage) => {
  const key = keyFor(slug);
  const newest = newestAt(deltas);
  if (!key || Number.isNaN(newest)) return;
  try {
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    store?.setItem(key, new Date(newest).toISOString());
  } catch (_unwritable) {
    // A reader we cannot remember is a reader we greet as new. That is fine.
  }
};

/**
 * What is new to this reader.
 *
 * `ids` are the delta `at` stamps that should be marked, so the caller does
 * not have to redo the comparison per row. `line` is '' whenever there is
 * nothing honest to say.
 */
export const describeReturn = ({ deltas = [], lastSeen = null } = {}) => {
  const rows = (Array.isArray(deltas) ? deltas : []).filter(row => !Number.isNaN(time(row?.at)));
  if (lastSeen === null || !rows.length) return { line: '', ids: [] };

  const fresh = rows.filter(row => time(row.at) > lastSeen);
  if (!fresh.length) return { line: '', ids: [] };

  const count = fresh.length;
  return {
    line: count === 1
      ? 'One change since you were last here.'
      : `${count} changes since you were last here.`,
    ids: fresh.map(row => row.at)
  };
};

export const __testables = { newestAt, keyFor };
