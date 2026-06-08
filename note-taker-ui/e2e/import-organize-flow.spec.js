/* eslint-disable testing-library/prefer-screen-queries */
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { test, expect } = require('@playwright/test');
const {
  appendDevToken,
  bootstrapAuthenticatedPage,
  buildPausedTourState
} = require('./helpers/session');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL || 'http://127.0.0.1:5500';

const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`
});

const apiUrl = (route = '') => `${API_BASE_URL}${String(route || '')}`;

const createSignedToken = ({ userId, username }) => jwt.sign(
  {
    id: String(userId),
    sub: String(userId),
    username: String(username || '').trim()
  },
  process.env.JWT_SECRET,
  { expiresIn: '2h' }
);

const createFixtureUserId = () => crypto.randomBytes(12).toString('hex');

const ensureJwtSecret = async () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required for live import organization Playwright tests.');
  }
};

const getNotebookState = async ({ request, token, noteId }) => {
  const [entryResponse, foldersResponse] = await Promise.all([
    request.get(apiUrl(`/api/notebook/${encodeURIComponent(noteId)}`), { headers: authHeaders(token) }),
    request.get(apiUrl('/api/notebook/folders'), { headers: authHeaders(token) })
  ]);
  expect(entryResponse.ok()).toBeTruthy();
  expect(foldersResponse.ok()).toBeTruthy();
  return {
    entry: await entryResponse.json(),
    folders: await foldersResponse.json()
  };
};

test.describe.serial('import organization browser flow', () => {
  let fixture = null;
  let token = '';

  test.beforeAll(async () => {
    await ensureJwtSecret();
  });

  test.afterEach(async ({ request }) => {
    if (!token) return;
    await request.delete(apiUrl('/api/debug/fixtures/import-organization'), {
      headers: authHeaders(token)
    }).catch(() => null);
    fixture = null;
    token = '';
  });

  test('import CTA opens a review thread and supports reject/apply/rollback on a real structure plan', async ({ page, request }) => {
    token = createSignedToken({
      userId: createFixtureUserId(),
      username: `pw-import-organize-${Date.now()}`
    });

    const fixtureResponse = await request.post(apiUrl('/api/debug/fixtures/import-organization'), {
      headers: authHeaders(token)
    });
    expect(fixtureResponse.ok()).toBeTruthy();
    const fixturePayload = await fixtureResponse.json();
    fixture = fixturePayload.fixture;

    await page.route('**/api/agent/chat', async (route) => {
      const payload = route.request().postDataJSON() || {};
      expect(payload.context?.type).toBe('import_session');
      expect(String(payload.context?.id || '')).toBe(fixture.sessionId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          reply: 'I staged an organization plan for this import.',
          thread: {
            threadId: fixture.threadId,
            title: 'Notion cleanup',
            messages: [
              {
                role: 'assistant',
                text: 'I staged an organization plan for this import.'
              }
            ]
          }
        })
      });
    });

    await bootstrapAuthenticatedPage(page, {
      token,
      bootstrapRoute: '/think?tab=home',
      workspacePanels: ['/think', '/data-integrations'],
      pausedTourState: buildPausedTourState(),
      dismissTour: true
    });

    await page.goto(appendDevToken('/data-integrations', token));
    await expect(page.getByRole('button', { name: 'Organize this import' })).toBeVisible();

    await page.getByRole('button', { name: 'Organize this import' }).click();
    await page.waitForURL(new RegExp(`/think\\?tab=threads&threadId=${fixture.threadId}$`));

    const proposalCard = page.getByTestId(`structure-proposal-${fixture.proposalId}`);
    await expect(proposalCard).toBeVisible();
    await expect(proposalCard).toContainText('Organize Product Wiki import');

    const renameStep = proposalCard.locator('.agent-thought-partner__structure-step').filter({
      hasText: `Rename ${fixture.sourceFolderName} to ${fixture.rejectedRenameTarget}`
    });
    await renameStep.getByRole('button', { name: 'Reject step' }).click();
    await expect(renameStep.getByText('rejected')).toBeVisible();

    await proposalCard.getByRole('button', { name: 'Apply approved changes' }).click();
    await expect(proposalCard.getByRole('button', { name: 'Roll back' })).toBeVisible();
    await expect(proposalCard.locator('.agent-thought-partner__history-timestamp')).toContainText('Applied');

    await expect.poll(async () => {
      const state = await getNotebookState({
        request,
        token,
        noteId: fixture.noteId
      });
      const createdFolder = state.folders.find((folder) => folder.name === fixture.createdFolderName) || null;
      const sourceFolder = state.folders.find((folder) => String(folder._id) === fixture.sourceFolderId) || null;
      return {
        noteFolder: String(state.entry?.folder || ''),
        createdFolderName: createdFolder?.name || '',
        sourceFolderName: sourceFolder?.name || ''
      };
    }).toEqual({
      noteFolder: expect.any(String),
      createdFolderName: fixture.createdFolderName,
      sourceFolderName: fixture.sourceFolderName
    });

    const appliedState = await getNotebookState({
      request,
      token,
      noteId: fixture.noteId
    });
    const createdFolder = appliedState.folders.find((folder) => folder.name === fixture.createdFolderName);
    expect(createdFolder).toBeTruthy();
    expect(String(appliedState.entry.folder || '')).toBe(String(createdFolder._id));
    expect(appliedState.folders.some((folder) => folder.name === fixture.rejectedRenameTarget)).toBeFalsy();

    await proposalCard.getByRole('button', { name: 'Roll back' }).click();
    await expect(proposalCard.locator('.agent-thought-partner__history-timestamp')).toContainText('Rolled back');

    await expect.poll(async () => {
      const state = await getNotebookState({
        request,
        token,
        noteId: fixture.noteId
      });
      return {
        noteFolder: String(state.entry?.folder || ''),
        createdFolderExists: state.folders.some((folder) => folder.name === fixture.createdFolderName),
        sourceFolderName: (state.folders.find((folder) => String(folder._id) === fixture.sourceFolderId) || {}).name || ''
      };
    }).toEqual({
      noteFolder: fixture.sourceFolderId,
      createdFolderExists: false,
      sourceFolderName: fixture.sourceFolderName
    });

    const metricsResponse = await request.get(
      apiUrl(`/api/agent/harness-metrics?threadId=${encodeURIComponent(fixture.threadId)}`),
      { headers: authHeaders(token) }
    );
    expect(metricsResponse.ok()).toBeTruthy();
    const metricsPayload = await metricsResponse.json();
    expect(metricsPayload.metrics?.structureProposalStatuses?.rolled_back).toBe(1);
    expect(metricsPayload.metrics?.undoSignals?.structureProposalRolledBack).toBe(1);

  });
});
