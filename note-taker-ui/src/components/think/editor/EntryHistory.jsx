import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../api';
import { getAuthHeaders } from '../../../hooks/useAuthHeaders';
import { QuietButton } from '../../ui';

// What changed: an entry's history read as sentences, not a diff.
// "Oct 12 · Added two paragraphs and a passage from Costco's Moat."
// Any earlier version can be brought back; bringing one back is itself a
// version, so it can be undone the same way.

const NUMBERS = ['no', 'a', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const count = (n, noun) => `${NUMBERS[n] || n} ${noun}${n === 1 ? '' : 's'}`;
const andList = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const PASSAGE_TYPES = new Set(['highlight-ref', 'highlight_embed']);
const blockUnit = (block) => {
  if (PASSAGE_TYPES.has(block.type) || (block.type === 'quote' && block.highlightId)) {
    return { kind: 'passage', key: `h:${block.highlightId || clean(block.text)}`, source: clean(block.articleTitle) };
  }
  const text = clean(block.text);
  if (!text || /_ref$|-ref$/.test(block.type || '')) return null;
  return { kind: block.type === 'heading' ? 'heading' : 'paragraph', id: block.id, text };
};

const htmlUnits = (html) => [...new DOMParser().parseFromString(html, 'text/html').body.querySelectorAll('p, h1, h2, h3, li, blockquote')]
  .filter(element => !element.parentElement.closest('blockquote, li'))
  .map(element => (element.matches('blockquote') && element.dataset.highlightId
    ? { kind: 'passage', key: `h:${element.dataset.highlightId}`, source: clean(element.dataset.articleTitle) }
    : blockUnit({ type: /^H\d$/.test(element.tagName) ? 'heading' : 'paragraph', id: element.dataset.blockId, text: element.textContent })));

const unitsOf = (snapshot = {}) => (
  snapshot.html !== undefined ? htmlUnits(snapshot.html) : (snapshot.blocks || []).map(blockUnit)
).filter(Boolean);

const passages = (list) => {
  const sources = [...new Set(list.map(unit => unit.source).filter(Boolean))];
  return `${count(list.length, 'passage')}${sources.length ? ` from ${andList(sources)}` : ''}`;
};

const tally = ({ paragraph = 0, heading = 0, passage = [] }) => [
  paragraph ? count(paragraph, 'paragraph') : '',
  heading ? count(heading, 'heading') : '',
  passage.length ? passages(passage) : ''
].filter(Boolean);

const tallyOf = (units) => tally({
  paragraph: units.filter(unit => unit.kind === 'paragraph').length,
  heading: units.filter(unit => unit.kind === 'heading').length,
  passage: units.filter(unit => unit.kind === 'passage')
});

/* The difference between two versions, in the sentences a person would use. */
export const describeChange = (before = {}, after = {}) => {
  const lines = [];
  const was = clean(before.title);
  const now = clean(after.title);
  if (was !== now) lines.push(!now ? 'Took the title off.' : was ? `Retitled it “${now}”.` : `Titled it “${now}”.`);

  const old = unitsOf(before);
  const next = unitsOf(after);
  const oldPassages = new Set(old.filter(unit => unit.kind === 'passage').map(unit => unit.key));
  const newPassages = new Set(next.filter(unit => unit.kind === 'passage').map(unit => unit.key));
  const keyOf = unit => unit.id || `t:${unit.text}`;
  const oldWriting = new Map(old.filter(unit => unit.kind !== 'passage').map(unit => [keyOf(unit), unit]));
  const newWriting = new Map(next.filter(unit => unit.kind !== 'passage').map(unit => [keyOf(unit), unit]));

  const added = { paragraph: 0, heading: 0, passage: next.filter(unit => unit.kind === 'passage' && !oldPassages.has(unit.key)) };
  const removed = { paragraph: 0, heading: 0, passage: old.filter(unit => unit.kind === 'passage' && !newPassages.has(unit.key)) };
  let revised = 0;
  newWriting.forEach((unit, key) => {
    const prior = oldWriting.get(key);
    if (!prior) added[unit.kind] += 1;
    else if (prior.text !== unit.text) revised += 1;
  });
  oldWriting.forEach((unit, key) => { if (!newWriting.has(key)) removed[unit.kind] += 1; });
  /* A paragraph rewritten without a lasting identity reads as one gone and
     one new; it is the same paragraph, revised. */
  const rewritten = Math.min(added.paragraph, removed.paragraph);
  added.paragraph -= rewritten;
  removed.paragraph -= rewritten;
  revised += rewritten;

  const addedParts = tally(added);
  const removedParts = tally(removed);
  if (addedParts.length) lines.push(`Added ${andList(addedParts)}.`);
  if (revised) lines.push(`Revised ${count(revised, 'paragraph')}.`);
  if (removedParts.length) lines.push(`Removed ${andList(removedParts)}.`);
  return lines.length ? lines : ['Small edits.'];
};

const day = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const time = (value) => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/* Revisions arrive newest first; each is read against the one before it.
   A day with more than one revision gives each its time as well. */
export const historyLines = (revisions = []) => {
  const days = revisions.map(revision => day(revision.at));
  const when = (value) => (days.filter(label => label === day(value)).length > 1 ? `${day(value)}, ${time(value)}` : day(value));
  return revisions.map((revision, index) => {
    const older = revisions[index + 1];
    const held = andList(tallyOf(unitsOf(revision.snapshot)));
    const text = revision.reason === 'before'
      ? `As it stood when history began${held ? `: ${held}` : ''}.`
      : revision.reason === 'restore'
        ? `Restored the version from ${when(revision.restoredFromAt || revision.at)}.`
        : older ? describeChange(older.snapshot, revision.snapshot).join(' ')
          : `Began${held ? ` with ${held}` : ''}.`;
    return { revision, text, when: when(revision.at) };
  });
};

const EntryHistory = ({ kind, entryId, onRestore, onClose }) => {
  const [revisions, setRevisions] = useState(null);
  const [error, setError] = useState('');
  const [undo, setUndo] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get(`/api/think/history/${kind}/${entryId}`, getAuthHeaders())
    .then(res => { setRevisions(res.data?.revisions || []); setError(''); })
    .catch(() => setError('Could not read this history.')), [kind, entryId]);
  useEffect(() => { setRevisions(null); setUndo(null); load(); }, [load]);

  const bringBack = async (revision, current) => {
    setBusy(true);
    const restored = await onRestore(revision);
    setBusy(false);
    if (!restored) return setError('That version did not come back. Try again in a moment.');
    setUndo(current ? { revision: current, at: revision.at } : null);
    return load();
  };

  const lines = historyLines(revisions || []);
  return (
    <section className="think-entry-history" aria-label="History">
      <header>
        <h2>History</h2>
        <QuietButton onClick={onClose}>Close</QuietButton>
      </header>
      {undo ? (
        <p className="think-entry-history__undo" role="status">
          Restored the version from {day(undo.at)}.{' '}
          <QuietButton disabled={busy} onClick={() => bringBack(undo.revision, null)}>Undo</QuietButton>
        </p>
      ) : null}
      {error ? <p className="think-entry-history__quiet" role="alert">{error}</p> : null}
      {revisions === null ? (
        error ? null : <p className="think-entry-history__quiet" role="status">Reading the history…</p>
      ) : !lines.length ? (
        <p className="think-entry-history__quiet">No history yet. It begins with what you write next.</p>
      ) : (
        <ol>
          {lines.map(({ revision, text, when }, index) => (
            <li key={revision.id}>
              <time dateTime={revision.at}>{when}</time>
              <span>{text}</span>
              {index ? <QuietButton disabled={busy} onClick={() => bringBack(revision, revisions[0])}>Restore</QuietButton> : <em>Now</em>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

export default EntryHistory;
