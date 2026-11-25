const crypto = require('crypto');

const SAYS_KEPT = 500;

/* The one reading every connection Noeis draws passes before it is offered.
   Each pair is { about, a, b }: about names the pair ("from>to"), a and b
   are { who, says }. The model says whether a bears on b, argues with it,
   or only shares its words, and the answer is kept by what the pair is
   about with the words it read, so no pair is read twice and a pair whose
   words were edited since is read again. A kept argument without a's side
   is read again, so it can say what it argues. A pair the model could not read this
   time is left out, and read next time. */
const wordsOf = ({ a, b }) => crypto.createHash('sha1').update(`${a.says}\n\n${b.says}`).digest('hex');

const judged = async ({ userId, pairs, models: { ConnectionJudgment }, judge }) => {
  if (!pairs.length) return new Map();
  const kept = await ConnectionJudgment.find({ userId, about: { $in: pairs.map(pair => pair.about) }, relation: { $exists: true } })
    .select('about relation says read').lean();
  const words = new Map(pairs.map(pair => [pair.about, wordsOf(pair)]));
  const known = new Map(kept
    .filter(row => row.read === words.get(row.about) && (row.relation !== 'argues' || row.says))
    .map(row => [row.about, row]));
  const unread = pairs.filter(pair => !known.has(pair.about));
  if (!unread.length) return known;
  const read = await judge({ pairs: unread }).catch((error) => {
    console.warn('[judged] reading failed', String(error?.message || error).slice(0, 160));
    return [];
  });
  const rows = read.map(({ index, relation, a }) => ({
    userId,
    about: unread[index].about,
    read: words.get(unread[index].about),
    relation,
    says: relation === 'argues' ? (a || unread[index].a.says.split('\n')[0]).slice(0, SAYS_KEPT) : ''
  }));
  if (rows.length) {
    await ConnectionJudgment.bulkWrite(rows.map(row => ({ updateOne: { filter: { userId, about: row.about }, update: { $set: row }, upsert: true } })));
  }
  rows.forEach(row => known.set(row.about, row));
  return known;
};

// What the model kept: it bears, or it argues.
const holds = judgment => Boolean(judgment) && judgment.relation !== 'none';

module.exports = { judged, holds };
