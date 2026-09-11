import { buildAuthoredContinuationPath } from './sourceRoutes';

export const FIELD_KIT_FIELDS = { title: 240, writing: 20000, question: 2000, returnNote: 2000 };
export const fieldKitChanges = (value) => Object.fromEntries(Object.entries(FIELD_KIT_FIELDS).map(([key, limit]) => {
  const text = value?.[key] ?? '';
  if (typeof text !== 'string' || text.length > limit) throw new Error('This file contains unsupported or oversized writing.');
  return [key, text];
}));

export function readFieldKit(text, { owner, record }) {
  if (text.length > 150000) throw new Error('This file is too large.');
  const kit = JSON.parse(text);
  if (kit.format !== 'noeis-field-kit-1' || kit.owner !== owner || kit.id !== record.saved?.id
    || !Number.isInteger(kit.revision) || kit.revision < 1 || kit.revision > record.revision) {
    throw new Error('Open the original work in the same account to bring these changes back.');
  }
  return { revision: kit.revision, fields: fieldKitChanges(kit.fields) };
}

export function downloadAuthoredFile(contents, name, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A deliberately portable file needs no service worker, API cache, token or
// second application shell. Only the four ordinary writing fields are editable.
function runFieldKit() {
  const kit = JSON.parse(document.getElementById('work').textContent);
  const form = document.querySelector('form');
  const status = document.querySelector('[role=status]');
  let dirty = false;
  for (const [key, value] of Object.entries(kit.fields)) form.elements[key].value = value;
  document.querySelector('h1').textContent = kit.fields.title || 'A thought to take with you';
  document.querySelector('time').textContent = new Date(kit.takenAt).toLocaleString();
  document.querySelector('a').href = kit.href;
  for (const source of kit.sources) {
    const block = document.createElement('blockquote');
    const title = document.createElement('cite');
    const text = document.createElement('p');
    title.textContent = source.title;
    text.textContent = source.passage;
    block.append(title, text);
    document.querySelector('#sources').append(block);
  }
  form.addEventListener('input', () => {
    dirty = true;
    status.textContent = 'Changes in this window. Save them before closing.';
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    for (const key of Object.keys(kit.fields)) kit.fields[key] = form.elements[key].value;
    const url = URL.createObjectURL(new Blob([JSON.stringify(kit)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'noeis-field-kit-changes.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    dirty = false;
    status.textContent = 'Download requested. Keep that changes file, then bring it back from Exploration options in Noeis.';
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
}

export function fieldKitDocument({ owner, record }) {
  const saved = record.saved;
  const source = saved.draft.selectedSource;
  const kit = {
    format: 'noeis-field-kit-1', owner, id: saved.id, revision: record.revision,
    takenAt: new Date().toISOString(),
    href: new URL(buildAuthoredContinuationPath(saved), window.location.origin).href,
    fields: fieldKitChanges(record.draft),
    sources: [
      { title: saved.origin?.pageTitle || 'Original passage', passage: saved.origin?.claimText || record.draft.originalText || '' },
      ...(source?.available !== false && source?.passage ? [{ title: source.title || source.articleTitle || 'Chosen source', passage: source.passage }] : [])
    ].filter(item => item.passage)
  };
  const json = JSON.stringify(kit).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Noeis · Field kit</title>
<style>body{max-width:44rem;margin:0 auto;padding:2rem 1.2rem;background:#f7f5ee;color:#292721;font:18px/1.6 Georgia,serif}label{display:block;margin:1.4rem 0 .3rem}input,textarea,button{box-sizing:border-box;font:inherit;color:inherit}input,textarea{width:100%;padding:.65rem;border:1px solid #c8c4b8;background:#fffefa;border-radius:6px}button{min-height:44px;padding:.5rem 1rem;margin:1rem 0;border:1px solid #b8b3a7;border-radius:6px;background:#fffefa;cursor:pointer}:focus-visible{outline:3px solid #806226;outline-offset:3px}blockquote{margin:1.5rem 0;padding-left:1rem;border-left:2px solid #b8a57c;white-space:pre-wrap}small,[role=status]{font:15px/1.5 system-ui}a{color:inherit}h1{line-height:1.2;overflow-wrap:anywhere}</style>
<header><small>Noeis · A private field kit</small><h1></h1><p>Saved copy taken <time></time>.</p><p>This file holds your writing and the excerpts below. You can work without a connection. Save your changes to a file before closing; bring that file back to the original work when you reconnect.</p><p><small>Downloaded files remain on this device after sign-out. Delete them when you no longer need them.</small></p></header>
<details><summary>The passages you brought</summary><div id="sources"></div></details>
<form><label for="title">Title</label><input id="title" name="title" maxlength="240"><label for="writing">Your writing</label><textarea id="writing" name="writing" rows="12" maxlength="20000"></textarea><label for="question">Leave this open</label><textarea id="question" name="question" rows="3" maxlength="2000"></textarea><label for="returnNote">A note for your return</label><textarea id="returnNote" name="returnNote" rows="2" maxlength="2000"></textarea><button>Save changes to bring back</button><p role="status">The original saved words are in this file.</p></form><p><a target="_blank" rel="noopener">Return to this work in Noeis</a></p>
<script type="application/json" id="work">${json}</script><script>(${runFieldKit.toString()})()</script></html>`;
}
