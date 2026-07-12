import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import PublicProofGallery, { buildPublicProofGallerySchema } from './PublicProofGallery';
import { getPublicProofRegistry } from '../api/wiki';
import { PUBLIC_PROOF_PRIVACY_STATEMENT } from '../utils/maintenanceProof';

jest.mock('../api/wiki', () => ({
  getPublicProofRegistry: jest.fn()
}));

const proofItem = ({
  slot,
  label,
  title,
  description,
  publicUrl,
  maintenanceProof = {},
  page = {}
}) => ({
  slot,
  label,
  description,
  publicUrl,
  page: {
    _id: `${slot}-id`,
    title,
    slug: slot,
    plainText: description,
    sourceRefs: [{ title: `${title} source`, url: `https://example.com/${slot}` }],
    ...page
  },
  maintenanceProof
});

const registryPayload = () => ({
  privacyStatement: PUBLIC_PROOF_PRIVACY_STATEMENT,
  homepageCta: {
    href: '/share/wiki/alphabet-berkshire-2-0',
    title: 'Alphabet is Berkshire Hathaway 2.0'
  },
  items: [
    proofItem({
      slot: 'alphabet-dossier',
      label: 'Investing dossier',
      title: 'Alphabet is Berkshire Hathaway 2.0',
      description: 'A maintained company dossier.',
      publicUrl: '/share/wiki/alphabet-berkshire-2-0',
      maintenanceProof: {
        clock: { type: 'sec_edgar', label: 'SEC EDGAR filings' },
        currentThrough: { label: '10-Q filed Jul 1, 2026', at: '2026-07-01T00:00:00.000Z' },
        lastReviewedAt: '2026-07-04T00:00:00.000Z',
        latestMaterialEvent: {
          type: 'filing',
          summary: 'Accepted 10-Q maintenance',
          at: '2026-07-02T00:00:00.000Z'
        },
        sourceCount: 8,
        claimCount: 12
      }
    }),
    proofItem({
      slot: 'margin-of-safety',
      label: 'Concept dossier',
      title: 'Margin of Safety in Value Investing',
      description: 'A maintained concept dossier.',
      publicUrl: '/share/wiki/margin-of-safety',
      maintenanceProof: {
        clock: { type: 'reading', label: 'Reading and source events' },
        lastReviewedAt: '2026-07-03T00:00:00.000Z',
        sourceCount: 4,
        claimCount: 6
      }
    }),
    proofItem({
      slot: 'circle-of-competence',
      label: 'Concept dossier',
      title: 'Circle of Competence',
      description: 'A maintained concept dossier.',
      publicUrl: '/share/wiki/circle-of-competence',
      maintenanceProof: {
        clock: { type: 'reading', label: 'Reading and source events' },
        lastReviewedAt: '2026-07-02T00:00:00.000Z',
        sourceCount: 3,
        claimCount: 5
      }
    }),
    proofItem({
      slot: 'ai-market-map',
      label: 'Technology map',
      title: 'AI infrastructure market map',
      description: 'A maintained market map.',
      publicUrl: '/share/wiki/ai-infrastructure-market-map',
      maintenanceProof: {
        clock: { type: 'manual', label: 'Manual review' },
        lastReviewedAt: '2026-07-01T00:00:00.000Z',
        sourceCount: 5,
        claimCount: 7
      }
    }),
    proofItem({
      slot: 'live-question',
      label: 'Question cluster',
      title: 'Will agent evals outpace model releases?',
      description: 'A live question page.',
      publicUrl: '/share/wiki/agent-evals-question',
      maintenanceProof: {
        clock: { type: 'reading', label: 'Evidence and contradiction checks' },
        lastReviewedAt: '2026-06-30T00:00:00.000Z',
        sourceCount: 2,
        claimCount: 4
      }
    }),
    proofItem({
      slot: 'noeis-repo-wiki',
      label: 'Repo dossier',
      title: 'Noeis GitHub repo wiki',
      description: 'A maintained repository dossier.',
      publicUrl: '/share/wiki/note-taker-3-repo',
      maintenanceProof: {
        clock: { type: 'github', label: 'GitHub releases and HEAD' },
        currentThrough: { label: 'commit abc1234', at: '2026-07-05T00:00:00.000Z' },
        lastReviewedAt: '2026-07-05T00:00:00.000Z',
        latestMaterialEvent: {
          type: 'repo_head',
          summary: 'Accepted repo head refresh',
          at: '2026-07-05T00:00:00.000Z'
        },
        sourceCount: 14,
        claimCount: 18
      }
    })
  ]
});

describe('PublicProofGallery', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    getPublicProofRegistry.mockResolvedValue(registryPayload());
  });

  it('renders six individual proof objects in supplied order with maintenance stamps', async () => {
    render(
      <MemoryRouter initialEntries={['/proof']}>
        <PublicProofGallery />
      </MemoryRouter>
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading public proof pages');
    expect(await screen.findByRole('heading', { name: 'Living research dossiers, not generated pages.' })).toBeInTheDocument();
    expect(getPublicProofRegistry).toHaveBeenCalledTimes(1);
    await screen.findByRole('heading', { name: 'Alphabet is Berkshire Hathaway 2.0' });

    const titles = [
      'Alphabet is Berkshire Hathaway 2.0',
      'Margin of Safety in Value Investing',
      'Circle of Competence',
      'AI infrastructure market map',
      'Will agent evals outpace model releases?',
      'Noeis GitHub repo wiki'
    ];
    titles.forEach((title) => {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    });

    expect(screen.getAllByRole('link', { name: 'Open public dossier' })).toHaveLength(6);
    expect(screen.getAllByRole('link', { name: 'Open public dossier' })[0]).toHaveAttribute(
      'href',
      '/share/wiki/alphabet-berkshire-2-0'
    );
    expect(screen.getAllByRole('link', { name: 'Open public dossier' })[5]).toHaveAttribute(
      'href',
      '/share/wiki/note-taker-3-repo'
    );

    expect(screen.getAllByText('Current through').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('10-Q filed Jul 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('Accepted 10-Q maintenance · Jul 2, 2026')).toBeInTheDocument();
    expect(screen.getByText(PUBLIC_PROOF_PRIVACY_STATEMENT)).toBeInTheDocument();
    expect(screen.getAllByText(/Maintained by the owner's agent/i)).toHaveLength(6);
  });

  it('does not invent maintenance events when optional fields are missing', async () => {
    getPublicProofRegistry.mockResolvedValue({
      items: [
        proofItem({
          slot: 'margin-of-safety',
          label: 'Concept dossier',
          title: 'Margin of Safety in Value Investing',
          description: 'A maintained concept dossier.',
          publicUrl: '/share/wiki/margin-of-safety',
          maintenanceProof: {
            clock: { type: 'reading', label: 'Reading and source events' },
            lastReviewedAt: '2026-07-03T00:00:00.000Z',
            sourceCount: 4,
            claimCount: 6
          }
        })
      ]
    });

    render(
      <MemoryRouter initialEntries={['/proof']}>
        <PublicProofGallery />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Margin of Safety in Value Investing' })).toBeInTheDocument();
    expect(screen.getByText('No accepted maintenance event yet')).toBeInTheDocument();
    expect(screen.queryByText(/Updated/i)).not.toBeInTheDocument();
  });

  it('keeps the page useful when the registry is unavailable', async () => {
    getPublicProofRegistry.mockRejectedValue(new Error('not ready'));

    render(
      <MemoryRouter initialEntries={['/proof']}>
        <PublicProofGallery />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Public proof pages are being curated/i)).toBeInTheDocument();
  });

  it('emits CollectionPage JSON-LD with maintenance dates and citations', async () => {
    render(
      <MemoryRouter initialEntries={['/proof']}>
        <PublicProofGallery />
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: 'Alphabet is Berkshire Hathaway 2.0' });
    await waitFor(() => expect(document.title).toBe('Living Research Dossiers | Noeis'));
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.noeis.io/proof');
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');

    const schema = JSON.parse(document.getElementById('seo-schema').textContent);
    expect(schema).toEqual(expect.objectContaining({
      '@type': 'CollectionPage',
      name: 'Living Research Dossiers',
      mainEntityOfPage: 'https://www.noeis.io/proof'
    }));
    expect(schema.mainEntity.numberOfItems).toBe(6);
    expect(schema.mainEntity.itemListElement[0]).toEqual(expect.objectContaining({
      '@type': 'ListItem',
      position: 1,
      name: 'Alphabet is Berkshire Hathaway 2.0',
      url: 'https://www.noeis.io/share/wiki/alphabet-berkshire-2-0',
      dateReviewed: '2026-07-04T00:00:00.000Z',
      citation: [
        expect.objectContaining({
          '@type': 'CreativeWork',
          name: 'Alphabet is Berkshire Hathaway 2.0 source',
          url: 'https://example.com/alphabet-dossier'
        })
      ]
    }));
  });
});

describe('buildPublicProofGallerySchema', () => {
  it('builds CollectionPage schema for public proof dossiers', () => {
    const schema = buildPublicProofGallerySchema([
      {
        title: 'Alphabet is Berkshire Hathaway 2.0',
        href: '/share/wiki/alphabet-berkshire-2-0',
        description: 'Maintained company dossier.',
        maintenanceProof: { lastReviewedAt: '2026-07-04T00:00:00.000Z' },
        page: {
          sourceRefs: [{ title: 'SEC filing', url: 'https://example.com/filing' }]
        }
      }
    ]);

    expect(schema).toEqual(expect.objectContaining({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      url: 'https://www.noeis.io/proof',
      isAccessibleForFree: true
    }));
    expect(schema.mainEntity.itemListElement[0]).toEqual(expect.objectContaining({
      '@type': 'ListItem',
      position: 1,
      name: 'Alphabet is Berkshire Hathaway 2.0',
      url: 'https://www.noeis.io/share/wiki/alphabet-berkshire-2-0',
      dateReviewed: '2026-07-04T00:00:00.000Z',
      citation: [
        expect.objectContaining({
          '@type': 'CreativeWork',
          name: 'SEC filing',
          url: 'https://example.com/filing'
        })
      ]
    }));
  });
});
