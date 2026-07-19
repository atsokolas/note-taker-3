import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MorningPaperEmailSettingsCard from './MorningPaperEmailSettingsCard';
import { getMorningPaperSettings, updateMorningPaperSettings } from '../../api/dailyLoop';

jest.mock('../../api/dailyLoop', () => ({
  getMorningPaperSettings: jest.fn(),
  updateMorningPaperSettings: jest.fn()
}));

const Card = ({ children, className = '' }) => <section className={className}>{children}</section>;
const Button = (props) => <button type="button" {...props} />;

describe('MorningPaperEmailSettingsCard', () => {
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
  });

  it('defaults off and blocks enablement until the address is explicitly confirmed', async () => {
    render(<MorningPaperEmailSettingsCard Card={Card} Button={Button} />);
    expect(await screen.findByText('Off')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Turn on' })).toBeDisabled();
    expect(screen.getByText(/quiet days send nothing/i)).toBeInTheDocument();
    expect(screen.getByText(/server delivery is not configured yet/i)).toBeInTheDocument();
  });

  it('saves and confirms a delivery address before enabling', async () => {
    updateMorningPaperSettings
      .mockResolvedValueOnce({
        enabled: false,
        email: 'founder@example.com',
        emailConfirmed: true,
        timezone: 'America/Chicago',
        sendHourLocal: 8,
        configuration: { ready: false, missing: ['RESEND_API_KEY'] }
      })
      .mockResolvedValueOnce({
        enabled: true,
        email: 'founder@example.com',
        emailConfirmed: true,
        timezone: 'America/Chicago',
        sendHourLocal: 8,
        configuration: { ready: false, missing: ['RESEND_API_KEY'] }
      });
    render(<MorningPaperEmailSettingsCard Card={Card} Button={Button} />);
    const email = await screen.findByPlaceholderText('you@example.com');
    fireEvent.change(email, { target: { value: 'founder@example.com' } });
    fireEvent.change(screen.getByDisplayValue('07:00'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm this address' }));
    await waitFor(() => expect(updateMorningPaperSettings).toHaveBeenCalledWith(expect.objectContaining({
      email: 'founder@example.com', confirmEmail: true, sendHourLocal: 8
    })));
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }));
    await waitFor(() => expect(updateMorningPaperSettings).toHaveBeenLastCalledWith({ enabled: true }));
    expect(await screen.findByText('Email delivery turned on.')).toBeInTheDocument();
  });
});
