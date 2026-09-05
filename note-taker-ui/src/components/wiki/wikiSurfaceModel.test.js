import {
  buildWikiFrontSurfaceDescriptor,
  buildWikiSurfaceDescriptor,
  wikiProjectionForPage
} from './wikiSurfaceModel';

describe('wiki surface model', () => {
  it('keeps ordinary pages article-first while preserving exact page, revision, and claim identity', () => {
    expect(buildWikiSurfaceDescriptor({
      page: { _id: 'page-1', title: 'Compound interest', pageType: 'topic' },
      pageId: 'ignored',
      revisionId: 'revision-1',
      acceptedRevisionId: 'accepted-1',
      claimId: 'claim-1'
    })).toEqual(expect.objectContaining({
      room: 'wiki',
      objectType: 'wiki_claim',
      objectId: 'claim-1',
      pageId: 'page-1',
      revisionId: 'revision-1',
      acceptedRevisionId: 'accepted-1',
      claimId: 'claim-1',
      title: 'Compound interest',
      projection: 'ordinary'
    }));
  });

  it('lets an opened sentence rebind the claim without inventing an accepted revision', () => {
    expect(buildWikiSurfaceDescriptor({
      page: { _id: 'page-1', title: 'Compute will remain scarce.' },
      pageId: 'page-1',
      claimId: 'claim-compute',
      revisionId: 'revision-1',
      acceptedRevisionId: 'accepted-1'
    })).toEqual(expect.objectContaining({
      objectType: 'wiki_claim',
      objectId: 'claim-compute',
      claimId: 'claim-compute',
      revisionId: 'revision-1',
      acceptedRevisionId: 'accepted-1'
    }));
  });

  it.each([
    [{ pageType: 'repo' }, 'repo_dossier'],
    [{ investmentDossier: { version: 1 } }, 'investment_dossier'],
    [{ createdFrom: { label: 'this-week-in-ai:2026-08-17' } }, 'research_edition'],
    [{ createdFrom: { label: 'company-dossier:COST' } }, 'company_dossier'],
    [{ judgment: { kind: 'living_thesis' } }, 'living_thesis'],
    [{ pageType: 'topic' }, 'ordinary']
  ])('preserves the specialized projection for %p', (page, projection) => {
    expect(wikiProjectionForPage(page)).toBe(projection);
  });

  it('names the empty workspace and Morning Paper without inventing a page identity', () => {
    expect(buildWikiSurfaceDescriptor({ view: 'list' })).toEqual(expect.objectContaining({
      objectType: 'wiki_workspace',
      objectId: 'list',
      pageId: '',
      title: 'Wiki pages',
      projection: 'workspace'
    }));
    expect(buildWikiFrontSurfaceDescriptor()).toEqual(expect.objectContaining({
      objectType: 'wiki_front',
      objectId: 'morning-paper',
      projection: 'morning_paper'
    }));
  });
});
