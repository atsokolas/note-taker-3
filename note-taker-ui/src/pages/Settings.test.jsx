import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';
import { createAgentToken, deleteAgentToken, listAgentTokens, revokeAgentToken } from '../api/agent';
import { getMarketingFunnelSnapshot } from '../api/marketingAnalytics';
import { getWikiSchema, revertWikiSchema, saveWikiSchema, suggestWikiSchemaUpdates } from '../api/wiki';

jest.mock('../api/agent', () => ({
  createAgentToken: jest.fn(),
  deleteAgentToken: jest.fn(),
  listAgentTokens: jest.fn(),
  revokeAgentToken: jest.fn()
}));

jest.mock('../api/marketingAnalytics', () => ({
  getMarketingFunnelSnapshot: jest.fn()
}));

jest.mock('../api/wiki', () => ({
  getWikiSchema: jest.fn(),
  saveWikiSchema: jest.fn(),
  revertWikiSchema: jest.fn(),
  suggestWikiSchemaUpdates: jest.fn()
}));

jest.mock('../utils/wikiAnalytics', () => ({
  trackWikiSchemaSaved: jest.fn(),
  trackWikiSchemaSuggested: jest.fn()
}));

jest.mock('./Export', () => () => <div>Export panel</div>);

jest.mock('../api/tourApi', () => ({
  resetTourState: jest.fn().mockResolvedValue({})
}));

describe('Settings marketing reporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.setItem('noeis.flags.wiki.read_mode_v2', 'true');
    getWikiSchema.mockResolvedValue({
      content: '# Wiki Schema\n\n## Page types I want\n- topic',
      snapshots: []
    });
    saveWikiSchema.mockResolvedValue({
      content: '# Wiki Schema\n\nSaved convention',
      snapshots: [{ id: 'snap-1', content: '# Wiki Schema', createdAt: '2026-05-13T12:00:00.000Z' }]
    });
    revertWikiSchema.mockResolvedValue({
      content: '# Wiki Schema\n\nReverted convention',
      snapshots: [{ id: 'snap-2', content: '# Wiki Schema', createdAt: '2026-05-12T12:00:00.000Z' }]
    });
    listAgentTokens.mockResolvedValue({ tokens: [] });
    createAgentToken.mockResolvedValue({
      token: {
        id: 'tok-new',
        label: 'Research worker',
        secretPrefix: 'ntk_at_new...',
        scopes: ['read'],
        callsToday: 0,
        dailyQuota: 10,
        status: 'active',
        createdAt: '2026-05-16T12:00:00.000Z'
      },
      secret: 'agent_secret_once'
    });
    revokeAgentToken.mockResolvedValue({});
    deleteAgentToken.mockResolvedValue({});
  });

  afterEach(() => {
    window.localStorage.removeItem('noeis.flags.wiki.read_mode_v2');
  });

  it('renders marketing funnel metrics after loading', async () => {
    getMarketingFunnelSnapshot.mockResolvedValue({
      totals: {
        signupViewed: 12,
        signupStarted: 7,
        signupsCompleted: 4,
        activatedUsers: 2
      },
      byEntry: [
        {
          entry: 'ai-second-brain',
          signupViewed: 8,
          signupStarted: 5,
          signupsCompleted: 3,
          activatedUsers: 2
        }
      ],
      bySource: [
        {
          utmSource: 'google',
          utmMedium: 'organic',
          signupViewed: 8,
          signupStarted: 5,
          signupsCompleted: 3,
          activatedUsers: 2
        }
      ]
    });

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    expect(screen.getByText('Loading funnel snapshot…')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    expect(screen.getByText('Ai Second Brain')).toBeInTheDocument();
    expect(screen.getByText('google / organic')).toBeInTheDocument();
    expect(screen.getByText('2 activated')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open full analytics' })).toHaveAttribute('href', '/marketing-analytics');
    expect(screen.getByRole('link', { name: 'Open Search Console importer' })).toHaveAttribute('href', '/search-console-opportunities');
  });

  it('lets the agent suggest wiki schema updates from recent activity', async () => {
    getMarketingFunnelSnapshot.mockResolvedValue({ totals: {}, byEntry: [], bySource: [] });
    suggestWikiSchemaUpdates.mockResolvedValue({
      summary: '2 schema update suggestions from recent wiki activity.',
      proposedPatch: '## Suggested schema updates\n\n### Evidence standards\n- Flag unsupported claims.',
      suggestions: [
        { id: 'evidence', title: 'Tighten evidence standards' }
      ]
    });

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    await screen.findByLabelText('Current wiki schema');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest schema updates' }));

    await waitFor(() => expect(suggestWikiSchemaUpdates).toHaveBeenCalledWith({
      currentSchema: '# Wiki Schema\n\n## Page types I want\n- topic'
    }));
    expect(await screen.findByText('2 schema update suggestions from recent wiki activity.')).toBeInTheDocument();
    expect(screen.getByText(/Evidence standards/)).toBeInTheDocument();
  });

  it('loads, saves, guards, and reverts wiki schema markdown', async () => {
    getMarketingFunnelSnapshot.mockResolvedValue({ totals: {}, byEntry: [], bySource: [] });

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    const editor = await screen.findByLabelText('Current wiki schema');
    expect(editor.value).toContain('Page types I want');

    fireEvent.change(editor, { target: { value: '# Wiki Schema\n\nSaved convention' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save wiki schema' }));

    await waitFor(() => expect(saveWikiSchema).toHaveBeenCalledWith('# Wiki Schema\n\nSaved convention'));
    expect(await screen.findByText('Wiki schema saved.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Revert to/i }));
    await waitFor(() => expect(revertWikiSchema).toHaveBeenCalledWith('snap-1'));
    expect(await screen.findByText('Wiki schema reverted.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Current wiki schema'), { target: { value: 'x'.repeat(8005) } });
    expect(screen.getByLabelText('Current wiki schema').value).toHaveLength(8000);
    expect(screen.getByText(/Schema is capped at 8,000 characters/)).toBeInTheDocument();
  });

  it('hides wiki schema settings when read mode v2 is disabled', async () => {
    window.localStorage.setItem('noeis.flags.wiki.read_mode_v2', 'false');
    getMarketingFunnelSnapshot.mockResolvedValue({ totals: {}, byEntry: [], bySource: [] });

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    expect(screen.queryByText('Wiki schema')).not.toBeInTheDocument();
    await waitFor(() => expect(getWikiSchema).not.toHaveBeenCalled());
  });

  it('lists connected agent tokens and can issue a new token', async () => {
    getMarketingFunnelSnapshot.mockResolvedValue({ totals: {}, byEntry: [], bySource: [] });
    listAgentTokens
      .mockResolvedValueOnce({
        tokens: [{
          id: 'tok-1',
          label: 'Research worker',
          secretPrefix: 'ntk_at_live...',
          scopes: ['read'],
          callsToday: 1,
          dailyQuota: 10,
          status: 'active',
          createdAt: '2026-05-15T12:00:00.000Z'
        }]
      })
      .mockResolvedValueOnce({
        tokens: [{
          id: 'tok-new',
          label: 'Notebook worker',
          secretPrefix: 'ntk_at_new...',
          scopes: ['read', 'agent-write'],
          callsToday: 0,
          dailyQuota: 25,
          status: 'active',
          createdAt: '2026-05-16T12:00:00.000Z'
        }]
      });

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    expect(await screen.findByText('Research worker')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Agent token label'), { target: { value: 'Notebook worker' } });
    fireEvent.change(screen.getByLabelText('Agent token daily quota'), { target: { value: '25' } });
    fireEvent.click(screen.getByLabelText('Agent write'));
    fireEvent.click(screen.getByRole('button', { name: 'Issue token' }));

    await waitFor(() => expect(createAgentToken).toHaveBeenCalledWith({
      label: 'Notebook worker',
      scopes: ['read', 'agent-write'],
      dailyQuota: 25
    }));
    expect(await screen.findByText('agent_secret_once')).toBeInTheDocument();
    expect(await screen.findByText('Notebook worker')).toBeInTheDocument();
    expect(screen.getByText(/Quota: 0 \/ 25 today/)).toBeInTheDocument();
  });

  it('revokes and deletes connected agent tokens', async () => {
    getMarketingFunnelSnapshot.mockResolvedValue({ totals: {}, byEntry: [], bySource: [] });
    listAgentTokens.mockResolvedValue({
      tokens: [{
        id: 'tok-1',
        label: 'Research worker',
        secretPrefix: 'ntk_at_live...',
        scopes: ['read'],
        callsToday: 0,
        dailyQuota: 10,
        status: 'active',
        createdAt: '2026-05-15T12:00:00.000Z'
      }]
    });

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    const tokenRow = await screen.findByText('Research worker');
    const list = tokenRow.closest('.connected-agents-token-row');
    fireEvent.click(within(list).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(revokeAgentToken).toHaveBeenCalledWith('tok-1'));
    await waitFor(() => expect(within(list).getByRole('button', { name: 'Delete' })).not.toBeDisabled());

    fireEvent.click(within(list).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteAgentToken).toHaveBeenCalledWith('tok-1'));
  });
});
