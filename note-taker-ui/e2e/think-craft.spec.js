const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { appendDevToken, installDevAuth } = require('./helpers/session');

const NOTE_ID = '64f200000000000000000101';
const ARTIFACT_DIR = process.env.THINK_CRAFT_ARTIFACT_DIR || '/tmp/noeis-think-craft';

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body)
});

const paragraph = (id, text) => ({ id, type: 'paragraph', text });

const fixture = () => ({
  _id: NOTE_ID,
  title: 'Who gets to experiment, who carries the consequence, and what must remain possible to undo?',
  type: 'note',
  tags: [],
  createdAt: '2026-09-15T14:00:00.000Z',
  updatedAt: '2026-09-16T14:00:00.000Z',
  blocks: [
    paragraph('opening', 'A useful tool should let a thought stay incomplete without making it feel lost.'),
    paragraph('exception', 'The exception is when the cost of an experiment lands on someone who never chose it.'),
    {
      id: 'quote-1',
      type: 'highlight_embed',
      highlightId: 'highlight-1',
      articleId: 'article-1',
      articleTitle: 'The Shape of Reversible Work',
      text: 'Reversibility is a form of respect for the person who comes back later.',
      sourcePath: '/library?articleId=article-1&highlightId=highlight-1'
    },
    paragraph('closing', 'The page should remember both the sentence and the possibility beside it.')
  ],
  asidePieces: [{
    id: 'aside-1',
    label: 'A sharper opening that may belong later.',
    index: 1,
    beforeId: 'opening',
    afterId: 'exception',
    nodes: [{
      type: 'paragraph',
      attrs: { blockId: 'aside-1' },
      content: [{ type: 'text', text: 'A sharper opening that may belong later.' }]
    }]
  }],
  workingState: {
    revision: 3,
    materials: [{
      id: 'material-1',
      kind: 'highlight',
      title: 'The Shape of Reversible Work',
      text: 'A nearby passage can remain a possibility before it becomes part of the argument.',
      sourceId: 'highlight-2',
      highlightId: 'highlight-2',
      articleId: 'article-1',
      sourcePath: '/library?articleId=article-1&highlightId=highlight-2',
      target: { blockId: 'exception', offset: 12, baseText: 'The exception is when the cost of an experiment lands on someone who never chose it.' }
    }],
    trials: [{
      id: 'trial-1',
      target: { blockId: 'exception', offset: 12, baseText: 'The exception is when the cost of an experiment lands on someone who never chose it.' },
      alternative: 'The exception begins when someone else inherits the downside of an experiment they never chose.',
      origin: 'human',
      updatedAt: '2026-09-16T14:10:00.000Z'
    }],
    looseThoughts: [{
      id: 'thought-1',
      text: 'Distinguish reversibility from the illusion that nothing has consequences.',
      target: { blockId: 'exception', offset: 12, baseText: 'The exception is when the cost of an experiment lands on someone who never chose it.' },
      createdAt: '2026-09-16T14:12:00.000Z'
    }],
    nextTimeLine: {
      text: 'Return to the distinction between reversibility and consequence.',
      target: { blockId: 'closing', offset: 4, baseText: 'The page should remember both the sentence and the possibility beside it.' },
      updatedAt: '2026-09-16T14:15:00.000Z'
    },
    continuity: {
      target: { blockId: 'opening', offset: 0, baseText: 'A useful tool should let a thought stay incomplete without making it feel lost.' },
      scrollY: 0,
      updatedAt: '2026-09-16T14:16:00.000Z'
    }
  }
});

async function installMocks(page) {
  let note = fixture();
  await page.route(/.*\/(api\/|articles\/|get-articles|folders).*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const requestPath = url.pathname;
    const method = request.method();

    if (requestPath === '/api/ui-settings') return json(route, {});
    if (requestPath === '/api/onboarding/state') return json(route, { complete: true });
    if (requestPath === '/api/notebook' && method === 'GET') return json(route, [note]);
    if (requestPath === `/api/notebook/${NOTE_ID}` && method === 'GET') return json(route, note);
    if (requestPath === `/api/notebook/${NOTE_ID}` && method === 'PUT') {
      note = { ...note, ...request.postDataJSON(), updatedAt: new Date().toISOString() };
      return json(route, note);
    }
    if (requestPath === `/api/notebook/${NOTE_ID}/workbench` && method === 'PUT') {
      const body = request.postDataJSON();
      note.workingState = { ...body.workingState, revision: Number(body.expectedRevision || 0) + 1 };
      return json(route, { workingState: note.workingState });
    }
    if (requestPath === '/api/authored-explorations') return json(route, { explorations: [] });
    if (requestPath === '/api/highlights') return json(route, []);
    if (requestPath === '/articles/article-1/evergreen') return json(route, { _id: 'article-1', evergreen: false });
    if (requestPath === '/get-articles' || requestPath === '/folders') return json(route, []);
    if (method === 'GET') return json(route, []);
    return json(route, { ok: true });
  });
}

async function openCraftNote(page, width) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  await page.setViewportSize({ width, height: width <= 430 ? 844 : 980 });
  const token = await installDevAuth(page);
  await installMocks(page);
  await page.goto(appendDevToken(`/think?tab=notebook&entryId=${NOTE_ID}`, token), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    document.querySelector('.think-notebook-title-input')?.value?.includes('Who gets to experiment')
  ));
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(/Who gets to experiment/);
  await expect(page.locator('.ProseMirror')).toContainText('A useful tool should let a thought stay incomplete');
  await expect.poll(() => page.locator('.think-notebook-title-input').evaluate(element => (
    Number.parseFloat(window.getComputedStyle(element).fontSize)
  ))).toBe(width <= 430 ? 31 : 38);
}

test('Think craft preserves the quiet draft and one focused context area', async ({ page }) => {
  await openCraftNote(page, 1440);
  await expect(page.locator('aside[aria-label="Note context"]')).toBeHidden();
  await expect(page.getByText('A line you left yourself')).toBeVisible();
  await expect(page.getByLabel('A line you left yourself').getByText('Return to the distinction between reversibility and consequence.')).toBeVisible();
  const geometry = await page.evaluate(() => {
    const title = document.querySelector('.think-notebook-title-input');
    const writing = document.querySelector('.ProseMirror');
    const note = document.querySelector('.think-notes__note');
    const titleStyle = window.getComputedStyle(title);
    const titleBox = title.getBoundingClientRect();
    const writingBox = writing.getBoundingClientRect();
    const noteBox = note.getBoundingClientRect();
    return {
      titleFontSize: Number.parseFloat(titleStyle.fontSize),
      titleLineHeight: Number.parseFloat(titleStyle.lineHeight),
      titleHeight: titleBox.height,
      writingGap: writingBox.top - titleBox.bottom,
      writingTop: writingBox.top,
      viewportHeight: window.innerHeight,
      noteWidth: noteBox.width
    };
  });
  expect(geometry.titleFontSize).toBeGreaterThanOrEqual(36);
  expect(geometry.titleFontSize).toBeLessThanOrEqual(40);
  expect(geometry.titleLineHeight).toBeLessThanOrEqual(46);
  expect(geometry.titleHeight).toBeLessThan(150);
  // The fixture carries both a next-time line and its source provenance.
  // Those are meaningful context, so guard the visible writing position
  // rather than pretending the whole interval is empty margin.
  expect(geometry.writingGap).toBeLessThan(240);
  expect(geometry.writingTop).toBeLessThan(geometry.viewportHeight * 0.85);
  expect(geometry.noteWidth).toBeGreaterThanOrEqual(620);
  expect(geometry.noteWidth).toBeLessThanOrEqual(680);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01-resting-draft.png'), fullPage: true });
  await page.locator('.think-next-line').screenshot({ path: path.join(ARTIFACT_DIR, '06-next-time-line.png') });

  await page.getByRole('button', { name: 'Material' }).click();
  await expect(page.getByRole('heading', { name: 'Beside this note' })).toBeVisible();
  const widePanelBox = await page.locator('aside[aria-label="Note context"]').boundingBox();
  expect(widePanelBox.x + widePanelBox.width, JSON.stringify(widePanelBox)).toBeLessThanOrEqual(1440);
  await expect(page.getByText('Your place is held.')).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '02-material-held-target.png') });

  await expect(page.getByText('Distinguish reversibility from the illusion')).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '04-held-thought.png') });
  await expect(page.getByText('A sharper opening that may belong later.')).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '05-set-aside.png') });

  await page.getByRole('button', { name: 'Close note context' }).click();
  await page.locator('.ProseMirror p').filter({ hasText: 'The exception is when' }).click();
  await page.getByRole('button', { name: /Arrange this passage: The exception is when/ }).click();
  await page.getByRole('button', { name: 'Try another wording' }).click();
  await expect(page.getByRole('heading', { name: 'Try another wording' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Try another wording' })).toBeInViewport();
  await expect(page.getByLabel('Alternative')).toHaveValue(/The exception begins/);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03-trial-in-context.png') });
});

test('Think craft keeps context reachable at tablet widths', async ({ page }) => {
  for (const width of [1024, 768]) {
    await openCraftNote(page, width);
    await page.getByRole('button', { name: 'Material' }).click();
    const panel = page.locator('aside[aria-label="Note context"]');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await expect(page.locator('.think-notes__note')).toHaveAttribute('aria-hidden', 'true');
    await page.getByRole('button', { name: 'Close note context' }).click();
  }
});

test('Think craft becomes a single focused writing flow on phone', async ({ page }) => {
  await openCraftNote(page, 390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const titleFontSize = await page.locator('.think-notebook-title-input').evaluate(element => (
    Number.parseFloat(window.getComputedStyle(element).fontSize)
  ));
  expect(titleFontSize).toBeGreaterThanOrEqual(30);
  expect(titleFontSize).toBeLessThanOrEqual(34);
  await expect(page.getByLabel('Note utilities')).toContainText('Saved');
  await expect(page.getByLabel('Note utilities')).not.toContainText('Edit');
  await page.getByRole('button', { name: 'Material' }).click();
  await expect(page.getByRole('heading', { name: 'Beside this note' })).toBeVisible();
  await expect(page.locator('.think-notes__note')).toHaveAttribute('aria-hidden', 'true');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '07-phone-context.png') });
});
