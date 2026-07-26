import {
  NO_ACCEPTED_MAINTENANCE_EVENT_COPY,
  PUBLIC_PROOF_PRIVACY_STATEMENT,
  buildMaintenanceStampFacts,
  normalizePublicProofRegistry,
  pagePublicPath
} from './maintenanceProof';

describe('maintenanceProof utils', () => {
  it('normalizes registry order and homepage CTA', () => {
    const registry = normalizePublicProofRegistry({
      homepageCta: { href: '/share/wiki/alphabet-berkshire-2-0' },
      items: [
        {
          slot: 'alphabet',
          label: 'Investing dossier',
          publicUrl: '/share/wiki/alphabet-berkshire-2-0',
          page: { title: 'Alphabet is Berkshire Hathaway 2.0' }
        }
      ]
    });

    expect(registry.homepageCta.href).toBe('/share/wiki/alphabet-berkshire-2-0');
    expect(registry.items[0].href).toBe('/share/wiki/alphabet-berkshire-2-0');
    expect(registry.privacyStatement).toBe(PUBLIC_PROOF_PRIVACY_STATEMENT);
  });

  it('derives a resolved registry from an explicit proven object', () => {
    const registry = normalizePublicProofRegistry({
      complete: false,
      slotCoverageComplete: false,
      items: [{
        slot: 'nvidia',
        publicUrl: '/share/wiki/nvidia',
        proofGrade: { grade: 'proven', label: 'Proven', criteria: {} },
        page: { title: 'NVIDIA dossier' }
      }]
    });

    expect(registry.registryState).toBe('resolved');
    expect(registry.provenCount).toBe(1);
    expect(registry.slotCoverageComplete).toBe(false);
  });

  it('builds honest unavailable copy for missing material events', () => {
    const facts = buildMaintenanceStampFacts({
      clock: { label: 'Reading and source events' },
      lastReviewedAt: '2026-07-03T00:00:00.000Z'
    });

    expect(facts).toEqual(expect.arrayContaining([
      { label: 'Latest material event', value: NO_ACCEPTED_MAINTENANCE_EVENT_COPY }
    ]));
  });

  it('resolves public paths from page ids and slugs', () => {
    expect(pagePublicPath({ slug: 'margin-of-safety' })).toBe('/share/wiki/margin-of-safety');
    expect(pagePublicPath({}, '/share/wiki/circle-of-competence')).toBe('/share/wiki/circle-of-competence');
  });
});
