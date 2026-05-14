import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';
import { getMarketingFunnelSnapshot } from '../api/marketingAnalytics';
import { getWikiSchema, revertWikiSchema, saveWikiSchema, suggestWikiSchemaUpdates } from '../api/wiki';

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
});
