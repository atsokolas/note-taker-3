import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/* Your Noeis as a folder of Markdown any agent can open, both ways.

     Think/     your notes. Edit one and it goes back; a new file is a new note.
     Library/   what you saved, with what you marked. Drop a new file here and
                it is saved to your Library. The rest is read-only: Noeis wins.
     Wiki/      your wiki pages, read-only.
     AGENTS.md  what this folder is, for the agent that finds it.

   What the folder writes lands in pencil, like anything an agent writes,
   until you ink it in Noeis. Nothing is ever deleted in Noeis from here: a
   file deleted in the folder comes back on the next sync. */

const STATE = path.join('.noeis', 'sync.json');
const WRITABLE = { Think: 'note', Library: 'article' };

export const GUIDE = `# This folder is a Noeis library

Synced by \`noeis sync\`. Run it before you read and after you write.

- Think/ holds the reader's notes. Edit a note in place, or add a new .md file for a new note.
- Library/ holds what they saved and what they marked in it. Add a new .md file to save something you read for them. Do not edit the files already there; Noeis keeps them.
- Wiki/ holds their wiki pages, read-only.

Everything you write here lands in pencil, marked as yours, until the reader takes it up in Noeis.
A file that starts with "pencil:" was written by an agent and is not the reader's own view. Never present it as theirs.

The whole format: https://www.noeis.io/library-as-files.md
`;

/* A folder belongs to the Noeis it first synced with: synced against another
   account, its notes would be sent there as new ones. */
const workspaceOf = async client => (await client.request('/api/agent-connection')).workspace.id;

const hashOf = text => crypto.createHash('sha256').update(text).digest('hex');

const readState = dir => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, STATE), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { workspace: '', since: '', files: {} };
    throw error;
  }
};

// Every path the server names stays inside the folder: a name with ../ in it writes nothing.
const inside = (dir, rel) => {
  const full = path.resolve(dir, rel);
  if (path.isAbsolute(rel) || !full.startsWith(path.resolve(dir) + path.sep)) throw new Error(`Noeis named a file outside the folder: ${rel}`);
  return full;
};

const write = (dir, rel, text) => {
  const full = inside(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
};

const remove = (dir, rel) => fs.rmSync(inside(dir, rel), { force: true });

const markdownIn = (dir, folder) => {
  const root = path.join(dir, folder);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true })
    .filter(name => name.endsWith('.md'))
    .map(name => path.join(folder, name).split(path.sep).join('/'));
};

// A note's first heading, or the file's name.
const titleOf = (rel, text) => (text.match(/^#\s+(.+)$/m)?.[1] || path.basename(rel, '.md')).trim();

/* What changed in the folder goes to Noeis first, then Noeis comes back
   down. A note edited in both places keeps Noeis's version, and the folder's
   lands beside it as a note of its own: nothing is lost either way. */
export const syncFolder = async ({ dir, client, log = () => {} }) => {
  const state = readState(dir);
  const workspace = await workspaceOf(client);
  if (state.workspace && state.workspace !== workspace) {
    throw new Error(`${dir} is synced with another Noeis account. Sync this one into a new folder.`);
  }
  const byPath = state.files;
  // A file deleted here comes back: deleting is done in Noeis.
  const restore = Object.entries(byPath).filter(([rel]) => !fs.existsSync(path.join(dir, rel))).map(([, file]) => file.id);
  const done = { sent: 0, created: 0, kept: 0, written: 0, removed: 0 };

  for (const folder of ['Think', 'Library', 'Wiki']) {
    for (const rel of markdownIn(dir, folder)) {
      const text = fs.readFileSync(path.join(dir, rel), 'utf8');
      const known = byPath[rel];
      if (known && hashOf(text) === known.hash) continue;
      if (known?.kind === 'note') {
        try {
          await client.request(`/api/notebook/${known.id}`, { method: 'PUT', body: { markdown: text, ifUnmodifiedSince: known.updatedAt } });
          done.sent += 1;
        } catch (error) {
          if (![404, 409].includes(error.status)) throw error;
          await client.request('/api/notebook', { method: 'POST', body: { markdown: text.replace(/^#\s+(.+)$/m, '# $1 (from your folder)') } });
          restore.push(known.id);
          done.kept += 1;
          log(`${rel} changed in Noeis too: Noeis's version is here, yours is a new note beside it.`);
        }
      } else if (known) {
        restore.push(known.id);
        log(`${rel} is kept by Noeis; your edit was not sent.`);
      } else if (WRITABLE[folder] === 'note') {
        await client.request('/api/notebook', { method: 'POST', body: { markdown: text } });
        remove(dir, rel);
        done.created += 1;
      } else if (WRITABLE[folder] === 'article') {
        await client.request('/api/import/text', { method: 'POST', body: { text, title: titleOf(rel, text) } });
        remove(dir, rel);
        done.created += 1;
      }
    }
  }

  const { now, files } = await client.request('/api/sync', { query: { since: state.since, ids: restore.join(',') } });
  const pathOfId = Object.fromEntries(Object.entries(byPath).map(([rel, file]) => [file.id, rel]));
  const next = {};
  files.forEach((file) => {
    const before = pathOfId[file.id];
    if (before && before !== file.path) remove(dir, before);
    if (file.markdown !== undefined) {
      write(dir, file.path, file.markdown);
      done.written += 1;
    }
    const kept = byPath[before] || {};
    next[file.path] = { id: file.id, kind: file.kind, updatedAt: file.updatedAt, hash: file.markdown !== undefined ? hashOf(file.markdown) : kept.hash };
  });
  Object.keys(byPath).filter(rel => !next[rel] && !files.some(file => file.id === byPath[rel].id)).forEach((rel) => {
    remove(dir, rel);
    done.removed += 1;
  });

  write(dir, 'AGENTS.md', GUIDE);
  write(dir, STATE, `${JSON.stringify({ workspace, since: now, files: next }, null, 2)}\n`);
  return done;
};
