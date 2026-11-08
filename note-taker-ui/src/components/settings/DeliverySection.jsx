import React, { useEffect, useState } from 'react';
import { getMorningPaperSettings, updateMorningPaperSettings } from '../../api/dailyLoop';
import { formatDeliveryHour, nextEligibleDeliveryMoments } from '../../settings/morningPaperSchedule';
import { Button } from '../ui';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const detailsOf = (settings) => ({
  email: settings.email || '',
  timezone: settings.email ? settings.timezone : deviceZone(),
  sendHourLocal: settings.sendHourLocal ?? 7
});
const problemOf = (error) => error?.response?.data?.error || 'That did not save. Try again.';

/* The morning paper by email: an address, an hour, and one button. Typing
   your own address and pressing Send is the confirmation the server asks for. */
const DeliverySection = () => {
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let live = true;
    getMorningPaperSettings()
      .then((value) => { if (live) { setSettings(value); setDraft(detailsOf(value)); } })
      .catch((error) => { if (live) setProblem(problemOf(error)); });
    return () => { live = false; };
  }, []);

  const save = async (patch) => {
    setSaving(true);
    setProblem('');
    try {
      const next = await updateMorningPaperSettings(patch);
      setSettings(next);
      setDraft(detailsOf(next));
    } catch (error) {
      setProblem(problemOf(error));
    } finally {
      setSaving(false);
    }
  };

  const edit = (key) => (event) => setDraft({ ...draft, [key]: key === 'sendHourLocal' ? Number(event.target.value) : event.target.value });
  const send = (event) => {
    event.preventDefault();
    save({ ...draft, confirmEmail: true, enabled: true });
  };

  const changed = settings && draft && Object.keys(draft).some(key => String(draft[key]) !== String(detailsOf(settings)[key]));
  const sending = settings?.enabled && !changed;
  const [next] = draft ? nextEligibleDeliveryMoments(draft.sendHourLocal, draft.timezone, new Date(), 1).moments : [];

  return (
    <section>
      <div className="settings-redesign__pagehead">
        <h2>Delivery</h2>
      </div>
      <p className="settings-redesign__help">The morning paper by email, at an hour you choose. Quiet days send nothing.</p>
      {settings?.configuration && !settings.configuration.ready ? (
        <p className="settings-redesign__help">Noeis cannot send email yet, so nothing goes out for now. What you choose here is kept for when it can.</p>
      ) : null}

      {draft ? (
        <form className="settings-account__block" onSubmit={send} noValidate>
          <label className="settings-account__field">
            <span>Address</span>
            <input id="delivery-email" type="email" autoComplete="email" placeholder="you@example.com" value={draft.email} onChange={edit('email')} />
          </label>
          <label className="settings-account__field">
            <span>Hour</span>
            <select value={draft.sendHourLocal} onChange={edit('sendHourLocal')}>
              {HOURS.map(hour => <option key={hour} value={hour}>{formatDeliveryHour(hour)}</option>)}
            </select>
          </label>
          <label className="settings-account__field">
            <span>Time zone</span>
            <input value={draft.timezone} onChange={edit('timezone')} />
          </label>
          <p className="settings-redesign__help" role="status">
            {sending ? `On. The next one comes ${next || 'at the hour you chose'}.` : 'Off.'}
          </p>
          <div>
            {sending ? (
              <Button disabled={saving} onClick={() => save({ enabled: false })}>Stop sending</Button>
            ) : (
              <Button type="submit" disabled={saving || !draft.email.trim()}>
                {settings?.enabled ? 'Save the change' : 'Send it each morning'}
              </Button>
            )}
          </div>
        </form>
      ) : null}
      {problem ? <p className="settings-redesign__receipt is-error" role="alert">{problem}</p> : null}
    </section>
  );
};

export default DeliverySection;
