import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';
import { getMorningPaperSettings, updateMorningPaperSettings } from '../api/dailyLoop';
import { TemporaryAppearanceProvider } from '../settings/TemporaryAppearanceContext';

jest.mock('../api/dailyLoop', () => ({
  getMorningPaperSettings: jest.fn(),
  updateMorningPaperSettings: jest.fn()
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

  it('takes a theme kept from the theme menu over a theme still pending in the draft', () => {
    const base = { typographyScale: 'large', density: 'comfortable', theme: 'dark', motion: 'system' };
    const props = { uiSettings: base, onOpenThemePicker: jest.fn() };
    const { rerender } = renderSettings(props);
    fireEvent.click(screen.getByRole('button', { name: /Restore appearance defaults/ }));
    expect(screen.getByRole('button', { name: /System/ })).toHaveAttribute('aria-haspopup', 'dialog');
    rerender(
      <MemoryRouter>
        <TemporaryAppearanceProvider committedSettings={base} onKeepTemporary={async () => ({ ok: true })}>
          <Settings
            uiSettings={{ ...base, theme: 'dracula' }}
            onAppearanceCommit={jest.fn()}
            onAppearanceUndo={jest.fn()}
            onOpenThemePicker={props.onOpenThemePicker}
          />
        </TemporaryAppearanceProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /Dracula/ })).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('keeps appearance changes in preview until the reader applies them', async () => {
    const onAppearanceCommit = jest.fn().mockResolvedValue({ ok: true, settings: {
      typographyScale: 'large',
      density: 'comfortable',
      theme: 'auto',
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

  it('finds motion through setting search', async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('Find a setting'), { target: { value: 'animation' } });
    fireEvent.click(await screen.findByRole('button', { name: /Motion/i }));
    expect(await screen.findByText(/Reduce Motion preference always wins/i)).toBeInTheDocument();
  });
});
