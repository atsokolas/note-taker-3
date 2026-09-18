import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';
import { getMorningPaperSettings, updateMorningPaperSettings } from '../api/dailyLoop';
import { getWikiSchema, saveWikiSchema, suggestWikiSchemaUpdates } from '../api/wiki';
import { TemporaryAppearanceProvider } from '../settings/TemporaryAppearanceContext';

jest.mock('../api/dailyLoop', () => ({
  getMorningPaperSettings: jest.fn(),
  updateMorningPaperSettings: jest.fn()
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

jest.mock('../api/tourApi', () => ({
  resetTourState: jest.fn().mockResolvedValue({})
}));

const renderSettings = (props = {}) => render(
  <MemoryRouter>
    <TemporaryAppearanceProvider
      committedSettings={props.uiSettings}
      onKeepTemporary={async () => ({ ok: true })}
    >
      <Settings
        uiSettings={{
          typographyScale: 'default',
          density: 'comfortable',
          theme: 'auto',
          accent: 'electric',
          brandEnergy: true,
          motion: 'system'
        }}
        onAppearanceCommit={props.onAppearanceCommit || jest.fn().mockResolvedValue({ ok: true })}
        onAppearanceUndo={jest.fn()}
        {...props}
      />
    </TemporaryAppearanceProvider>
  </MemoryRouter>
);

describe('Settings redesign', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.setItem('noeis.flags.wiki.read_mode_v2', 'true');
    getWikiSchema.mockResolvedValue({
      content: '# Wiki instructions\n\n## Page types I want\n- topic',
      snapshots: []
    });
    getMorningPaperSettings.mockResolvedValue({
      enabled: false,
      email: '',
      emailConfirmed: false,
      timezone: 'America/Chicago',
      sendHourLocal: 7,
      configuration: { ready: false, missing: ['RESEND_API_KEY'] }
    });
    updateMorningPaperSettings.mockImplementation(async (patch) => ({
      enabled: Boolean(patch.enabled),
      email: patch.email || 'founder@example.com',
      emailConfirmed: Boolean(patch.confirmEmail),
      timezone: patch.timezone || 'America/Chicago',
      sendHourLocal: patch.sendHourLocal ?? 7,
      configuration: { ready: false, missing: ['RESEND_API_KEY'] }
    }));
  });

  afterEach(() => {
    window.localStorage.removeItem('noeis.flags.wiki.read_mode_v2');
  });

  it('keeps appearance changes in preview until the reader applies them', async () => {
    const onAppearanceCommit = jest.fn().mockResolvedValue({ ok: true, settings: {
      typographyScale: 'large',
      density: 'comfortable',
      theme: 'auto',
      accent: 'electric',
      brandEnergy: true,
      motion: 'system'
    } });

    renderSettings({ onAppearanceCommit });

    fireEvent.click(screen.getByRole('radio', { name: 'Large' }));
    expect(onAppearanceCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use this appearance' }));
    await waitFor(() => expect(onAppearanceCommit).toHaveBeenCalled());
  });

  it('loads delivery settings lazily in the Delivery section', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Delivery' }));
    await waitFor(() => expect(getMorningPaperSettings).toHaveBeenCalled());
    expect(screen.getByText(/Morning paper by email/i)).toBeInTheDocument();
  });

  it('shows wiki instructions in Advanced without clipping overlong drafts', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    const editor = await screen.findByLabelText('Wiki instructions');
    fireEvent.change(editor, { target: { value: 'x'.repeat(8005) } });
    expect(editor.value).toHaveLength(8005);
    expect(screen.getByText(/Over the limit/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled();
  });

  it('can suggest wiki instruction updates', async () => {
    suggestWikiSchemaUpdates.mockResolvedValue({
      summary: '1 schema update suggestion from recent wiki activity.',
      proposedPatch: '## Suggested schema updates',
      suggestions: [{ id: 'evidence', title: 'Tighten evidence standards' }]
    });
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    await screen.findByLabelText('Wiki instructions');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest updates' }));
    await waitFor(() => expect(suggestWikiSchemaUpdates).toHaveBeenCalled());
    expect(await screen.findByText(/1 schema update suggestion/i)).toBeInTheDocument();
  });

  it('finds decorative color through setting search', async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('Find a setting'), { target: { value: 'brand energy' } });
    fireEvent.click(screen.getByRole('button', { name: /Decorative color/i }));
    expect(await screen.findByText(/Motion & decoration/i)).toBeInTheDocument();
  });
});
