const crypto = require('crypto');
const { persistNoeisReceipt } = require('./noeisReceiptService');
const { localDateForTimezone, buildDailyLoopBriefing } = require('./dailyLoopService');
const { buildKnowledgeMovements, MOVEMENT_KINDS } = require('./knowledgeMovementService');
const { wordBoundaryTrim } = require('../lib/editorialText');

const MOVEMENT_EMAIL_LABELS = {
  claim_changed: 'A claim changed',
  new_evidence: 'New evidence',
  contradiction: 'Contradicted',
  question_answerable: 'A question you can answer',
  connection_formed: 'A connection formed',
  decision_due: 'Decision due',
  outcome_due: 'Outcome due',
  outcome_reviewed: 'An outcome landed'
};

const movementLabel = (kind) => MOVEMENT_EMAIL_LABELS[kind]
  || (MOVEMENT_KINDS.includes(kind) ? 'Changed' : 'Changed');

const clean = (value = '', limit = 2000) => wordBoundaryTrim(String(value || '').replace(/\s+/g, ' ').trim(), { maxLength: limit });
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

const shortEmailDate = (value) => {
  try {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch (_error) {
    return '';
  }
};

const renderMovementsSection = ({ movements = [], appBaseUrl }) => {
  const cards = (Array.isArray(movements) ? movements : []).slice(0, 3).map(movement => {
    const label = movementLabel(movement.kind);
    const date = shortEmailDate(movement.occurredAt);
    const href = absoluteHref(movement.nextAction?.href || movement.subject?.href || '/wiki', appBaseUrl);
    const detail = movement.whyItMatters || '';
    return `<div style="margin-top:16px"><div style="font:11px ui-monospace,monospace;letter-spacing:.12em;color:#6d685e">${escapeHtml(label)}${date ? ` · ${escapeHtml(date)}` : ''}</div><p style="font-size:17px;line-height:1.45;margin:6px 0 2px"><a href="${escapeHtml(href)}" style="color:#171714;text-decoration:none">${escapeHtml(movement.title)}</a></p>${detail ? `<p style="font-size:14px;line-height:1.5;color:#5f5a50;margin:0">${escapeHtml(detail)}</p>` : ''}</div>`;
  }).join('');
  if (!cards) return '';
  return `<div style="margin-top:28px;padding-top:22px;border-top:1px solid #cdc6b8"><div style="font:11px ui-monospace,monospace;letter-spacing:.12em;color:#6d685e">WHAT CHANGED</div>${cards}</div>`;
};

/* A piece coming back with the belief it bears on is a decision. Without it,
   it is a re-read — which is the dead end this whole idea was meant to fix. */
const bearingLine = (row = {}) => {
  const held = clean(row?.bearsOn?.text, 300);
  return held ? ` — bears on: “${held}”` : '';
};

const renderAskedBackSection = ({ askedBack = [], appBaseUrl }) => {
  const items = (Array.isArray(askedBack) ? askedBack : []).filter((row) => row?.title && row?.href);
  if (!items.length) return { html: '', text: '' };
  const cards = items.map((row) => {
    const href = absoluteHref(row.href || '/library', appBaseUrl);
    const detail = [row.fromPlacement === 'later' ? 'later' : row.fromPlacement === 'setAside' ? 'set aside' : '', row.reason].filter(Boolean).join(' · ');
    return `<div style="margin-top:16px"><p style="font-size:17px;line-height:1.45;margin:6px 0 2px"><a href="${escapeHtml(href)}" style="color:#171714;text-decoration:none">${escapeHtml(row.title)}</a></p>${detail ? `<p style="font-size:14px;line-height:1.5;color:#5f5a50;margin:0">${escapeHtml(detail)}</p>` : ''}</div>`;
  }).join('');
  return {
    html: `<div style="margin-top:28px;padding-top:22px;border-top:1px solid #cdc6b8"><div style="font:11px ui-monospace,monospace;letter-spacing:.12em;color:#6d685e">καιρός</div><p style="font-size:16px;line-height:1.5;margin:8px 0 0">You asked for this back.</p>${cards}</div>`,
    text: ['καιρός', 'You asked for this back.', ...items.map((row) => `${row.title} — ${absoluteHref(row.href || '/library', appBaseUrl)}`)].join('\n')
  };
};

/**
 * A belief you wrote down a year ago, in the inbox.
 *
 * The email was built before the paper was, and still carries the old shape.
 * This is the column that travels best: nobody opens an email to read a
 * maintenance table, and "a year ago today you wrote this down" is a reason
 * to come back that no other product can send.
 */
/* Read where the reader is, not in UTC — a weekend is a thing that happens
   where you are, and the paper already decides it that way. */
const isWeekendDay = (now = new Date()) => [0, 6].includes(now.getDay());

const renderAnniversarySection = ({ anniversary = null, appBaseUrl }) => {
  const text = clean(anniversary?.text, 400);
  if (!text) return { html: '', text: '' };
  const years = Number(anniversary.years) || 1;
  const today = anniversary.toTheDay ? ' today' : '';
  const standfirst = years === 1
    ? `A year ago${today} you wrote this down`
    : `${years} years ago${today} you wrote this down`;
  const href = absoluteHref(anniversary.pageId ? `/wiki/${anniversary.pageId}` : '/wiki', appBaseUrl);
  return {
    html: `<div style="margin-top:28px;padding-left:16px;border-left:2px solid #6f87ff"><div style="font:11px ui-monospace,monospace;letter-spacing:.12em;color:#6d685e">${escapeHtml(standfirst.toUpperCase())}</div><p style="font-size:18px;line-height:1.45;margin:10px 0 6px">“${escapeHtml(text)}”</p><p style="font:12px ui-monospace,monospace;color:#6d685e">Not looked at since</p><a href="${escapeHtml(href)}" style="color:#171714">Do you still hold it? →</a></div>`,
    text: `${standfirst.toUpperCase()}: “${text}” — ${href}`
  };
};

/**
 * The thing you said would change your mind, in the inbox.
 *
 * This is the one column that genuinely wants to arrive rather than wait to
 * be visited: a falsifier a watcher matched is time-sensitive in a way an
 * anniversary is not. It leads the email for the same reason it leads the
 * paper, and it asks for the same two verbs — read it, then say.
 */
const renderWarnedSection = ({ warned = null, appBaseUrl }) => {
  const text = clean(warned?.text, 400);
  if (!text) return { html: '', text: '' };
  const href = absoluteHref(warned.pageId ? `/judgment/${warned.pageId}` : '/judgment', appBaseUrl);
  const where = clean(warned.pageTitle, 200);
  return {
    html: `<div style="margin-top:28px;padding-left:16px;border-left:3px solid #b8860b"><div style="font:11px ui-monospace,monospace;letter-spacing:.12em;color:#b8860b">THE THING YOU SAID WOULD CHANGE YOUR MIND MAY HAVE HAPPENED</div><p style="font-size:18px;line-height:1.45;margin:10px 0 6px">“${escapeHtml(text)}”</p>${where ? `<p style="font:12px ui-monospace,monospace;color:#6d685e">On ${escapeHtml(where)}</p>` : ''}<a href="${escapeHtml(href)}" style="color:#171714">Read it, then say: held, or broke →</a></div>`,
    text: `THE THING YOU SAID WOULD CHANGE YOUR MIND MAY HAVE HAPPENED: “${text}”${where ? ` (${where})` : ''} — ${href}`
  };
};

const renderMorningPaperEmail = ({ briefing = {}, movements = [], unsubscribeUrl, appBaseUrl = 'https://www.noeis.io' } = {}) => {
  const lead = Array.isArray(briefing.watcherLeads) ? briefing.watcherLeads[0] : null;
  const checkIn = briefing.claimCheckIn || null;
  const askedBack = renderAskedBackSection({ askedBack: briefing.askedBack, appBaseUrl });
  const anniversary = renderAnniversarySection({ anniversary: briefing.anniversary, appBaseUrl });
  const warned = renderWarnedSection({ warned: briefing.warned, appBaseUrl });
  const returnPath = briefing.nextAction || null;
  const headline = lead?.title || 'Your Morning Paper';
  /* The subject is the lead's first six words, or "Quiet night." on a morning
     with no lead. A subject line that always reads the same is a subject line
     nobody reads, and one that says "Your Morning Paper" says nothing about
     this morning in particular. */
  const subjectLine = emailSubject(lead?.title, { weekend: isWeekendDay() });
  const leadCopy = lead
    ? `${lead.page?.title || 'A watched page'} · ${lead.impactSummary || 'not yet analyzed — queued'}`
    : clean(briefing.summary || 'Your wiki is quiet today.');
  const leadHref = absoluteHref(lead?.href || '/wiki', appBaseUrl);
  const returnHref = absoluteHref(returnPath?.href || '/wiki', appBaseUrl);
  const checkInHref = absoluteHref(checkIn?.href || '/wiki', appBaseUrl);
  const movementsHtml = renderMovementsSection({ movements, appBaseUrl });
  const movementLines = (Array.isArray(movements) ? movements : []).slice(0, 3).map(movement => {
    const href = absoluteHref(movement.nextAction?.href || movement.subject?.href || '/wiki', appBaseUrl);
    return `${movementLabel(movement.kind).toUpperCase()}: ${movement.title} — ${href}`;
  });
  const html = `<!doctype html><html><body style="margin:0;background:#f5f1e8;color:#171714;font-family:Georgia,serif"><div style="max-width:640px;margin:0 auto;padding:36px 24px"><div style="font:12px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#6d685e">Noeis · Morning Paper</div><h1 style="font-size:34px;line-height:1.08;margin:18px 0 12px">${escapeHtml(headline)}</h1><p style="font-size:18px;line-height:1.55;margin:0 0 24px">${escapeHtml(leadCopy)}</p><a href="${escapeHtml(leadHref)}" style="display:inline-block;background:#171714;color:#fff;padding:12px 18px;text-decoration:none;border-radius:999px">Open the affected page</a>${warned.html}${movementsHtml}${returnPath ? `<div style="margin-top:28px;padding-top:22px;border-top:1px solid #cdc6b8"><div style="font:11px ui-monospace,monospace;letter-spacing:.12em;color:#6d685e">RETURN PATH</div><p style="margin:8px 0 12px">${escapeHtml(returnPath.label || 'Continue in Noeis')}</p><a href="${escapeHtml(returnHref)}" style="color:#171714">Continue →</a></div>` : ''}${checkIn ? `<div style="margin-top:28px;padding:20px;border:1px solid #cdc6b8;border-radius:14px"><div style="font:11px ui-monospace,monospace;letter-spacing:.12em;color:#6d685e">CLAIM CHECK-IN</div><p style="font-size:18px;line-height:1.45;margin:10px 0 6px">${escapeHtml(checkIn.text)}</p><p style="font:12px ui-monospace,monospace;color:#6d685e">${escapeHtml(checkIn.pageTitle)}</p><a href="${escapeHtml(checkInHref)}" style="color:#171714">Still hold · Revise · Retire →</a></div>` : ''}${askedBack.html}${anniversary.html}<p style="margin-top:36px;font:11px/1.5 ui-monospace,monospace;color:#777168">No-news days send nothing. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#777168">Unsubscribe instantly</a>.</p></div></body></html>`;
  const text = [
    'NOEIS · MORNING PAPER',
    headline,
    leadCopy,
    `Open: ${leadHref}`,
    warned.text,
    movementLines.length ? ['WHAT CHANGED:', ...movementLines].join('\n') : '',
    returnPath ? `RETURN PATH: ${returnPath.label || 'Continue'} — ${returnHref}` : '',
    checkIn ? `CLAIM CHECK-IN: ${checkIn.text} (${checkIn.pageTitle}) — ${checkInHref}` : '',
    askedBack.text,
    anniversary.text,
    `Unsubscribe: ${unsubscribeUrl}`
  ].filter(Boolean).join('\n\n');
  return { subject: clean(subjectLine, 180), html, text };
};

/**
 * The lead's first six words, or the quiet-night sign-off.
 *
 * A weekend edition says so, because the subject line is the only part of the
 * paper most people read on a Saturday and "the weekend paper" tells them
 * what kind of morning is waiting.
 */
const emailSubject = (leadTitle = '', { weekend = false } = {}) => {
  const words = String(leadTitle || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return weekend ? 'The weekend paper.' : 'Quiet night.';
  const lead = words.slice(0, 6).join(' ');
  return weekend ? `${lead} · the weekend paper` : lead;
};

const briefingIsEmpty = (briefing = {}) => {
  const counts = briefing.counts || {};
  return !(Array.isArray(briefing.watcherLeads) && briefing.watcherLeads.length)
    && !briefing.claimCheckIn
    && !briefing.nextAction
    && !(Array.isArray(briefing.askedBack) && briefing.askedBack.length)
    /* A belief you have not revisited in a year is news, even on a morning
       when the corpus did nothing — and a falsifier that may have fired is
       the most urgent thing the paper can carry. */
    && !clean(briefing.anniversary?.text)
    && !clean(briefing.warned?.text)
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
  let movements = [];
  try {
    movements = await buildKnowledgeMovements({
      userId: user._id,
      models,
      since: new Date(settings.lastOpenedAt || now.getTime() - (24 * 60 * 60 * 1000)).toISOString(),
      limit: 5,
      asOf: now
    });
    if (!Array.isArray(movements)) movements = [];
  } catch (_error) {
    movements = [];
  }
  if ((!briefing || briefingIsEmpty(briefing)) && movements.length === 0) return skip('quiet day');
  const token = signUnsubscribeToken({ userId: user._id, version: settings.unsubscribeTokenVersion || 1, secret: config.unsubscribeSecret });
  const unsubscribeUrl = `${config.apiBaseUrl}/api/morning-paper/unsubscribe?token=${encodeURIComponent(token)}`;
  const rendered = renderMorningPaperEmail({ briefing, movements, unsubscribeUrl, appBaseUrl: config.appBaseUrl });
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
  emailSubject,
  renderMorningPaperEmail,
  briefingIsEmpty,
  sendMorningPaperForUser,
  drainDueMorningPaperEmails,
  sendWithResend
};
