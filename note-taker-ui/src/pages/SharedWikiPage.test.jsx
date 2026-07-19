import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import SharedWikiPage, {
  buildSharedWikiSchema,
  isPublicRepoWikiPage,
  publicRepoGitHubLabel,
  publicRepoPublishedHead
} from './SharedWikiPage';
import { adoptPublicWikiPage, getPublicWikiComparison, getPublicWikiPage } from '../api/wiki';
import { trackSharedWikiAdoptClicked, trackSharedWikiViewed } from '../utils/marketingAnalytics';
import { PUBLIC_PROOF_PRIVACY_STATEMENT } from '../utils/maintenanceProof';

jest.mock('../api/wiki', () => ({
  adoptPublicWikiPage: jest.fn(),
  getPublicWikiPage: jest.fn(),
  getPublicWikiComparison: jest.fn()
}));

jest.mock('../utils/marketingAnalytics', () => ({
  trackSharedWikiAdoptClicked: jest.fn(),
  trackSharedWikiViewed: jest.fn()
}));

const mockParams = (idOrSlug) => {
  jest.spyOn(router, 'useParams').mockReturnValue({ idOrSlug });
};

describe('SharedWikiPage', () => {
  let navigate;

  beforeEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    navigate = jest.fn();
    adoptPublicWikiPage.mockReset();
    getPublicWikiPage.mockReset();
    getPublicWikiComparison.mockReset();
    getPublicWikiComparison.mockRejectedValue({ response: { status: 404 } });
    trackSharedWikiViewed.mockReset();
    trackSharedWikiAdoptClicked.mockReset();
    mockParams('opportunity-cost');
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/share/wiki/opportunity-cost',
      search: '',
      hash: '',
      state: null,
      key: 'test'
    });
  });

  it('renders a shared wiki page for public readers', async () => {
    getPublicWikiPage.mockResolvedValue({
      page: {
        _id: 'wiki-1',
        title: 'Opportunity Cost',
        visibility: 'shared',
        updatedAt: '2026-06-08T12:00:00.000Z',
        lastReviewedAt: '2026-06-08T12:00:00.000Z',
        maintenanceProof: {
          clock: { type: 'reading', label: 'Reading and source events' },
          currentThrough: { label: 'Reader article synced Jun 7, 2026', at: '2026-06-07T00:00:00.000Z' },
          lastReviewedAt: '2026-06-08T12:00:00.000Z',
          latestMaterialEvent: {
            type: 'reading',
            summary: 'Accepted reading refresh',
            at: '2026-06-07T12:00:00.000Z'
          },
          sourceCount: 1,
          claimCount: 2
        },
        sourceRefs: [{
          _id: 'source-1',
          title: 'Munger notes',
          url: 'https://example.com/munger',
          snippet: 'A cited source.'
        }],
        body: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Opportunity cost frames tradeoffs.' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Evidence' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'The evidence section is public.' }] },
            {
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Private neighbor',
                marks: [{ type: 'wikiLink', attrs: { pageId: 'wiki-private', title: 'Private neighbor' } }]
              }]
            }
          ]
        }
      }
    });

    const { unmount } = render(<SharedWikiPage />);

    await waitFor(() => expect(getPublicWikiPage).toHaveBeenCalledWith('opportunity-cost'));
    expect(document.documentElement).toHaveClass('noeis-public-share');
    expect(document.body).toHaveClass('noeis-public-share');
    expect(await screen.findByRole('heading', { name: 'Opportunity Cost' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Public page ready: citations included, private source notes withheld.');
    expect(screen.getByText('Current through')).toBeInTheDocument();
    expect(screen.getByText('Reader article synced Jun 7, 2026')).toBeInTheDocument();
    expect(screen.getByText('Accepted reading refresh · Jun 7, 2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Adopt shared wiki')).toHaveTextContent(/background maintenance loop/i);
    expect(screen.getAllByText('Opportunity cost frames tradeoffs.')).toHaveLength(2);
    expect(screen.getByText('References')).toBeInTheDocument();
    expect(screen.getByText(PUBLIC_PROOF_PRIVACY_STATEMENT)).toBeInTheDocument();
    const adoptCta = screen.getByRole('button', { name: 'Make this mine' });
    expect(adoptCta).toHaveClass('shared-wiki-page__adopt-cta');
    expect(adoptCta.className).not.toMatch(/ui-quiet-button/);
    expect(screen.getByRole('link', { name: 'Munger notes' })).toHaveAttribute('href', 'https://example.com/munger');
    expect(screen.queryByRole('link', { name: 'Private neighbor' })).not.toBeInTheDocument();
    expect(screen.getByText('Private neighbor')).toHaveClass('wiki-internal-link--static');
    expect(screen.getByRole('link', { name: 'Open Noeis' })).toHaveAttribute('href', '/');
    await waitFor(() => expect(document.title).toBe('Opportunity Cost · Shared Wiki · Noeis'));
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      'Opportunity cost frames tradeoffs.'
    );
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://www.noeis.io/share/wiki/opportunity-cost'
    );
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
    const schema = JSON.parse(document.getElementById('seo-schema').textContent);
    expect(schema).toEqual(expect.objectContaining({
      '@type': 'Article',
      name: 'Opportunity Cost',
      mainEntityOfPage: 'https://www.noeis.io/share/wiki/opportunity-cost',
      dateReviewed: '2026-06-08T12:00:00.000Z'
    }));
    expect(schema.citation).toEqual([
      expect.objectContaining({
        '@type': 'CreativeWork',
        name: 'Munger notes',
        url: 'https://example.com/munger'
      })
    ]);
    expect(trackSharedWikiViewed).toHaveBeenCalledWith(expect.objectContaining({
      page: '/share/wiki/opportunity-cost',
      title: 'Opportunity Cost',
      sourceCount: 1
    }));
    unmount();
    expect(document.body).not.toHaveClass('noeis-public-share');
    expect(document.documentElement).not.toHaveClass('noeis-public-share');
  });

  it('sends logged-out readers through auth with a return-to adoption URL', async () => {
    getPublicWikiPage.mockResolvedValue({
      page: {
        _id: 'wiki-1',
        title: 'Opportunity Cost',
        visibility: 'shared',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared page.' }] }] },
        sourceRefs: []
      }
    });

    render(<SharedWikiPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Make this mine' }));

    expect(trackSharedWikiAdoptClicked).toHaveBeenCalledWith(expect.objectContaining({
      page: '/share/wiki/opportunity-cost',
      title: 'Opportunity Cost'
    }));
    expect(adoptPublicWikiPage).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('auth_return_to')).toBe('/share/wiki/opportunity-cost?adopt=1');
    expect(navigate).toHaveBeenCalledWith('/register');
  });

  it('renders Weekend Readings as an immutable narrative artifact with public provenance', async () => {
    getPublicWikiPage.mockResolvedValue({
      page: {
        artifactType: 'weekend_readings',
        title: 'Weekend Readings — 2026-07-19 — Edition 1',
        slug: 'weekend-readings-2026-07-19',
        authorLabel: 'Athan Tsokolas',
        visibility: 'shared',
        status: 'published',
        publication: {
          approvedRevisionId: 'revision-public-1',
          publishedAt: '2026-07-19T12:10:00.000Z'
        },
        body: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Editorial note' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Qualification durability is the central pressure in this edition.' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Thesis evidence' }] },
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{
                type: 'text',
                text: 'Primary filing',
                marks: [{ type: 'link', attrs: { href: 'https://example.com/filing' } }]
              }]
            },
            { type: 'paragraph', content: [{ type: 'text', text: 'It tests the demand premise with primary evidence.' }] }
          ]
        },
        sourceRefs: [{
          title: 'Primary filing',
          url: 'https://example.com/filing',
          snippet: 'It tests the demand premise with primary evidence.',
          readingRole: 'thesis_evidence',
          publicRelationship: 'The durability of service economics.'
        }]
      }
    });

    const { container } = render(<SharedWikiPage />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Weekend Readings — 2026-07-19 — Edition 1' })).toBeInTheDocument();
    expect(screen.getByText('Athan Tsokolas — researched and maintained with Noeis')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Primary filing' })).toHaveLength(2);
    expect(screen.queryByLabelText('Adopt shared wiki')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make this mine' })).not.toBeInTheDocument();
    expect(screen.queryByText(PUBLIC_PROOF_PRIVACY_STATEMENT)).not.toBeInTheDocument();
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.textContent).not.toContain('FORBIDDEN_PRIVATE_SENTINEL');
    const schema = JSON.parse(document.getElementById('seo-schema').textContent);
    expect(schema.author).toEqual({ '@type': 'Person', name: 'Athan Tsokolas' });
    expect(schema.datePublished).toBe('2026-07-19T12:10:00.000Z');
  });

  it('adopts shared pages for signed-in readers and opens the private copy', async () => {
    localStorage.setItem('token', 'test-token');
    getPublicWikiPage.mockResolvedValue({
      page: {
        _id: 'wiki-1',
        title: 'Opportunity Cost',
        visibility: 'shared',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared page.' }] }] },
        sourceRefs: []
      }
    });
    adoptPublicWikiPage.mockResolvedValue({
      page: { _id: 'adopted-1', title: 'Opportunity Cost' }
    });

    render(<SharedWikiPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Make this mine' }));

    expect(trackSharedWikiAdoptClicked).toHaveBeenCalledWith(expect.objectContaining({
      page: '/share/wiki/opportunity-cost',
      title: 'Opportunity Cost'
    }));
    await waitFor(() => expect(adoptPublicWikiPage).toHaveBeenCalledWith('opportunity-cost'));
    expect(navigate).toHaveBeenCalledWith('/wiki/workspace?page=adopted-1', { replace: true });
  });

  it('auto-adopts after auth redirects back with adopt state', async () => {
    localStorage.setItem('token', 'test-token');
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/share/wiki/opportunity-cost',
      search: '?adopt=1',
      hash: '',
      state: null,
      key: 'test'
    });
    getPublicWikiPage.mockResolvedValue({
      page: {
        _id: 'wiki-1',
        title: 'Opportunity Cost',
        visibility: 'shared',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared page.' }] }] },
        sourceRefs: []
      }
    });
    adoptPublicWikiPage.mockResolvedValue({
      page: { _id: 'adopted-2', title: 'Opportunity Cost' }
    });

    render(<SharedWikiPage />);

    await waitFor(() => expect(adoptPublicWikiPage).toHaveBeenCalledWith('opportunity-cost'));
    expect(navigate).toHaveBeenCalledWith('/onboarding/wiki?adoptedPage=adopted-2&source=shared', { replace: true });
  });

  it('omits misleading maintenance copy when optional proof fields are absent', async () => {
    getPublicWikiPage.mockResolvedValue({
      page: {
        _id: 'wiki-1',
        title: 'Opportunity Cost',
        visibility: 'shared',
        lastReviewedAt: '2026-06-08T12:00:00.000Z',
        updatedAt: '2026-06-09T12:00:00.000Z',
        maintenanceProof: {
          clock: { type: 'reading', label: 'Reading and source events' },
          lastReviewedAt: '2026-06-08T12:00:00.000Z',
          sourceCount: 1,
          claimCount: 2
        },
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared page.' }] }] },
        sourceRefs: []
      }
    });

    render(<SharedWikiPage />);

    expect(await screen.findByRole('heading', { name: 'Opportunity Cost' })).toBeInTheDocument();
    expect(screen.getByText('No accepted maintenance event yet')).toBeInTheDocument();
    expect(screen.queryByText(/Updated Jun 9, 2026/i)).not.toBeInTheDocument();
  });

  it('shows a private-page message when the public endpoint returns 404', async () => {
    getPublicWikiPage.mockRejectedValue({ response: { status: 404 } });

    render(<SharedWikiPage />);

    expect(await screen.findByRole('heading', { name: 'Shared page unavailable' })).toBeInTheDocument();
    expect(screen.getByText('This wiki page is private, archived, or no longer exists.')).toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    expect(document.getElementById('seo-schema')).not.toBeInTheDocument();
  });

  it('links to the public repository comparison only when the comparison exists', async () => {
    mockParams('noeis-repo');
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/share/wiki/noeis-repo',
      search: '',
      hash: '',
      state: null,
      key: 'test'
    });
    getPublicWikiPage.mockResolvedValue({
      page: {
        _id: 'repo-1',
        title: 'Atsokolas/Note-Taker-3 Repo Wiki',
        visibility: 'shared',
        maintenanceProof: {
          clock: { type: 'github', label: 'GitHub default-branch and release monitoring' },
          currentThrough: { label: 'Commit a7cc281', at: '2026-07-10T18:00:00.000Z' },
          lastReviewedAt: '2026-07-10T18:00:00.000Z',
          sourceCount: 12,
          claimCount: 67
        },
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Repo dossier.' }] }]
        },
        sourceRefs: []
      }
    });
    getPublicWikiComparison.mockResolvedValue({
      comparison: {
        version: 1,
        repository: { owner: 'atsokolas', repo: 'note-taker-3' },
        baseline: { headSha: '4cbdac0' },
        current: { publishedHeadSha: 'a7cc281', observedHeadSha: '91ab3f2' },
        repositoryChanges: { added: [], changed: [], removed: [] },
        claimComparison: { counts: { preserved: 67 }, deltas: { preserved: [] } },
        rejectedCandidates: [],
        staticWikiErrors: [],
        supportingRefs: []
      }
    });

    render(<SharedWikiPage />);

    const link = await screen.findByRole('link', { name: /View repository maintenance comparison/i });
    expect(link).toHaveAttribute('href', '/share/wiki/noeis-repo/comparison');
    expect(getPublicWikiComparison).toHaveBeenCalledWith('noeis-repo');
  });

  it('does not show a comparison link for non-repo shared pages', async () => {
    getPublicWikiPage.mockResolvedValue({
      page: {
        _id: 'wiki-1',
        title: 'Opportunity Cost',
        visibility: 'shared',
        maintenanceProof: {
          clock: { type: 'reading', label: 'Reading' },
          lastReviewedAt: '2026-06-08T12:00:00.000Z'
        },
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Concept page.' }] }]
        },
        sourceRefs: []
      }
    });

    render(<SharedWikiPage />);
    await screen.findByRole('heading', { name: 'Opportunity Cost' });
    expect(screen.queryByRole('link', { name: /View repository maintenance comparison/i })).not.toBeInTheDocument();
    expect(getPublicWikiComparison).not.toHaveBeenCalled();
  });

  it('renders hybrid repo dossier overview, section nav, and stable anchors from the public envelope', async () => {
    mockParams('noeis-repo');
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/share/wiki/noeis-repo',
      search: '',
      hash: '',
      state: null,
      key: 'test'
    });
    getPublicWikiPage.mockResolvedValue({
      page: {
        _id: 'repo-1',
        slug: 'noeis-repo',
        title: 'atsokolas/note-taker-3 Repo Wiki',
        pageType: 'repo',
        visibility: 'shared',
        wordCount: 1200,
        maintenanceProof: {
          clock: { type: 'github', label: 'GitHub default-branch and release monitoring' },
          currentThrough: {
            label: 'Commit a7cc281',
            at: '2026-07-10T18:00:00.000Z',
            ref: 'https://github.com/atsokolas/note-taker-3/commit/a7cc281393dc2985c02a89a07d68d169ce3145b1'
          },
          lastReviewedAt: '2026-07-10T18:00:00.000Z',
          sourceCount: 12,
          claimCount: 67
        },
        body: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Noeis is a source-backed research wiki for developers.' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What this repo is' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'It connects Library, Think, and Wiki.' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Architecture map' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'server/routes/wikiRoutes.js owns wiki APIs.' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Open questions' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Which repos should enter the public fleet next?' }] },
            {
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Private architecture note',
                marks: [{ type: 'wikiLink', attrs: { pageId: 'private-repo-note', title: 'Private architecture note' } }]
              }]
            }
          ]
        },
        sourceRefs: []
      }
    });
    getPublicWikiComparison.mockResolvedValue({
      comparison: {
        claimComparison: {
          deltas: {
            changed: [{ after: { section: 'Architecture map' } }]
          }
        }
      }
    });

    render(<SharedWikiPage />);

    expect(await screen.findByRole('region', { name: 'Repository dossier overview' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'note-taker-3 — repo wiki' })).toBeInTheDocument();
    expect(screen.getByText('atsokolas/note-taker-3')).toBeInTheDocument();
    expect(screen.getByText('a7cc281')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Repository dossier quick links' })).toHaveTextContent('Architecture');
    expect(screen.getByRole('navigation', { name: 'Repository dossier quick links' })).toHaveTextContent('Open questions');
    expect(screen.getByRole('complementary', { name: 'Repository dossier contents' })).toHaveTextContent('Overview');
    expect(document.getElementById('repo-section-architecture')).toBeInTheDocument();
    expect(screen.getByText(/All sections are expanded below/i)).toBeInTheDocument();
    const disclosureSections = Array.from(document.querySelectorAll('details.wiki-read__repo-dossier-section'));
    expect(disclosureSections).toHaveLength(3);
    expect(disclosureSections.every(section => section.hasAttribute('open'))).toBe(true);
    expect(screen.getAllByText('Expanded')).toHaveLength(3);
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /View repository maintenance comparison/i })).toBeInTheDocument();
    });
    expect(screen.getByText(PUBLIC_PROOF_PRIVACY_STATEMENT)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Private architecture note' })).not.toBeInTheDocument();
    expect(screen.getByText('Private architecture note')).toHaveClass('wiki-internal-link--static');
    expect(screen.queryByText('Shared wiki')).not.toBeInTheDocument();
  });

  it('does not leak authenticated-only fields when they appear on the transport payload', async () => {
    getPublicWikiPage.mockResolvedValue({
      page: {
        _id: 'repo-leak-test',
        title: 'note-taker-3 — repo wiki',
        pageType: 'repo',
        visibility: 'shared',
        maintenanceProof: {
          clock: { type: 'github', label: 'GitHub default-branch and release monitoring' },
          currentThrough: {
            label: 'Commit deadbeef',
            ref: 'https://github.com/atsokolas/note-taker-3/commit/deadbeef'
          }
        },
        externalWatches: {
          githubRepo: {
            owner: 'secret-owner',
            repo: 'secret-repo',
            errorMessage: 'FORBIDDEN_WATCH_ERROR',
            candidateHeadSha: 'FORBIDDEN_CANDIDATE_SHA'
          }
        },
        claims: [{ claimId: 'FORBIDDEN_CLAIM_123', text: 'secret claim body' }],
        notes: 'FORBIDDEN_NOTES_FIELD',
        highlights: [{ text: 'FORBIDDEN_HIGHLIGHT_TEXT' }],
        backlinks: [{ title: 'FORBIDDEN_BACKLINK_TITLE' }],
        discussions: [{ text: 'FORBIDDEN_DISCUSSION_TEXT' }],
        aiState: { maintenanceSummary: 'FORBIDDEN_AGENT_STATE_SUMMARY' },
        body: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Public repo overview paragraph.' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'What this repo is' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Public section copy only.' }] }
          ]
        },
        sourceRefs: [{
          _id: 'FORBIDDEN_SOURCE_ID',
          title: 'Public reference title',
          url: 'https://example.com/public-ref'
        }]
      }
    });

    const { container } = render(<SharedWikiPage />);
    await screen.findByRole('region', { name: 'Repository dossier overview' });

    const rendered = container.textContent || '';
    const denylist = [
      'FORBIDDEN_WATCH_ERROR',
      'FORBIDDEN_CANDIDATE_SHA',
      'FORBIDDEN_CLAIM_123',
      'secret claim body',
      'FORBIDDEN_NOTES_FIELD',
      'FORBIDDEN_HIGHLIGHT_TEXT',
      'FORBIDDEN_BACKLINK_TITLE',
      'FORBIDDEN_DISCUSSION_TEXT',
      'FORBIDDEN_AGENT_STATE_SUMMARY',
      'FORBIDDEN_SOURCE_ID',
      'secret-owner',
      'secret-repo',
      'externalWatches'
    ];
    denylist.forEach(token => expect(rendered).not.toContain(token));
    expect(screen.getByRole('link', { name: 'Public reference title' })).toBeInTheDocument();
  });
});

describe('public repo dossier helpers', () => {
  it('detects repo dossiers from public-safe envelope fields only', () => {
    expect(isPublicRepoWikiPage({
      githubRepo: { owner: 'atsokolas', repo: 'note-taker-3' }
    })).toBe(true);
    expect(isPublicRepoWikiPage({
      pageType: 'repo',
      maintenanceProof: { clock: { type: 'github' } }
    })).toBe(true);
    expect(isPublicRepoWikiPage({
      title: 'Margin of Safety',
      maintenanceProof: { clock: { type: 'reading' } }
    })).toBe(false);
  });

  it('derives GitHub slug from public maintenance proof refs', () => {
    expect(publicRepoGitHubLabel({
      githubRepo: { owner: 'OpenAI', repo: 'openai-agents-js', fullName: 'OpenAI/openai-agents-js' }
    })).toBe('OpenAI/openai-agents-js');
    expect(publicRepoGitHubLabel({
      title: 'Fallback title',
      maintenanceProof: {
        currentThrough: {
          ref: 'https://github.com/atsokolas/note-taker-3/commit/a7cc281'
        }
      }
    })).toBe('atsokolas/note-taker-3');
  });

  it('uses the accepted published head from the explicit public envelope', () => {
    expect(publicRepoPublishedHead({
      githubRepo: { publishedHeadSha: 'ABC1234567890' },
      maintenanceProof: { currentThrough: { label: 'Commit fallback1' } }
    })).toBe('ABC1234');
  });
});

describe('buildSharedWikiSchema', () => {
  it('builds CreativeWork schema with public citations', () => {
    const schema = buildSharedWikiSchema({
      canonicalPath: '/share/wiki/opportunity-cost',
      description: 'Opportunity cost frames tradeoffs.',
      wordCount: 120,
      sourceCount: 1,
      claimCount: 2,
      page: {
        title: 'Opportunity Cost',
        lastReviewedAt: '2026-06-08T12:00:00.000Z',
        updatedAt: '2026-06-08T12:00:00.000Z',
        maintenanceProof: {
          lastReviewedAt: '2026-06-08T12:00:00.000Z'
        },
        sourceRefs: [
          { title: 'Munger notes', url: 'https://example.com/munger' }
        ]
      }
    });

    expect(schema).toEqual(expect.objectContaining({
      '@context': 'https://schema.org',
      '@type': 'Article',
      name: 'Opportunity Cost',
      url: 'https://www.noeis.io/share/wiki/opportunity-cost',
      wordCount: 120,
      isAccessibleForFree: true
    }));
    expect(schema.citation).toEqual([
      expect.objectContaining({
        '@type': 'CreativeWork',
        name: 'Munger notes',
        url: 'https://example.com/munger'
      })
    ]);
    expect(schema.keywords).toEqual(expect.arrayContaining([
      'source-grounded research',
      'public source references',
      'evidence-backed claims'
    ]));
  });
});
