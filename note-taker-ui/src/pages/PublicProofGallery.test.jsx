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
  proofGrade,
  maintenanceProof = {},
  page = {}
}) => ({
  slot,
  label,
  description,
  publicUrl,
  proofGrade,
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
      proofGrade: {
        grade: 'acceptance_in_progress',
        label: 'Acceptance In Progress',
        reason: 'The object remains under editorial and maintenance acceptance.',
        criteria: { explicitlyAccepted: false, acceptedVersion: false, materialEvent: true, sourceGrounded: true }
      },
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
      proofGrade: { grade: 'illustrative', label: 'Illustrative', reason: 'Example only.', criteria: {} },
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
      proofGrade: { grade: 'illustrative', label: 'Illustrative', reason: 'Example only.', criteria: {} },
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
      proofGrade: { grade: 'illustrative', label: 'Illustrative', reason: 'Example only.', criteria: {} },
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
      proofGrade: { grade: 'illustrative', label: 'Illustrative', reason: 'Example only.', criteria: {} },
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
      proofGrade: {
        grade: 'candidate',
        label: 'Candidate',
        reason: 'Claim-level maintenance has not passed public-proof acceptance.',
        comparisonUrl: '/share/wiki/note-taker-3-repo/comparison',
        criteria: { explicitlyAccepted: false, acceptedVersion: true, materialEvent: true, sourceGrounded: true }
      },
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

  it('renders an honest candidate state without distributing the unaccepted Alphabet dossier', async () => {
    render(
      <MemoryRouter initialEntries={['/proof']}>
        <PublicProofGallery />
      </MemoryRouter>
    );

    expect(screen.getByRole('status')).toHaveTextContent('Resolving accepted proof');
    expect(await screen.findByRole('heading', { name: 'Watch trusted knowledge survive a changing source.' })).toBeInTheDocument();
    expect(getPublicProofRegistry).toHaveBeenCalledTimes(1);
    await screen.findByRole('heading', { name: 'Noeis GitHub repo wiki' });

    expect(screen.queryByRole('link', { name: /Alphabet is Berkshire Hathaway/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Alphabet is Berkshire Hathaway/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Alphabet is Berkshire Hathaway 2\.0 · Acceptance In Progress/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Noeis GitHub repo wiki' })).toBeInTheDocument();
    [
      'Margin of Safety in Value Investing',
      'Circle of Competence',
      'AI infrastructure market map',
      'Will agent evals outpace model releases?'
    ].forEach((title) => expect(screen.queryByRole('link', { name: title })).not.toBeInTheDocument());

    expect(screen.getByRole('link', { name: 'Inspect the maintenance proof' })).toHaveAttribute(
      'href',
      '/share/wiki/note-taker-3-repo/comparison'
    );
    expect(screen.getByRole('link', { name: 'Read maintained wiki' })).toHaveAttribute('href', '/share/wiki/note-taker-3-repo');
    expect(screen.getByRole('heading', { name: 'No object meets the flagship bar yet.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Promising is not the same as proven.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Broad examples are not public proof.' })).toBeInTheDocument();
    expect(screen.getByText(/No material accepted change has been demonstrated/i)).toBeInTheDocument();
    expect(screen.queryByText(/Used server\//i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Proven$/i)).not.toBeInTheDocument();
    expect(screen.getByText(PUBLIC_PROOF_PRIVACY_STATEMENT)).toBeInTheDocument();
    expect(screen.getAllByText(/Maintained by the owner's agent/i)).toHaveLength(1);
  });

  it('opts the long-form public route into document scrolling and cleans up', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/proof']}><PublicProofGallery /></MemoryRouter>
    );
    expect(document.documentElement).toHaveClass('noeis-public-share');
    expect(document.body).toHaveClass('noeis-public-share');
    expect(document.querySelector('.public-proof-gallery')).toBeInTheDocument();
    unmount();
    expect(document.documentElement).not.toHaveClass('noeis-public-share');
    expect(document.body).not.toHaveClass('noeis-public-share');
  });

  it('does not invent maintenance events when optional fields are missing', async () => {
    getPublicProofRegistry.mockResolvedValue({
      items: [
        proofItem({
          slot: 'alphabet',
          label: 'Company dossier',
          title: 'Alphabet is Berkshire Hathaway 2.0',
          description: 'A company dossier in acceptance.',
          publicUrl: '/share/wiki/alphabet',
          proofGrade: {
            grade: 'acceptance_in_progress',
            label: 'Acceptance In Progress',
            reason: 'Still under acceptance.',
            criteria: {}
          },
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

    expect(await screen.findByText(/Alphabet is Berkshire Hathaway 2\.0 · Acceptance In Progress/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Alphabet is Berkshire/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Updated/i)).not.toBeInTheDocument();
  });

  it('renders a flagship only for an explicit proven proofGrade', async () => {
    const payload = registryPayload();
    const repo = payload.items.find((item) => item.slot === 'noeis-repo-wiki');
    repo.proofGrade = {
      grade: 'proven',
      label: 'Proven',
      reason: 'Explicitly accepted source-to-claim maintenance event.',
      acceptedAt: '2026-07-12T12:00:00.000Z',
      comparisonUrl: '/share/wiki/note-taker-3-repo/comparison',
      criteria: { explicitlyAccepted: true, acceptedVersion: true, materialEvent: true, sourceGrounded: true }
    };
    getPublicProofRegistry.mockResolvedValue(payload);

    render(<MemoryRouter initialEntries={['/proof']}><PublicProofGallery /></MemoryRouter>);

    expect(await screen.findByRole('region', { name: 'Flagship proof' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'One accepted maintenance loop.' })).toBeInTheDocument();
    expect(screen.getAllByText('Proven').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Inspect the maintenance proof' })).toHaveAttribute(
      'href',
      '/share/wiki/note-taker-3-repo/comparison'
    );
  });

  it('removes the stale Alphabet acceptance notice after Alphabet becomes proven', async () => {
    const payload = registryPayload();
    const alphabet = payload.items.find((item) => item.slot === 'alphabet-dossier');
    alphabet.proofGrade = {
      grade: 'proven',
      label: 'Proven',
      reason: 'The authoritative SEC filing clock passed editorial acceptance.',
      acceptedAt: '2026-07-16T12:00:00.000Z',
      comparisonUrl: '',
      criteria: {
        explicitlyAccepted: true,
        acceptedVersion: true,
        materialEvent: true,
        sourceGrounded: true,
        requiredClocks: { secEdgar: true },
        optionalClocks: { earningsTranscript: false }
      }
    };
    getPublicProofRegistry.mockResolvedValue(payload);

    render(<MemoryRouter initialEntries={['/proof']}><PublicProofGallery /></MemoryRouter>);

    expect(await screen.findByRole('region', { name: 'Flagship proof' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Acceptance in progress' })).not.toBeInTheDocument();
    expect(screen.queryByText('Promising is not the same as proven.')).not.toBeInTheDocument();
  });

  it('does not create a false flagship from GitHub metadata when proofGrade is missing', async () => {
    const payload = registryPayload();
    const repo = payload.items.find((item) => item.slot === 'noeis-repo-wiki');
    delete repo.proofGrade;
    getPublicProofRegistry.mockResolvedValue(payload);

    render(<MemoryRouter initialEntries={['/proof']}><PublicProofGallery /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'No object meets the flagship bar yet.' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Flagship proof' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Noeis GitHub repo wiki' })).not.toBeInTheDocument();
  });

  it('keeps the page useful when the registry is unavailable', async () => {
    getPublicProofRegistry.mockRejectedValue(new Error('not ready'));

    render(
      <MemoryRouter initialEntries={['/proof']}>
        <PublicProofGallery />
      </MemoryRouter>
    );

    expect(await screen.findByText(/proof registry is temporarily unavailable/i)).toBeInTheDocument();
  });

  it('emits CollectionPage JSON-LD with maintenance dates and citations', async () => {
    render(
      <MemoryRouter initialEntries={['/proof']}>
        <PublicProofGallery />
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: 'Noeis GitHub repo wiki' });
    await waitFor(() => expect(document.title).toBe('Living Research Dossiers | Noeis'));
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.noeis.io/proof');
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');

    const schema = JSON.parse(document.getElementById('seo-schema').textContent);
    expect(schema).toEqual(expect.objectContaining({
      '@type': 'CollectionPage',
      name: 'Living Research Dossiers',
      mainEntityOfPage: 'https://www.noeis.io/proof'
    }));
    expect(schema.mainEntity.numberOfItems).toBe(1);
    expect(schema.mainEntity.itemListElement[0]).toEqual(expect.objectContaining({
      '@type': 'ListItem',
      position: 1,
      name: 'Noeis GitHub repo wiki',
      url: 'https://www.noeis.io/share/wiki/note-taker-3-repo'
    }));
    expect(schema.mainEntity.itemListElement.map(item => item.name)).not.toContain('Alphabet is Berkshire Hathaway 2.0');
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
