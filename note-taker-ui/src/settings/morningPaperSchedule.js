export const formatDeliveryHour = (hour) => {
  const h = Number(hour);
  if (!Number.isInteger(h) || h < 0 || h > 23) return '';
  return `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
};

export const nextEligibleDeliveryMoments = (hour, timeZone, from = new Date(), count = 3) => {
  const results = [];
  const zone = String(timeZone || '').trim();
  const targetHour = Number(hour);
  if (!zone || !Number.isInteger(targetHour) || targetHour < 0 || targetHour > 23) {
    return { moments: [], error: 'Choose a valid time zone and hour.' };
  }
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23'
    });
    let candidate = Math.ceil((from.getTime() + 1) / 60000) * 60000;
    for (let n = 0; n < 72 * 60 && results.length < count; n += 1, candidate += 60000) {
      const parts = Object.fromEntries(
        dtf.formatToParts(new Date(candidate)).map((part) => [part.type, part.value])
      );
      if (Number(parts.hour) === targetHour && Number(parts.minute) === 0) {
        results.push(new Intl.DateTimeFormat('en-US', {
          timeZone: zone,
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short'
        }).format(new Date(candidate)));
      }
    }
    if (!results.length) {
      return { moments: [], error: 'No eligible time found in this preview.' };
    }
    return { moments: results, error: '' };
  } catch (_error) {
    return { moments: [], error: 'Choose a valid IANA time zone.' };
  }
};
