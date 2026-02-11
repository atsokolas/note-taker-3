import React, { useMemo, useState } from 'react';
import { Button, QuietButton } from '../ui';
import { createReturnQueueEntry } from '../../api/returnQueue';

const toIsoInDays = (days) => {
  const due = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return due.toISOString();
};

const toIsoFromDateInput = (value) => {
  if (!value) return '';
  const parsed = new Date(`${value}T09:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
};

const ReturnLaterControl = ({
  itemType,
  itemId,
  defaultReason = '',
  onCreated,
  buttonLabel = 'Return later'
}) => {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState('tomorrow');
  const [customDate, setCustomDate] = useState('');
  const [reason, setReason] = useState(defaultReason || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const dueAt = useMemo(() => {
    if (preset === 'tomorrow') return toIsoInDays(1);
    if (preset === 'three-days') return toIsoInDays(3);
    if (preset === 'one-week') return toIsoInDays(7);
    return toIsoFromDateInput(customDate);
  }, [preset, customDate]);

  const disabled = !itemType || !itemId || saving || (preset === 'custom' && !customDate);

  const handleSubmit = async () => {
    if (disabled) return;
    setSaving(true);
    setError('');
    try {
      const created = await createReturnQueueEntry({
        itemType,
        itemId,
        dueAt,
        reason: reason.trim()
      });
      onCreated?.(created);
      setStatusMessage('Queued');
      setOpen(false);
      setTimeout(() => setStatusMessage(''), 1600);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to queue item.');
    } finally {
      setSaving(false);
    }
  };

  if (!itemType || !itemId) return null;

  return (
    <div className="return-later-control">
      <QuietButton onClick={() => setOpen(prev => !prev)}>
        {statusMessage || buttonLabel}
      </QuietButton>
      {open && (
        <div className="return-later-popover">
          <div className="return-later-title">Return later</div>
          <label className="return-later-option">
            <input
              type="radio"
              checked={preset === 'tomorrow'}
              onChange={() => setPreset('tomorrow')}
            />
            <span>Tomorrow</span>
          </label>
          <label className="return-later-option">
            <input
              type="radio"
              checked={preset === 'three-days'}
              onChange={() => setPreset('three-days')}
            />
            <span>3 days</span>
          </label>
          <label className="return-later-option">
            <input
              type="radio"
              checked={preset === 'one-week'}
              onChange={() => setPreset('one-week')}
            />
            <span>1 week</span>
          </label>
          <label className="return-later-option">
            <input
              type="radio"
              checked={preset === 'custom'}
              onChange={() => setPreset('custom')}
            />
            <span>Custom date</span>
          </label>
          {preset === 'custom' && (
            <input
              className="return-later-date"
              type="date"
              value={customDate}
              onChange={(event) => setCustomDate(event.target.value)}
            />
          )}
          <textarea
            className="return-later-reason"
            rows={2}
            maxLength={280}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Optional reason"
          />
          {error && <p className="status-message error-message">{error}</p>}
          <div className="return-later-actions">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={disabled}>
              {saving ? 'Saving...' : 'Add'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReturnLaterControl;
