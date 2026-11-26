const { readKept } = require('./home');
const { judged } = require('./judged');
const { claimTerms, matchedTerms } = require('./judgmentEvidenceService');

/* Something you kept argues with a view you hold. Gate: only passages on
   Kept, never everything you skimmed, against the views you hold, paired
   when the passage shares two of the view's key words; the closest
   PAIRS_READ pairs are read, each pair once ever (judged.js). Bar: the model
   says the two cannot both be true, and you have not struck that pairing.
   Silence: when nothing argues, nothing is said. At most one line. */

const PAIRS_READ = 6;
const SHARED_TERMS = 2;

const aboutOf = (view, mark) => `view:${view._id}>highlight:${mark.highlightId}`;
const ARGUES_ABOUT = /^view:[a-f\d]{24}>highlight:[a-f\d]{24}$/;

const keptArgues = async ({ userId, models: { Article, WikiPage, ConnectionJudgment, Verdict }, judge }) => {
  const [kept, views] = await Promise.all([
    readKept({ Article, userId }),
    WikiPage.find({ userId, status: { $ne: 'archived' }, 'judgment.currentJudgment': { $gt: '' } }).select('title judgment.currentJudgment').lean()
  ]);
  const marks = kept.filter(held => held.kind === 'mark' && held.text);
  const close = views.flatMap(view => {
    const terms = claimTerms(view.judgment.currentJudgment);
    return marks.map(mark => ({ view, mark, shared: matchedTerms(mark.text, terms).length }));
  }).filter(pair => pair.shared >= SHARED_TERMS).sort((a, b) => b.shared - a.shared);
  if (!close.length) return null;
  const struck = new Set((await Verdict.find({ userId, kind: 'connection', verdict: 'strike', about: { $in: close.map(({ view, mark }) => aboutOf(view, mark)) } }).select('about').lean()).map(row => row.about));
  const asked = close.filter(({ view, mark }) => !struck.has(aboutOf(view, mark))).slice(0, PAIRS_READ);
  const read = await judged({
    userId,
    judge,
    models: { ConnectionJudgment },
    pairs: asked.map(({ view, mark }) => ({
      about: aboutOf(view, mark),
      a: { who: mark.title || 'a passage you kept', says: mark.text },
      b: { who: 'a view the reader holds', says: view.judgment.currentJudgment }
    }))
  });
  const found = asked.find(({ view, mark }) => read.get(aboutOf(view, mark))?.relation === 'argues');
  if (!found) return null;
  const { view, mark } = found;
  return {
    about: aboutOf(view, mark),
    says: read.get(aboutOf(view, mark)).says,
    view: { id: String(view._id), title: view.title, held: view.judgment.currentJudgment },
    kept: { articleId: mark.articleId, highlightId: mark.highlightId, book: mark.book, title: mark.title, text: mark.text }
  };
};

module.exports = { ARGUES_ABOUT, keptArgues };
