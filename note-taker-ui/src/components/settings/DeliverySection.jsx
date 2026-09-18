import React, { useEffect, useMemo, useState } from 'react';
import { getMorningPaperSettings, updateMorningPaperSettings } from '../../api/dailyLoop';
import { formatDeliveryHour, nextEligibleDeliveryMoments } from '../../settings/morningPaperSchedule';

const emailValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const DeliverySection = () => {
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState({ email: '', timezone: 'UTC', sendHourLocal: 7 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmAddress, setConfirmAddress] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMorningPaperSettings()
      .then((value) => {
        if (cancelled) return;
        setSettings(value);
        setDraft({
          email: value.email || '',
          timezone: value.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          sendHourLocal: value.sendHourLocal ?? 7
        });
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError?.response?.data?.error || 'Failed to load delivery settings.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const dirty = settings && (
    draft.email !== (settings.email || '')
    || draft.timezone !== (settings.timezone || 'UTC')
    || Number(draft.sendHourLocal) !== Number(settings.sendHourLocal ?? 7)
  );

  const schedule = useMemo(
    () => nextEligibleDeliveryMoments(draft.sendHourLocal, draft.timezone, new Date(), 3),
    [draft.sendHourLocal, draft.timezone]
  );

  const savePatch = async (patch, success) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const next = await updateMorningPaperSettings(patch);
      setSettings(next);
      setDraft({
        email: next.email || '',
        timezone: next.timezone || 'UTC',
        sendHourLocal: next.sendHourLocal ?? 7
      });
      setMessage(success);
      return true;
    } catch (requestError) {
      setError(requestError?.response?.data?.error || 'That did not save.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const reviewDelivery = () => {
    if (!emailValid(draft.email)) return;
    setConfirmAddress(false);
    setReviewOpen(true);
  };

  const commitDeliveryDetails = async () => {
    const changedAddress = draft.email !== (settings?.email || '');
    if (changedAddress && !confirmAddress) return;
    await savePatch(
      {
        email: draft.email,
        timezone: draft.timezone,
        sendHourLocal: draft.sendHourLocal,
        ...(changedAddress ? { enabled: false } : {})
      },
      changedAddress
        ? 'Delivery details saved. Delivery stays off until you turn it on separately.'
        : 'Delivery details saved.'
    );
    setReviewOpen(false);
  };

  const toggleEnabled = async () => {
    if (settings?.enabled) {
      setSaving(true);
      try {
        const next = await updateMorningPaperSettings({ enabled: false });
        setSettings(next);
        setMessage('Email preference off. Your saved address, time and any unfinished edits are still here.');
      } catch (requestError) {
        setError(requestError?.response?.data?.error || 'That did not save.');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (dirty) {
      setError('Save the address or time changes before turning delivery on.');
      return;
    }
    await savePatch({ enabled: true }, settings?.emailConfirmed ? 'Email delivery turned on.' : '');
  };

  return (
    <section>
      <div className="settings-redesign__pagehead">
        <div>
          <h2>Delivery</h2>
          <p className="settings-redesign__help" style={{ marginTop: '0.45rem' }}>A useful paper, at a time you chose.</p>
        </div>
        <span className="settings-redesign__eyebrow">Morning paper</span>
      </div>
      <div className="settings-redesign__panel-columns">
        <div>
          <h3 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400, margin: '0 0 0.5rem' }}>Morning paper by email</h3>
          <p className="settings-redesign__help">Keep the schedule simple. Quiet days send nothing.</p>
          {loading ? <p className="settings-redesign__help">Loading delivery settings…</p> : (
            <>
              <div className="settings-redesign__fact">
                <span>{settings?.enabled ? 'Delivery preference on' : 'Delivery preference off'}</span>
                <button type="button" className="settings-redesign__link" onClick={toggleEnabled} disabled={saving}>
                  {settings?.enabled ? 'Turn off' : 'Turn on…'}
                </button>
              </div>
              <label className="settings-redesign__label" htmlFor="delivery-email">Delivery address</label>
              <input
                id="delivery-email"
                className="noeis-form-control"
                type="email"
                value={draft.email}
                onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="you@example.com"
                style={{ width: '100%', marginBottom: '0.75rem' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: '1rem' }}>
                <label className="settings-redesign__label" htmlFor="delivery-timezone">Time zone</label>
                <label className="settings-redesign__label" htmlFor="delivery-hour">Delivery hour</label>
                <input
                  id="delivery-timezone"
                  className="noeis-form-control"
                  value={draft.timezone}
                  onChange={(event) => setDraft((prev) => ({ ...prev, timezone: event.target.value }))}
                />
                <select
                  id="delivery-hour"
                  className="noeis-form-control"
                  value={draft.sendHourLocal}
                  onChange={(event) => setDraft((prev) => ({ ...prev, sendHourLocal: Number(event.target.value) }))}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>{formatDeliveryHour(hour)}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginTop: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="settings-redesign__btn is-primary"
                  onClick={reviewDelivery}
                  disabled={!emailValid(draft.email) || saving}
                >
                  Review delivery details
                </button>
                <span className="settings-redesign__help" style={{ margin: 0 }}>{dirty ? 'Unsaved changes' : 'Current details'}</span>
              </div>
              {!settings?.emailConfirmed ? (
                <p className="settings-redesign__help">Delivery stays off until you explicitly confirm the address.</p>
              ) : null}
            </>
          )}
          {message ? <div className="settings-redesign__receipt" role="status">{message}</div> : null}
          {error ? <div className="settings-redesign__receipt is-error" role="alert">{error}</div> : null}
        </div>
        <aside className="settings-redesign__quiet">
          <span className="settings-redesign__eyebrow">What this means</span>
          <div style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontSize: '1.9rem', margin: '0.5rem 0' }}>
            {formatDeliveryHour(draft.sendHourLocal)}
          </div>
          <p className="settings-redesign__help">{draft.timezone}</p>
          <div style={{ borderTop: '1px solid var(--settings-rule)', marginTop: '1rem', paddingTop: '1rem' }}>
            <span className="settings-redesign__eyebrow">Next eligible times · preview</span>
            {schedule.error ? (
              <p className="settings-redesign__help">{schedule.error}</p>
            ) : (
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', fontSize: '0.75rem' }}>
                {schedule.moments.map((moment) => <li key={moment}>{moment}</li>)}
              </ul>
            )}
            <p className="settings-redesign__help">An eligible time is not a promise that an email will be sent.</p>
            {dirty ? <p className="settings-redesign__help">Preview uses unsaved details.</p> : null}
          </div>
          {settings?.configuration && !settings.configuration.ready ? (
            <p className="settings-redesign__help">Server delivery is not configured yet. Your preference is saved.</p>
          ) : null}
        </aside>
      </div>

      {reviewOpen ? (
        <dialog className="settings-redesign__dialog" open>
          <h2 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400 }}>Use these delivery details?</h2>
          <p className="settings-redesign__help">Check the address and time together.</p>
          <div className="settings-redesign__fact"><span>To</span><strong>{draft.email}</strong></div>
          <div className="settings-redesign__fact"><span>At</span><strong>{formatDeliveryHour(draft.sendHourLocal)}</strong></div>
          <div className="settings-redesign__fact"><span>Time zone</span><strong>{draft.timezone}</strong></div>
          {draft.email !== (settings?.email || '') ? (
            <label style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', marginTop: '1rem' }}>
              <input type="checkbox" checked={confirmAddress} onChange={(e) => setConfirmAddress(e.target.checked)} />
              I confirm this is the delivery address I want to use. This is not an ownership-verification email.
            </label>
          ) : null}
          <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="settings-redesign__btn is-primary"
              onClick={commitDeliveryDetails}
              disabled={draft.email !== (settings?.email || '') && !confirmAddress}
            >
              Use these delivery details
            </button>
            <button type="button" className="settings-redesign__link" onClick={() => setReviewOpen(false)}>Keep editing</button>
          </div>
        </dialog>
      ) : null}
    </section>
  );
};

export default DeliverySection;
