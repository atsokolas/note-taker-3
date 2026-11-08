import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';
import { getMorningPaperSettings, updateMorningPaperSettings } from '../api/dailyLoop';

jest.mock('../api/dailyLoop', () => ({
  getMorningPaperSettings: jest.fn(),
  updateMorningPaperSettings: jest.fn()
}));

jest.mock('../api/tourApi', () => ({
  resetTourState: jest.fn().mockResolvedValue({})
}));

const renderSettings = (props = {}) => render(
  <MemoryRouter>
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

  it('shows a theme kept from the theme menu', () => {
    const base = { typographyScale: 'large', density: 'comfortable', theme: 'dark', motion: 'system' };
    const { rerender } = renderSettings({ uiSettings: base, onOpenThemePicker: jest.fn() });
    rerender(
      <MemoryRouter>
        <Settings uiSettings={{ ...base, theme: 'dracula' }} onAppearanceCommit={jest.fn()} onAppearanceUndo={jest.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /Dracula/ })).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('applies an appearance choice at once and offers Undo', async () => {
    const onAppearanceCommit = jest.fn().mockResolvedValue({ ok: true });
    const onAppearanceUndo = jest.fn().mockResolvedValue({ ok: true });
    renderSettings({ onAppearanceCommit, onAppearanceUndo });

    fireEvent.click(screen.getByRole('radio', { name: 'Large' }));
    expect(screen.getByRole('radio', { name: 'Large' })).toBeChecked();
    expect(onAppearanceCommit).toHaveBeenCalledWith({ typographyScale: 'large' }, expect.objectContaining({ typographyScale: 'large' }));
    expect(await screen.findByText('Reading size: Large')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(onAppearanceUndo).toHaveBeenCalledWith(expect.objectContaining({ keys: ['typographyScale'] })));
  });

  it('keeps a choice made while an earlier one is still saving', async () => {
    let finish;
    const onAppearanceCommit = jest.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue({ ok: true });
    renderSettings({ onAppearanceCommit });
    fireEvent.click(screen.getByRole('radio', { name: 'Large' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Compact' }));
    expect(onAppearanceCommit).toHaveBeenLastCalledWith(
      { typographyScale: 'large', density: 'compact' },
      expect.objectContaining({ typographyScale: 'large', density: 'compact' })
    );
    finish({ ok: true });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Compact' })).toBeChecked());
    expect(screen.getByRole('radio', { name: 'Large' })).toBeChecked();
  });

  it('puts the old choice back and offers to try again when a save fails', async () => {
    const onAppearanceCommit = jest.fn().mockResolvedValue({ ok: false });
    renderSettings({ onAppearanceCommit });
    fireEvent.click(screen.getByRole('radio', { name: 'Compact' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That did not save');
    expect(screen.getByRole('radio', { name: 'Comfortable' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onAppearanceCommit).toHaveBeenCalledTimes(2);
  });

  it('sends the morning paper to the address typed, in one step', async () => {
    getMorningPaperSettings.mockResolvedValue({ enabled: false, email: '', timezone: 'UTC', sendHourLocal: 7 });
    updateMorningPaperSettings.mockImplementation(async patch => ({ ...patch, enabled: true }));
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Delivery' }));
    fireEvent.change(await screen.findByLabelText('Address'), { target: { value: 'me@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send it each morning' }));
    await waitFor(() => expect(updateMorningPaperSettings).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'me@example.com', confirmEmail: true, enabled: true })
    ));
    expect(await screen.findByRole('button', { name: 'Stop sending' })).toBeInTheDocument();
  });

  it('finds motion through setting search', async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('Find a setting'), { target: { value: 'animation' } });
    fireEvent.click(await screen.findByRole('button', { name: /Motion/i }));
    expect(await screen.findByText(/Reduce Motion setting always wins/i)).toBeInTheDocument();
  });
});
