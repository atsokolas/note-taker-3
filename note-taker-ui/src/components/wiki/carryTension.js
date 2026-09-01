import { oneSentence } from '../../pages/judgmentModel';
import { normalizeSpaces } from '../../utils/editorialText';

// Carrying a tension into a judgment.
//
// A tension is the place where two things you have read do not agree. Until
// now it was a heading in an article and a colour on a citation — a label the
// page wore, with nothing to do about it. The only useful thing to do with a
// disagreement is to decide what you think, which is what a judgment page is
// for, so this carries the claim and both sides of it across.

export const contradicts = (source) => source?.evidenceRole === 'contradicts';

/** A claim is in tension when something in the library argues with it. */
export const isTension = (sources = []) => (Array.isArray(sources) ? sources : []).some(contradicts);

/* One reason line per source, in the source's own words. The snippet is what
   the source actually said; its title is who said it. Nothing is written that
   the library did not already contain. */
const reasonFrom = (source) => {
  const label = normalizeSpaces(source?.title);
  const text = oneSentence(normalizeSpaces(source?.snippet)) || label;
  return text ? { text, sourceLabel: label } : null;
};

/** The claim, and the two sides of it, in the shape a judgment holds. */
export const tensionSeed = ({ claim, sources = [], fallbackSentence = '' } = {}) => {
  const sentence = oneSentence(normalizeSpaces(claim?.text) || normalizeSpaces(fallbackSentence));
  if (!sentence || !isTension(sources)) return null;
  return {
    sentence,
    why: sources.filter(source => !contradicts(source)).map(reasonFrom).filter(Boolean),
    against: sources.filter(contradicts).map(reasonFrom).filter(Boolean)
  };
};

/* Creating it is the same two steps the Judgment index takes when you write a
   claim by hand — a wiki page carrying a judgment contract — with the two
   sides already in it, because they were already on the page you came from. */
export const carryTensionToJudgment = async (seed, { createPage, updatePage } = {}) => {
  if (!seed?.sentence) throw new Error('There is no claim to carry.');
  const page = await createPage({ title: seed.sentence, pageType: 'topic' });
  const id = page?._id || page?.id;
  if (!id) throw new Error('The judgment was not created.');
  await updatePage(id, {
    judgment: { currentJudgment: seed.sentence, why: seed.why, against: seed.against }
  });
  return id;
};
