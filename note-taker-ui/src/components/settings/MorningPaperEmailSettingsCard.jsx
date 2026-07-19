import React, { useEffect, useState } from 'react';
import { getMorningPaperSettings, updateMorningPaperSettings } from '../../api/dailyLoop';
import '../../styles/morning-paper-settings.css';

const MorningPaperEmailSettingsCard = ({ Card, Button }) => {
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState({ email: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', sendHourLocal: 7 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getMorningPaperSettings()
      .then(value => {
        if (cancelled) return;
        setSettings(value);
        setDraft({ email: value.email || '', timezone: value.timezone || 'UTC', sendHourLocal: value.sendHourLocal ?? 7 });
      })
      .catch(requestError => {
        if (!cancelled) setError(requestError?.response?.data?.error || 'Failed to load Morning Paper delivery settings.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const save = async (patch, success) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const next = await updateMorningPaperSettings(patch);
      setSettings(next);
      setDraft({ email: next.email || '', timezone: next.timezone || 'UTC', sendHourLocal: next.sendHourLocal ?? 7 });
      setMessage(success);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || 'Failed to update Morning Paper delivery settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="settings-card morning-paper-settings">
      <div className="settings-appearance-header">
        <div>
          <h2>Morning paper by email</h2>
          <p className="muted">The same watcher-led paper, delivered at your local hour. Quiet days send nothing.</p>
        </div>
        <p className="muted-label">{settings?.enabled ? 'On' : 'Off'}</p>
      </div>
      {loading ? <p className="muted">Loading delivery settings…</p> : (
        <>
          <div className="morning-paper-settings__grid">
            <label>
              Delivery email
              <input type="email" value={draft.email} onChange={event => setDraft(previous => ({ ...previous, email: event.target.value }))} placeholder="you@example.com" />
            </label>
            <label>
              Timezone
              <input value={draft.timezone} onChange={event => setDraft(previous => ({ ...previous, timezone: event.target.value }))} placeholder="America/Chicago" />
            </label>
            <label>
              Delivery hour
              <select value={draft.sendHourLocal} onChange={event => setDraft(previous => ({ ...previous, sendHourLocal: Number(event.target.value) }))}>
                {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
              </select>
            </label>
          </div>
          <div className="settings-option-row morning-paper-settings__actions">
            <Button variant="secondary" disabled={saving} onClick={() => save(draft, 'Delivery details saved.')}>Save details</Button>
            <Button
              variant="secondary"
              disabled={saving || !draft.email}
              onClick={() => save({ ...draft, confirmEmail: true }, 'Delivery address explicitly confirmed.')}
            >
              {settings?.emailConfirmed ? 'Reconfirm address' : 'Confirm this address'}
            </Button>
            <Button
              variant="secondary"
              disabled={saving || !settings?.emailConfirmed}
              onClick={() => save({ enabled: !settings?.enabled }, settings?.enabled ? 'Email delivery turned off.' : 'Email delivery turned on.')}
            >
              {settings?.enabled ? 'Turn off' : 'Turn on'}
            </Button>
          </div>
          {!settings?.emailConfirmed ? <p className="muted small">Delivery stays off until you explicitly confirm the address.</p> : null}
          {settings?.unsubscribedAt ? <p className="status-message">Unsubscribed. Reconfirm the address before turning delivery back on.</p> : null}
          {settings?.configuration && !settings.configuration.ready ? (
            <p className="muted small">Server delivery is not configured yet. Your preference is saved; no email will be attempted until setup is complete.</p>
          ) : null}
          {settings?.lastSentAt ? <p className="muted small">Last sent {new Date(settings.lastSentAt).toLocaleString()}.</p> : null}
          {settings?.lastSkippedAt ? <p className="muted small">Last skipped: {settings.lastSkipReason || 'quiet day'}.</p> : null}
        </>
      )}
      {message ? <p className="status-message" role="status">{message}</p> : null}
      {error ? <p className="status-message error-message" role="alert">{error}</p> : null}
    </Card>
  );
};

export default MorningPaperEmailSettingsCard;
