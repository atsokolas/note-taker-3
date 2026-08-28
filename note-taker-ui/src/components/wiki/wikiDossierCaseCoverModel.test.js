import { buildDossierCaseCover } from './wikiDossierCaseCoverModel';

const fact = (cover, id) => cover.facts.find(item => item.id === id);

describe('wikiDossierCaseCoverModel', () => {
  it('makes a pending maintenance candidate the primary research action without changing Judgment', () => {
    const cover = buildDossierCaseCover({
      page: {
        visibility: 'private',
        aiState: { candidateStatus: 'awaiting_maintenance_acceptance' },
        investmentDossier: {
          version: 2,
          valuation: { asOf: '2026-08-20T00:00:00.000Z' },
          lastMaintenanceComparison: {
            version: 1,
            headline: 'The latest 10-Q changed two decision-relevant claims.',
            generatedAt: '2026-08-21T00:00:00.000Z'
          }
        },
        judgment: { kind: 'thesis' },
        externalWatches: {
          edgar: {
            status: 'active',
            forms: ['10-Q', '10-K'],
            lastCheckedAt: '2026-08-22T00:00:00.000Z'
          }
        }
      }
    });

    expect(cover.research.action).toBe('review');
    expect(fact(cover, 'judgment').value).toBe('Tracked as an active case');
    expect(fact(cover, 'change').value).toMatch(/changed two decision-relevant claims/i);
    expect(fact(cover, 'valuation').value).not.toBe('Not dated');
    expect(fact(cover, 'filing').value).toBe('Next 10-Q or 10-K');
    expect(fact(cover, 'visibility').value).toBe('Private');
  });

  it('fails closed when valuation, watch, Judgment, and public readiness are absent', () => {
    const cover = buildDossierCaseCover({
      page: { investmentDossier: { version: 2 }, visibility: 'shared' },
      shareBlocked: true
    });

    expect(fact(cover, 'judgment').value).toBe('Not tracked');
    expect(fact(cover, 'valuation').value).toBe('Not dated');
    expect(fact(cover, 'filing').value).toBe('Not watched');
    expect(fact(cover, 'visibility').value).toBe('Private · sharing blocked');
    expect(fact(cover, 'change').value).toBe('No accepted change yet');
  });

  it('does not describe a failed SEC watcher as continuously watching', () => {
    const cover = buildDossierCaseCover({
      page: {
        investmentDossier: { version: 2 },
        externalWatches: {
          edgar: {
            status: 'error',
            ticker: 'COST',
            lastError: 'The last filing check could not complete.'
          }
        }
      }
    });

    expect(fact(cover, 'filing')).toMatchObject({
      value: 'SEC watch needs attention',
      detail: 'The last filing check could not complete.'
    });
  });
});
