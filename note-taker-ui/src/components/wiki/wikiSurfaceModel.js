const clean = value => String(value || '').trim();

const pageIdentity = (page = {}, fallback = '') => clean(
  page?._id || page?.id || page?.pageId || fallback
);

export const wikiProjectionForPage = (page = null) => {
  if (!page) return 'workspace';
  const createdFrom = clean(page?.createdFrom?.label).toLowerCase();
  const repoWatch = page?.externalWatches?.githubRepo || {};
  if (
    clean(page?.pageType).toLowerCase() === 'repo'
    || clean(page?.repoKey)
    || clean(repoWatch.owner)
    || clean(repoWatch.repo)
    || clean(repoWatch.url)
  ) return 'repo_dossier';
  if (page?.investmentDossier?.version) return 'investment_dossier';
  if (/^(?:weekend-readings|this-week-in-ai):/.test(createdFrom)) return 'research_edition';
  if (
    /^company-dossier:/.test(createdFrom)
    || (clean(page?.externalWatches?.edgar?.ticker) && clean(page?.externalWatches?.edgar?.status).toLowerCase() === 'active')
  ) return 'company_dossier';
  if (page?.judgment?.kind) return 'living_thesis';
  return 'ordinary';
};

export const wikiAllowsOpenSentence = (page, { workspaceMode = false } = {}) => (
  Boolean(page) && !workspaceMode && wikiProjectionForPage(page) === 'ordinary'
);

export const buildWikiSurfaceDescriptor = ({
  page = null,
  pageId = '',
  claimId = '',
  revisionId = '',
  acceptedRevisionId = '',
  mode = 'read',
  view = ''
} = {}) => {
  const safePageId = pageIdentity(page, pageId);
  const safeClaimId = clean(claimId);
  const safeView = clean(view) || 'graph';
  const objectType = safeClaimId
    ? 'wiki_claim'
    : safePageId
      ? 'wiki_page'
      : 'wiki_workspace';
  const objectId = safeClaimId || safePageId || safeView;
  return {
    room: 'wiki',
    objectType,
    objectId,
    title: clean(page?.title) || (safePageId ? 'Wiki page' : safeView === 'list' ? 'Wiki pages' : 'Wiki workspace'),
    pageId: safePageId,
    revisionId: clean(revisionId),
    acceptedRevisionId: clean(acceptedRevisionId),
    claimId: safeClaimId,
    pageType: clean(page?.pageType),
    projection: wikiProjectionForPage(page),
    mode: clean(mode) || 'read',
    view: safePageId ? '' : safeView
  };
};

export const buildWikiFrontSurfaceDescriptor = () => ({
  room: 'wiki',
  objectType: 'wiki_front',
  objectId: 'morning-paper',
  title: 'Your living wikis',
  projection: 'morning_paper',
  mode: 'read'
});

export default buildWikiSurfaceDescriptor;
