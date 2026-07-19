const crypto = require('crypto');
const { persistNoeisReceipt } = require('./noeisReceiptService');
const { localDateForTimezone, buildDailyLoopBriefing } = require('./dailyLoopService');

const clean = (value = '', limit = 2000) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
};
const escapeHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const emailConfig = (env = process.env) => ({
  enabled: String(env.EMAIL_DISABLED || 'true').toLowerCase() === 'false',
  apiKey: String(env.RESEND_API_KEY || '').trim(),
  from: String(env.MORNING_PAPER_FROM_EMAIL || '').trim(),
  appBaseUrl: String(env.APP_BASE_URL || 'https://www.noeis.io').replace(/\/+$/, ''),
  apiBaseUrl: String(env.EMAIL_PUBLIC_API_BASE_URL || 'https://note-taker-3-unrg.onrender.com').replace(/\/+$/, ''),
  unsubscribeSecret: String(env.MORNING_PAPER_UNSUBSCRIBE_SECRET || '').trim()
});

const emailConfigurationStatus = (env = process.env) => {
  const config = emailConfig(env);
  const missing = [];
  if (!config.enabled) missing.push('EMAIL_DISABLED=false');
  if (!config.apiKey) missing.push('RESEND_API_KEY');
  if (!config.from) missing.push('MORNING_PAPER_FROM_EMAIL');
  if (!config.unsubscribeSecret) missing.push('MORNING_PAPER_UNSUBSCRIBE_SECRET');
  return { ready: missing.length === 0, missing };
};

const encodeTokenPart = (value) => Buffer.from(String(value)).toString('base64url');
const signUnsubscribeToken = ({ userId, version = 1, secret } = {}) => {
  if (!userId || !secret) throw new Error('Unsubscribe token configuration is incomplete.');
  const payload = encodeTokenPart(JSON.stringify({ userId: String(userId), version: Number(version) || 1 }));
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};

const verifyUnsubscribeToken = ({ token, secret } = {}) => {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature || !secret) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch (_error) { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!decoded.userId || !Number.isInteger(Number(decoded.version))) return null;
    return { userId: String(decoded.userId), version: Number(decoded.version) };
  } catch (_error) {
    return null;
  }
};

const absoluteHref = (href = '', baseUrl = 'https://www.noeis.io') => {
  const safe = String(href || '').trim();
  if (!safe) return `${baseUrl}/wiki`;
  try {
    const url = new URL(safe, `${baseUrl}/`);
    if (url.origin !== new URL(baseUrl).origin) return `${baseUrl}/wiki`;
    return url.toString();
  } catch (_error) {
    return `${baseUrl}/wiki`;
  }
};

const renderMorningPaperEmail = ({ briefing = {}, unsubscribeUrl, appBaseUrl = 'https://www.noeis.io' } = {}) => {
  const lead = Array.isArray(briefing.watcherLeads) ? briefing.watcherLeads[0] : null;
  const checkIn = briefing.claimCheckIn || null;
  const returnPath = briefing.nextAction || null;
  const headline = lead?.title || 'Your Morning Paper';
  const leadCopy = lead
    ? `${lead.page?.title || 'A watched page'} · ${lead.impactSummary || 'not yet analyzed — queued'}`
    : clean(briefing.summary || 'Your wiki is quiet today.');
  const leadHref = absoluteHref(lead?.href || '/wiki', appBaseUrl);
  const returnHref = absoluteHref(returnPath?.href || '/wiki', appBaseUrl);
  const checkInHref = absoluteHref(checkIn?.href || '/wiki', appBaseUrl);
  const html = `<!doctype html><html><body style="margin:0;background:#f5f1e8;color:#171714;font-family:Georgia,serif"><div style="max-width:640px;margin:0 auto;padding:36px 24px"><div style="font:12px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#6d685e">Noeis · Morning Paper</div><h1 style="font-size:34px;line-height:1.08;margin:18px 0 12px">${escapeHtml(headline)}</h1><p style="font-size:18px;line-height:1.55;margin:0 0 24px">${escapeHtml(leadCopy)}</p><a href="${escapeHtml(leadHref)}" style="display:inline-block;background:#171714;color:#fff;padding:12px 18px;text-decoration:none;border-radius:999px">Open the affected page</a>${returnPath ? `<div style="margin-top:28px;padding-top:22px;border-top:1px solid #cdc6b8"><div style="font:11px ui-monospace,monospace;letter-spacing:.12em;color:#6d685e">RETURN PATH</div><p style="margin:8px 0 12px">${escapeHtml(returnPath.label || 'Continue in Noeis')}</p><a href="${escapeHtml(returnHref)}" style="color:#171714">Continue →</a></div>` : ''}${checkIn ? `<div style="margin-top:28px;padding:20px;border:1px solid #cdc6b8;border-radius:14px"><div style="font:11px ui-monospace,monospace;letter-spacing:.12em;color:#6d685e">CLAIM CHECK-IN</div><p style="font-size:18px;line-height:1.45;margin:10px 0 6px">${escapeHtml(checkIn.text)}</p><p style="font:12px ui-monospace,monospace;color:#6d685e">${escapeHtml(checkIn.pageTitle)}</p><a href="${escapeHtml(checkInHref)}" style="color:#171714">Still hold · Revise · Retire →</a></div>` : ''}<p style="margin-top:36px;font:11px/1.5 ui-monospace,monospace;color:#777168">No-news days send nothing. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#777168">Unsubscribe instantly</a>.</p></div></body></html>`;
  const text = [
    'NOEIS · MORNING PAPER',
    headline,
    leadCopy,
    `Open: ${leadHref}`,
    returnPath ? `RETURN PATH: ${returnPath.label || 'Continue'} — ${returnHref}` : '',
    checkIn ? `CLAIM CHECK-IN: ${checkIn.text} (${checkIn.pageTitle}) — ${checkInHref}` : '',
    `Unsubscribe: ${unsubscribeUrl}`
  ].filter(Boolean).join('\n\n');
  return { subject: clean(`Noeis Morning Paper — ${headline}`, 180), html, text };
};

const briefingIsEmpty = (briefing = {}) => {
  const counts = briefing.counts || {};
  return !(Array.isArray(briefing.watcherLeads) && briefing.watcherLeads.length)
    && !briefing.claimCheckIn
    && !briefing.nextAction
    && !Object.values(counts).some(value => Number(value) > 0);
};

const sendWithResend = async ({ apiKey, payload, fetchImpl = global.fetch } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(clean(body.message || `Resend returned HTTP ${response.status}.`, 500));
    return body;
  } finally {
    clearTimeout(timer);
  }
};

const updateUserDeliveryState = async (user, patch = {}) => {
  user.morningPaper = { ...(user.morningPaper?.toObject?.() || user.morningPaper || {}), ...patch };
  await user.save({ timestamps: false });
};

const persistDeliveryReceipt = async ({ NoeisReceipt, userId, status, summary, delivery, reason = '' } = {}) => persistNoeisReceipt({
  NoeisReceipt,
  userId,
  receipt: {
    id: `morning-paper:${delivery.localDate}:${delivery.briefingVersion}`,
    kind: 'morning_paper_email',
    source: 'resend',
    sourceLabel: 'Morning Paper email',
    status,
    summary,
    completedAt: new Date(),
    metrics: { sent: status === 'completed' ? 1 : 0, skipped: status === 'skipped' ? 1 : 0 },
    error: reason ? { message: reason } : null
  }
});

const sendMorningPaperForUser = async ({ user, models = {}, env = process.env, fetchImpl = global.fetch, now = new Date() } = {}) => {
  const config = emailConfig(env);
  const setup = emailConfigurationStatus(env);
  const settings = user?.morningPaper?.toObject?.() || user?.morningPaper || {};
  const localDate = localDateForTimezone(now, settings.timezone || 'UTC');
  const cache = await models.WikiBriefingCache.findOne({ userId: user._id }).lean();
  const briefing = cache?.payload || null;
  const briefingVersion = String(cache?.generatedAt || briefing?.generatedAt || 'missing');
  const prior = await models.MorningPaperDelivery.findOne({ userId: user._id, localDate, briefingVersion }).lean();
  if (prior) return { duplicate: true, delivery: prior };
  const delivery = new models.MorningPaperDelivery({
    userId: user._id,
    localDate,
    briefingVersion,
    status: 'attempting',
    recipient: settings.email || '',
    attemptedAt: now
  });
  try {
    await delivery.save();
  } catch (error) {
    if (Number(error?.code) === 11000) {
      const existing = await models.MorningPaperDelivery.findOne({ userId: user._id, localDate, briefingVersion }).lean();
      return { duplicate: true, delivery: existing };
    }
    throw error;
  }
  const skip = async (reason) => {
    delivery.status = 'skipped'; delivery.skippedAt = now; delivery.skipReason = reason;
    await delivery.save();
    await updateUserDeliveryState(user, { lastAttemptedAt: now, lastSkippedAt: now, lastSkipReason: reason });
    await persistDeliveryReceipt({ NoeisReceipt: models.NoeisReceipt, userId: user._id, status: 'skipped', summary: `Morning Paper skipped: ${reason}.`, delivery, reason });
    return { skipped: true, reason, delivery };
  };
  if (!settings.enabled) return skip('delivery is off');
  if (!settings.email || !settings.emailConfirmedAt) return skip('delivery address is not confirmed');
  if (settings.unsubscribedAt) return skip('user unsubscribed');
  if (!setup.ready) return skip(`email configuration incomplete (${setup.missing.join(', ')})`);
  if (!briefing || briefingIsEmpty(briefing)) return skip('quiet day');
  const token = signUnsubscribeToken({ userId: user._id, version: settings.unsubscribeTokenVersion || 1, secret: config.unsubscribeSecret });
  const unsubscribeUrl = `${config.apiBaseUrl}/api/morning-paper/unsubscribe?token=${encodeURIComponent(token)}`;
  const rendered = renderMorningPaperEmail({ briefing, unsubscribeUrl, appBaseUrl: config.appBaseUrl });
  try {
    const response = await sendWithResend({
      apiKey: config.apiKey,
      fetchImpl,
      payload: {
        from: config.from,
        to: [settings.email],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
      }
    });
    delivery.status = 'sent'; delivery.sentAt = now; delivery.providerMessageId = String(response.id || '');
    await delivery.save();
    await updateUserDeliveryState(user, { lastAttemptedAt: now, lastSentAt: now, lastSkipReason: '' });
    await persistDeliveryReceipt({ NoeisReceipt: models.NoeisReceipt, userId: user._id, status: 'completed', summary: 'Morning Paper email sent.', delivery });
    return { sent: true, delivery, provider: response };
  } catch (error) {
    delivery.status = 'failed'; delivery.failedAt = now; delivery.errorMessage = clean(error.message, 500);
    await delivery.save();
    await updateUserDeliveryState(user, { lastAttemptedAt: now });
    await persistDeliveryReceipt({ NoeisReceipt: models.NoeisReceipt, userId: user._id, status: 'failed', summary: 'Morning Paper email failed.', delivery, reason: error.message });
    throw error;
  }
};

const localHour = (date, timezone) => {
  try { return Number(new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(date)); }
  catch (_error) { return date.getUTCHours(); }
};

const drainDueMorningPaperEmails = async ({ models = {}, env = process.env, fetchImpl = global.fetch, now = new Date(), limit = 50 } = {}) => {
  const users = await models.User.find({
    'morningPaper.enabled': true,
    'morningPaper.emailConfirmedAt': { $ne: null },
    'morningPaper.unsubscribedAt': null
  }).limit(Math.max(1, Math.min(Number(limit) || 50, 500)));
  const due = users.filter(user => localHour(now, user.morningPaper?.timezone || 'UTC') === Number(user.morningPaper?.sendHourLocal ?? 7));
  const results = [];
  for (const user of due) {
    try {
      const localDate = localDateForTimezone(now, user.morningPaper?.timezone || 'UTC');
      const alreadyAttemptedToday = await models.MorningPaperDelivery.findOne({ userId: user._id, localDate }).lean();
      if (alreadyAttemptedToday) {
        results.push({ duplicate: true, delivery: alreadyAttemptedToday });
        continue;
      }
      await buildDailyLoopBriefing({
        userId: user._id,
        models,
        now,
        advanceCursor: false,
        maxAgeMs: Number(env.WIKI_BRIEFING_CACHE_MAX_AGE_MS || 6 * 60 * 60 * 1000)
      });
      results.push(await sendMorningPaperForUser({ user, models, env, fetchImpl, now }));
    } catch (error) {
      results.push({ failed: true, userId: String(user._id), error: clean(error.message, 500) });
    }
  }
  return {
    due: due.length,
    sent: results.filter(row => row.sent).length,
    skipped: results.filter(row => row.skipped || row.duplicate).length,
    failed: results.filter(row => row.failed).length,
    results
  };
};

module.exports = {
  emailConfig,
  emailConfigurationStatus,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  renderMorningPaperEmail,
  briefingIsEmpty,
  sendMorningPaperForUser,
  drainDueMorningPaperEmails,
  sendWithResend
};
