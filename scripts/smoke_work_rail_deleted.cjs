// Built UI only, synthetic account and API. No request may reach a real backend.
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { chromium } = require('../note-taker-ui/node_modules/playwright');
const root = path.resolve('note-taker-ui/build'), shots = path.resolve('tmp/work-rail-deleted');
fs.mkdirSync(shots, { recursive: true });
const id = n => String(n).padStart(24, '0'), today = '2026-11-16';
const task = (n, title, extra = {}) => ({ _id: id(n), revision: 0, title, takenOn: today, capturedAt: today + 'T12:00:00Z', timeZone: 'UTC', workItem: { kind: 'task', list: 'next', history: [], ...extra } });
const data = { entries: [{ _id: id(12), revision: 0, title: 'Testing handoff', content: '<p>Preserve this original note.</p>', project: id(11), takenOn: today, capturedAt: today + 'T12:00:00Z', timeZone: 'UTC' }], folders: [{ _id: id(11), revision: 0, name: 'BMS 5.0', kind: 'project', brief: 'Build the next generation.' }], items: [task(1, 'Draft application'), task(2, 'Compare deadlines'), task(3, 'Ask founders', { plannedOn: '2026-11-13' }), task(5, 'Send update', { plannedOn: today }), task(13, 'Confirm testing handoff', { plannedOn: today, noteId: id(12) }), { _id: id(20), revision: 0, title: 'Week', workItem: { kind: 'week', plannedOn: today, priorities: [{ id: 'accelerators', title: 'Apply to accelerators', taskIds: [id(1)], status: 'active', reviewed: true }, { id: 'product', title: 'Improve product', taskIds: [], status: 'active', reviewed: true }] } }] };
data.items.push({ _id: id(21), revision: 0, title: 'Prior week', workItem: { kind: 'week', plannedOn: '2026-11-09', priorities: [{ id: 'previous', title: 'Clarify shortlist', taskIds: [id(2)], status: 'active', reviewed: true }] } });
let creates = 0, deletes = 0, restores = 0, theme = 'light';
const server = http.createServer((req, res) => { let file = path.join(root, req.url.split('?')[0]); if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html'); res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html'); fs.createReadStream(file).pipe(res); });
let browser;
(async () => {
  assert.ok(fs.existsSync(path.join(root, 'index.html')), 'Build the UI before smoke testing.');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ timezoneId: 'America/Chicago' }); page.setDefaultTimeout(12000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(today + 'T14:00:00Z') });
  await page.addInitScript(() => { localStorage.setItem('token', 'x.' + btoa(JSON.stringify({ id: 'synthetic-rail-deleted-qa', exp: 9999999999 })) + '.x'); localStorage.setItem('ui-settings.v1', JSON.stringify({ theme: 'tokyo-night' })); });
  await page.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname, method = req.method();
    if (p.startsWith('/_vercel/')) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (!p.startsWith('/api/') && u.hostname === '127.0.0.1') return route.continue();
    if (p === '/api/ui-settings') return route.fulfill({ json: { theme } });
    const record = [...data.entries, ...data.items].find(x => x._id === p.split('/').at(-1));
    if (p.endsWith('/delete-preview')) return route.fulfill({ json: { revision: data.folders[0].revision, reviewToken: 'review-exact-fixture', retentionDays: 14, consentVersion: 1, counts: { notes: 1, tasks: 1, excludedTasks: 0, alreadyDeleted: 0 } } });
    if (p.match(/\/projects\/[^/]+\/(delete|restore)$/) && method === 'POST') {
      const body = req.postDataJSON(), project = data.folders[0], entries = [data.entries[0], data.items.find(x => x._id === id(13))];
      if (p.endsWith('/delete')) { assert.equal(body.expectedRevision, project.revision); assert.equal(body.reviewToken, 'review-exact-fixture'); assert.ok(body.operationId); assert.equal(body.autoErase, true); deletes++; project.deleted = { batchId: body.operationId, deletedAt: today + 'T14:00:00Z', expiresAt: '2026-11-30T14:00:00Z', autoErase: true, consentVersion: 1 }; entries.forEach(x => { x.trashedAt = project.deleted.deletedAt; x.deletionBatchId = body.operationId; x.revision++; }); }
      else { assert.equal(body.operationId, project.deleted.batchId); restores++; project.deleted.restoredAt = today + 'T14:01:00Z'; entries.forEach(x => { x.trashedAt = null; x.deletionBatchId = null; x.revision++; }); }
      project.revision++; return route.fulfill({ json: { project, entries, receipt: { operationId: body.operationId } } });
    }
    if (p === '/api/work-notes' && method === 'POST') { const body = req.postDataJSON(), created = { ...body, _id: id(100 + creates++), revision: 0 }; (body.workItem ? data.items : data.entries).push(created); return route.fulfill({ json: created }); }
    if (p.includes('/weeks/') && method === 'PUT') { const body = req.postDataJSON(), week = data.items.find(x => x.workItem?.kind === 'week' && x.workItem.plannedOn === p.split('/').at(-1)); assert.equal(body.expectedRevision, week.revision); week.workItem.priorities = body.priorities; week.revision++; return route.fulfill({ json: week }); }
    if (p.includes('/folders/') && method === 'PUT') { Object.assign(data.folders[0], req.postDataJSON(), { revision: data.folders[0].revision + 1 }); return route.fulfill({ json: data.folders[0] }); }
    if (record && method === 'PUT') {
      const { workActions = [], workItem, ...body } = req.postDataJSON();
      Object.assign(record, body, { revision: record.revision + 1 });
      if (workItem) record.workItem = { ...workItem, history: [...(record.workItem?.history || []), ...workActions] };
      return route.fulfill({ json: record });
    }
    return route.fulfill({ json: p === '/api/work-notes' ? data : p === '/api/work-notes/projects' ? data.folders : {} });
  });
  const url = `http://127.0.0.1:${server.address().port}/work`;
  const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal page overflow');
  const shot = async name => {
    // CSS masks can finish after the menu's first paint; capture the settled visual, not an empty icon slot.
    await page.evaluate(async () => {
      await document.fonts.ready;
      const masks = [...document.querySelectorAll('.work-icon')].map(el => getComputedStyle(el).maskImage).filter(mask => mask.startsWith('url('));
      await Promise.all([...new Set(masks)].map(mask => new Promise((resolve, reject) => {
        const image = new Image(); image.onload = resolve; image.onerror = () => reject(new Error('Icon mask failed: ' + mask)); image.src = mask.slice(4, -1).replace(/^"|"$/g, '');
      })));
    });
    return page.screenshot({ path: path.join(shots, name + '.png'), fullPage: !name.includes('menu'), animations: 'disabled' });
  };
  const menuFits = async menu => { const box = await menu.boundingBox(), viewport = page.viewportSize(); assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, JSON.stringify({ box, viewport })); };
  for (const width of [1440, 1280, 430]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto(url);
    const nav = page.getByRole('navigation', { name: 'Work navigation' });
    const day = page.locator('.work-day-tasks');
    await day.getByRole('checkbox', { name: 'Send update' }).waitFor();
    assert.equal(await page.locator('.work-earlier').getAttribute('open'), null);
    await page.getByRole('textbox', { name: 'Day notes' }).waitFor();
    assert.equal(await day.getByRole('button', { name: 'Add to-do', exact: true }).count(), 1);
    await noOverflow(); await shot('today-' + width);
    await day.getByRole('button', { name: 'Add to-do', exact: true }).click();
    await day.getByRole('textbox', { name: 'Add a line' }).fill('Detailed draft ' + width);
    await day.locator(':scope > summary').focus(); await page.keyboard.press('Enter'); assert.equal(await day.getAttribute('open'), null);
    await page.keyboard.press('Space'); assert.equal(await day.getByRole('textbox', { name: 'Add a line' }).inputValue(), 'Detailed draft ' + width);
    await day.getByRole('button', { name: 'More details', exact: true }).click();
    assert.equal(await page.getByRole('dialog').getByLabel('Item', { exact: true }).inputValue(), 'Detailed draft ' + width);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(creates, 0);
    await nav.getByRole('button', { name: /^Actions/ }).click();
    const next = page.getByRole('region', { name: 'Next', exact: true });
    await next.getByRole('checkbox', { name: 'Draft application' }).waitFor();
    await next.getByRole('button', { name: 'Apply to accelerators' }).waitFor();
    assert.equal(await next.getByRole('checkbox', { name: 'Send update', exact: true }).count(), 0);
    assert.equal(await page.getByRole('region', { name: 'Waiting on', exact: true }).count(), 0);
    await noOverflow(); await shot('actions-' + width);
    await next.getByRole('button', { name: 'Apply to accelerators' }).click();
    const fold = page.getByRole('button', { name: 'Apply to accelerators', exact: true });
    await fold.focus(); await page.keyboard.press('Space'); assert.equal(await fold.getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('Enter'); assert.equal(await fold.getAttribute('aria-expanded'), 'true');
    await noOverflow(); await shot('weekly-' + width);
    await page.goto(url + '?view=project&folder=' + id(11));
    await page.getByRole('heading', { name: data.folders[0].name, exact: true }).waitFor();
    const trigger = page.locator('.work-project-head summary');
    await trigger.focus(); await page.keyboard.press('ArrowDown');
    await menuFits(page.locator('.work-project-head .work-menu-body'));
    const menuColors = await page.locator('.work-project-head .work-menu-body').evaluate(el => ({ neutral: getComputedStyle(el.querySelector('button')).color, danger: getComputedStyle(el.querySelector('.work-destructive')).color }));
    assert.notEqual(menuColors.danger, menuColors.neutral, 'Delete project must retain its danger color');
    await shot('project-menu-' + width);
    await page.keyboard.press('Escape'); assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
    await trigger.click(); await page.locator('.work-project-head').getByRole('button', { name: 'Rename', exact: true }).click();
    await page.getByRole('textbox', { name: 'Project name' }).fill('Canceled'); await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: data.folders[0].name, exact: true }).waitFor(); assert.notEqual(data.folders[0].name, 'Canceled'); assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
    await trigger.click(); await page.locator('.work-project-head').getByRole('button', { name: 'Rename', exact: true }).click();
    await page.getByRole('textbox', { name: 'Project name' }).fill('BMS studio ' + width); await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'BMS studio ' + width, exact: true }).waitFor(); assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
    await page.reload(); await page.getByRole('heading', { name: 'BMS studio ' + width, exact: true }).waitFor(); await noOverflow();
    if (width === 430) await page.getByRole('button', { name: 'Notes & folders', exact: true }).click();
    const shelf = page.getByRole('complementary', { name: 'Work notes', exact: true });
    await shelf.getByLabel('Actions for project BMS studio ' + width, { exact: true }).click();
    await menuFits(shelf.locator('.work-project-menu .work-menu-body'));
    await page.keyboard.press('Escape');
    await page.goto(url + '?view=project&folder=' + id(11)); await trigger.click();
    await page.locator('.work-project-head').getByRole('button', { name: 'Edit description', exact: true }).click();
    await page.getByLabel('Project description', { exact: true }).fill('A clearer purpose ' + width);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' }); await page.reload();
    assert.equal(data.folders[0].brief, 'A clearer purpose ' + width);
    await page.goto(url + '?note=' + id(12)); await page.getByLabel('Note title', { exact: true }).waitFor();
    await page.getByLabel('Note actions', { exact: true }).click();
    await menuFits(page.locator('.work-note-menu .work-menu-body'));
    await shot('note-menu-' + width); await page.keyboard.press('Escape'); await noOverflow();
    assert.equal(await page.locator('.work-hill').count(), 0);
    const editTask = page.getByRole('button', { name: 'Edit Confirm testing handoff', exact: true });
    await editTask.click(); const inspector = page.getByRole('dialog');
    assert.equal(await inspector.getByLabel('Item', { exact: true }).evaluate(el => el === document.activeElement), true);
    await noOverflow(); await shot('inspector-' + width);
    await inspector.getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal(await page.getByRole('dialog').count(), 0);
    await editTask.click(); await page.keyboard.press('Escape'); assert.equal(await editTask.evaluate(el => el === document.activeElement), true);
    await editTask.click(); await inspector.getByRole('button', { name: 'Save', exact: true }).click(); await inspector.waitFor({ state: 'detached' });
    assert.equal(data.items.filter(x => x._id === id(13)).length, 1);
    await page.goBack(); await page.goForward(); await page.getByLabel('Note title', { exact: true }).waitFor();
    assert.equal(data.items.find(x => x._id === id(13)).workItem.noteId, id(12));
    await page.getByLabel('Note actions', { exact: true }).click(); await page.locator('.work-note-menu').getByRole('button', { name: 'Rename', exact: true }).click();
    await page.getByLabel('Note name', { exact: true }).fill('Testing handoff ' + width);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.reload(); assert.equal(await page.getByLabel('Note title', { exact: true }).inputValue(), 'Testing handoff ' + width);
    assert.equal(data.entries[0].content, '<p>Preserve this original note.</p>');
    console.log('PASS viewport', width, 'menus, inline rename/cancel/reload, Today draft, folded Earlier, no Next duplicates');
  }
  theme = 'tokyo-night';
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto(url + '?view=week');
  const target = page.getByRole('region', { name: 'Apply to accelerators', exact: true });
  const compare = page.getByRole('complementary', { name: 'Open to-dos' }).getByLabel('Actions for Compare deadlines', { exact: true });
  await compare.click(); const select = page.getByLabel('Priority for Compare deadlines', { exact: true });
  await select.focus(); await page.keyboard.press('Home'); assert.equal(await select.evaluate(el => el === document.activeElement), true);
  await select.selectOption('accelerators'); await page.keyboard.press('Escape');
  await target.getByRole('checkbox', { name: 'Compare deadlines', exact: true }).waitFor();
  await page.getByTitle('Drag Ask founders to a priority', { exact: true }).dragTo(target);
  await target.getByRole('checkbox', { name: 'Ask founders', exact: true }).waitFor();
  await page.reload(); await target.getByRole('checkbox', { name: 'Ask founders', exact: true }).waitFor();
  assert.deepEqual(data.items.find(x => x._id === id(20)).workItem.priorities[0].taskIds.slice().sort(), [id(1), id(2), id(3)]);
  assert.equal(data.items.filter(x => x.title === 'Ask founders').length, 1);
  await target.getByRole('button', { name: 'Add to-do to Apply to accelerators' }).click();
  await target.getByLabel('New to-do for Apply to accelerators').fill('Send application');
  await target.getByRole('button', { name: 'Add to-do', exact: true }).click();
  await target.getByRole('checkbox', { name: 'Send application', exact: true }).waitFor();
  assert.equal(data.items.filter(x => x.title === 'Send application').length, 1);
  await page.reload(); await target.getByRole('checkbox', { name: 'Send application', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Previous priority week', exact: true }).click();
  await page.getByRole('heading', { name: 'Clarify shortlist', exact: true }).waitFor();
  assert.equal(await page.getByRole('region', { name: 'Clarify shortlist' }).getByRole('checkbox', { name: 'Compare deadlines', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Next priority week', exact: true }).click(); await target.waitFor();
  assert.equal(await page.getByRole('button', { name: 'Next priority week', exact: true }).isDisabled(), true);
  await page.setViewportSize({ width: 430, height: 1000 });
  assert.equal(await page.locator('html').getAttribute('data-ui-theme'), 'tokyo-night');
  await target.getByRole('button', { name: 'Add to-do to Apply to accelerators' }).click(); await target.getByLabel('New to-do for Apply to accelerators').fill('Mobile task');
  await target.getByRole('button', { name: 'Add to-do', exact: true }).click(); await target.getByRole('checkbox', { name: 'Mobile task', exact: true }).waitFor();
  assert.equal(data.items.filter(x => x.title === 'Mobile task').length, 1);
  await target.getByRole('button', { name: 'Remove Compare deadlines from priority' }).click();
  await page.getByRole('complementary', { name: 'Open to-dos' }).getByLabel('Actions for Compare deadlines', { exact: true }).click();
  await page.getByLabel('Priority for Compare deadlines', { exact: true }).selectOption('product'); await page.keyboard.press('Escape');
  await page.getByRole('region', { name: 'Improve product', exact: true }).getByRole('checkbox', { name: 'Compare deadlines', exact: true }).waitFor();
  await noOverflow(); await shot('weekly-dark-mobile-created');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  console.log('PASS native assignment + real drag canonical links + creation + reload + read-only prior week + mobile remove/reassign');
  await page.goto(url + '?note=' + id(12)); await page.getByLabel('Note actions', { exact: true }).click();
  await page.locator('.work-note-menu').getByRole('button', { name: 'Delete note', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete note?' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.ok(!data.entries[0].trashedAt);
  await page.getByLabel('Note actions', { exact: true }).click(); await page.locator('.work-note-menu').getByRole('button', { name: 'Delete note', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete note?' }).getByRole('button', { name: 'Delete note', exact: true }).click();
  await page.getByText(/moved to Deleted/).waitFor(); assert.ok(data.entries[0].trashedAt); assert.ok(!data.items.find(x => x._id === id(13)).trashedAt);
  await page.goto(url + '?view=trash'); await page.getByRole('heading', { name: 'Deleted', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Restore ' + data.entries[0].title, exact: true }).click(); await page.getByText('Note restored.', { exact: true }).waitFor(); assert.equal(data.entries[0].trashedAt, null);
  await page.goto(url + '?view=project&folder=' + id(11)); await page.locator('.work-project-head summary').click();
  await page.locator('.work-project-head').getByRole('button', { name: 'Delete project', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete BMS studio 430?' });
  await dialog.getByText('This moves the project, 1 notes and 1 tasks to Deleted.', { exact: true }).waitFor();
  assert.match(await dialog.innerText(), /permanently erased on or after 14 days after deletion/);
  assert.match(await dialog.innerText(), /This cannot be undone/);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal(deletes, 0);
  await page.locator('.work-project-head summary').click(); await page.locator('.work-project-head').getByRole('button', { name: 'Delete project', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete project', exact: true }).click();
  await page.getByRole('heading', { name: 'Deleted', exact: true }).waitFor(); assert.equal(deletes, 1); assert.ok(data.entries[0].trashedAt); assert.ok(data.items.find(x => x._id === id(13)).trashedAt);
  assert.equal(await page.locator('.work-trash time').getAttribute('datetime'), '2026-11-30T14:00:00Z');
  await shot('deleted-project');
  await page.getByRole('button', { name: 'Restore BMS studio 430', exact: true }).click();
  await page.getByText(/and its deleted notes and tasks restored/).waitFor(); assert.equal(restores, 1); assert.equal(data.entries[0].trashedAt, null); assert.equal(data.items.find(x => x._id === id(13)).trashedAt, null);
  assert.equal(data.entries[0].content, '<p>Preserve this original note.</p>');
  theme = 'light';
  const handoff = task(31, 'Get the revised numbers', {
    list: 'waiting', waitingOn: 'Sam', dueOn: '2026-11-24', noteId: id(12),
    origin: { noteId: id(12), blockId: 'pilot-words', noteTitle: data.entries[0].title, notebookName: 'Work', day: today, quote: 'Preserve this original note.' }
  });
  data.items.push(handoff);
  data.items.find(item => item._id === id(20)).workItem.priorities[0].taskIds.push(handoff._id);
  await page.clock.setFixedTime(new Date('2026-11-20T18:00:00Z'));
  await page.goto(url + '?view=review');
  const review = page.locator('.work-week-close');
  await review.locator('.work-needs-rest > summary').click();
  await review.getByRole('button', { name: 'I have it' }).click();
  await review.getByRole('textbox', { name: 'Next action' }).fill('Check the revised numbers');
  await review.getByRole('textbox', { name: 'Next action' }).press('Enter');
  await review.getByRole('button', { name: 'Open Monday' }).waitFor();
  await shot('friday-review');
  await review.getByRole('button', { name: 'Open Monday' }).click();
  const mondayRow = page.locator('.work-rail-task').filter({ has: page.getByRole('checkbox', { name: 'Check the revised numbers' }) });
  await mondayRow.getByText('Planned Friday').waitFor();
  assert.equal(await mondayRow.getByRole('checkbox').evaluate(el => el === document.activeElement), true);
  await mondayRow.getByRole('button', { name: 'Apply to accelerators' }).waitFor();
  await mondayRow.getByText('Due Tue 24 Nov').waitFor();
  const source = await mondayRow.getByRole('link', { name: /From Work/ }).getAttribute('href');
  assert.equal(source, `/work?note=${id(12)}&block=pilot-words&entry=${today}`);
  assert.equal(handoff.workItem.history.filter(event => event.type === 'plan').length, 1);
  await page.reload(); await mondayRow.getByText('Planned Friday').waitFor();
  for (const width of [1440, 1320, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(); await shot('monday-' + width);
    if (width === 430) {
      await page.evaluate(() => { document.documentElement.style.fontSize = '125%'; });
      await noOverflow();
      await mondayRow.getByRole('button', { name: 'Apply to accelerators' }).waitFor();
      await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
    }
  }
  console.log('PASS Monday preview reload, exact source, separate deadline, carried priority and focused task');
  assert.deepEqual(errors, []); console.log('PASS note + project confirmation/cancel/delete/restore, preserved content, no page errors'); console.log('Screenshots:', shots);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
