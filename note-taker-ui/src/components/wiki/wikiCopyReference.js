const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const sourceTitles = (sources = []) => (
  (Array.isArray(sources) ? sources : [])
    .map(source => clean(source?.title || source?.url))
    .filter(Boolean)
);

export const wikiRevisionLabel = ({
  page = null,
  revisionId = '',
  proposed = false,
  historical = false
} = {}) => {
  if (proposed) return 'proposed wording · not accepted';
  const id = clean(revisionId);
  const updated = page?.updatedAt ? new Date(page.updatedAt).toISOString() : '';
  const status = clean(page?.status || '');
  const version = id || updated || 'current';
  if (historical) return `earlier version ${version}`;
  if (status && status !== 'published') return `${status} version ${version}`;
  return `current version ${version}`;
};

export const citationOccurrence = ({
  pageId = '',
  revisionId = '',
  claimId = '',
  sourceId = '',
  citationIndex = 0
} = {}) => ({
  pageId: clean(pageId),
  revisionId: clean(revisionId),
  claimId: clean(claimId),
  sourceId: clean(sourceId),
  citationIndex: Number(citationIndex) > 0 ? Number(citationIndex) : 0
});

export const wikiPassageReference = ({
  page = null,
  text = '',
  claimId = '',
  revisionId = '',
  sources = [],
  proposed = false,
  historical = false
} = {}) => {
  const passage = clean(text);
  if (!passage) return '';
  const title = clean(page?.title) || 'Wiki page';
  const version = wikiRevisionLabel({ page, revisionId, proposed, historical });
  const occurrence = citationOccurrence({
    pageId: page?._id || page?.id,
    revisionId,
    claimId
  });
  const cited = sourceTitles(sources !== undefined ? sources : page?.sourceRefs);
  return [
    proposed ? 'PROPOSED — NOT ACCEPTED' : '',
    `“${passage}”`,
    '',
    `${title} — ${version}${occurrence.claimId ? `; passage ${occurrence.claimId}` : ''}.`,
    cited.length ? `Sources: ${cited.join('; ')}` : 'Sources: none attached.'
  ].filter((line, index, rows) => line || (index > 0 && rows[index - 1])).join('\n').trim();
};

export default wikiPassageReference;
