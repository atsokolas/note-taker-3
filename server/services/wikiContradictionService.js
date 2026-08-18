// Contradiction as a view, not a tag.
//
// A claim the library disagrees about used to be a colour on a citation and a
// heading inside one article: you had to already be reading the right page to
// find out that two things you read do not agree. That is a label, and a label
// is something you scroll past. This collects them into a place — every claim
// in the wiki where a source supports it and another source argues with it,
// with both passages and both publications, so the disagreement can be read as
// a disagreement rather than inferred from a colour.
//
// Nothing here is generated. Both sides are quotes the library already stored;
// if a side has no passage, the source is still named, because "who disagrees"
// is worth knowing even when the quote was never captured.

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const idOf = (value) => clean(value?._id || value?.id || value);

const CONFLICTED = 'conflicted';

/** One side of a disagreement: who said it, what they said, where to read it. */
const sideFrom = ({ citation, sourceRef }) => {
  const title = clean(citation?.sourceTitle) || clean(sourceRef?.title);
  const quote = clean(citation?.quote) || clean(sourceRef?.snippet);
  const url = clean(citation?.url) || clean(sourceRef?.url);
  if (!title && !quote) return null;
  return {
    sourceId: idOf(sourceRef) || idOf(citation?.sourceRefId),
    title: title || 'Untitled source',
    quote,
    url
  };
};

const dedupeSides = (sides) => {
  const seen = new Set();
  return sides.filter((side) => {
    const key = `${side.title}::${side.quote}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/* A claim is in contradiction when something in the library argues with it.
   Not when it is merely unsupported, and not when it carries the label without
   anything behind it — a tag with no passage on the other side is the thing
   this view exists to stop being enough. */
const contradictionsOnPage = (page) => {
  const citations = list(page?.claims).length ? list(page?.citations) : [];
  const citationById = new Map(citations.map(citation => [idOf(citation), citation]));
  const sourceById = new Map(list(page?.sourceRefs).map(ref => [idOf(ref), ref]));

  return list(page?.claims)
    .map((claim) => {
      const contradictingIds = list(claim?.contradictedByCitationIds).map(idOf).filter(Boolean);
      if (!contradictingIds.length) return null;

      const contradicting = dedupeSides(contradictingIds
        .map((citationId) => {
          const citation = citationById.get(citationId);
          if (!citation) return null;
          return sideFrom({ citation, sourceRef: sourceById.get(idOf(citation.sourceRefId)) });
        })
        .filter(Boolean));
      if (!contradicting.length) return null;

      const contradictingSourceIds = new Set(contradicting.map(side => side.sourceId).filter(Boolean));
      const supporting = dedupeSides(list(claim?.sourceRefIds)
        .map(idOf)
        .filter(sourceId => sourceId && !contradictingSourceIds.has(sourceId))
        .map((sourceId) => {
          const sourceRef = sourceById.get(sourceId);
          const citation = citations.find(item => idOf(item?.sourceRefId) === sourceId
            && !contradictingIds.includes(idOf(item)));
          return sideFrom({ citation, sourceRef });
        })
        .filter(Boolean));

      return {
        pageId: idOf(page),
        pageTitle: clean(page?.title),
        pageSlug: clean(page?.slug),
        claimId: clean(claim?.claimId),
        claimText: clean(claim?.text),
        section: clean(claim?.section),
        /* The label is reported, not trusted: a claim can carry both sides and
           never have been marked, and the view would rather show the
           disagreement than wait for the tag to catch up. */
        labelled: clean(claim?.support) === CONFLICTED,
        supporting,
        contradicting,
        updatedAt: page?.updatedAt || null
      };
    })
    .filter(Boolean)
    .filter(item => item.claimText);
};

/** Every disagreement in the wiki, newest page first. */
const collectContradictions = (pages = []) => list(pages)
  .flatMap(contradictionsOnPage)
  .sort((left, right) => (new Date(right.updatedAt || 0).getTime() || 0) - (new Date(left.updatedAt || 0).getTime() || 0));

module.exports = { collectContradictions, contradictionsOnPage };
