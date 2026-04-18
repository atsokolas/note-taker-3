#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL || 'http://localhost:5500';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const USERNAME = process.env.QA_SEED_USERNAME || 'qa_editor_seed';
const PASSWORD = process.env.QA_SEED_PASSWORD || 'QaSeed1234';
const NOTE_TITLE = 'QA notebook page';
const WORKING_CONCEPT = 'QA Slash Concept';
const FRESH_CONCEPT = 'QA Fresh Concept';

const request = async (path, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = text;
  }
  if (!response.ok) {
    const message = data?.error || data?.details || response.statusText;
    throw new Error(`${response.status} ${message}`);
  }
  return data;
};

const login = async () => request('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: USERNAME, password: PASSWORD })
});

const ensureLogin = async () => {
  try {
    return await login();
  } catch (error) {
    if (!String(error.message || '').startsWith('401')) throw error;
    await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD })
    });
    return login();
  }
};

const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
});

const ensureNotebook = async (token) => {
  const entries = await request('/api/notebook', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const existing = Array.isArray(entries)
    ? entries.find((entry) => String(entry?.title || '').trim() === NOTE_TITLE)
    : null;

  if (existing?._id) return existing;

  return request('/api/notebook', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      title: NOTE_TITLE,
      content: '',
      blocks: []
    })
  });
};

const ensureConcept = async (token, name, description = '') => request(`/api/concepts/${encodeURIComponent(name)}`, {
  method: 'PUT',
  headers: authHeaders(token),
  body: JSON.stringify({ description })
});

const main = async () => {
  const auth = await ensureLogin();
  const token = auth.token;
  if (!token) throw new Error('No auth token returned from login.');

  const notebook = await ensureNotebook(token);
  const workingConcept = await ensureConcept(
    token,
    WORKING_CONCEPT,
    'QA concept for slash command browser verification.'
  );
  const freshConcept = await ensureConcept(token, FRESH_CONCEPT, '');

  console.log(`QA seed user: ${USERNAME}`);
  console.log(`Notebook: ${APP_URL}/think?tab=notebook&entryId=${notebook._id}&devToken=${token}`);
  console.log(`Fresh concept: ${APP_URL}/think?tab=concepts&concept=${encodeURIComponent(freshConcept.name || FRESH_CONCEPT)}&devToken=${token}`);
  console.log(`Working concept: ${APP_URL}/think?tab=concepts&concept=${encodeURIComponent(workingConcept.name || WORKING_CONCEPT)}&devToken=${token}`);
  console.log(`Integrations: ${APP_URL}/data-integrations?devToken=${token}`);
};

main().catch((error) => {
  console.error(`Failed to seed QA editor state: ${error.message}`);
  process.exit(1);
});
