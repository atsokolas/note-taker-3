import { APP, request } from './api.js';
import { mountSaveCardSwitch } from './save-card-switch.js';
import { savedPlacement } from './note-taker-ui/src/pages/placementModel.js';

/* The save card.
 *
 * Opened on a page, it does three things and no more: says which page this
 * is, saves it where the reader puts it, and wakes the margin on the page so
 * passages can be marked there. Everything the extension says after a save
 * (what you already hold, what pushes against it) is said on the page, beside
 * the words, because this card closes the moment the reader looks away. */

const $ = id => document.getElementById(id);
const show = view => { document.body.dataset.view = view; };
const say = (text, { error = false } = {}) => {
  $('receipt').textContent = text;
  $('receipt').classList.toggle('is-error', error);
};
const onDay = value => new Date(value).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* The reader's own palette, carried from noeis.io, over the house defaults. */
const paint = palette => Object.entries(palette || {}).forEach(([name, value]) => (
  document.documentElement.style.setProperty(name, value)
));
const paletteForMargin = () => {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(['canvas', 'paper', 'paper-muted', 'ink', 'ink-muted', 'ink-subtle', 'rule', 'rule-strong',
    'thread', 'action', 'action-soft', 'focus', 'danger', 'font-ui', 'font-reading']
    .map(name => [`--noeis-${name}`, style.getPropertyValue(`--noeis-${name}`).trim()]));
};

const claimsOf = token => {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch (_unreadable) {
    return {};
  }
};

/* Where this site's pieces have been filed before. Three saves from one site
   into one folder is a habit, and the card offers it; two is a guess, and the
   card says nothing. Kept in this browser only. */
const HABIT = 3;
const FILING = 'noeis.filing.byDomain';
const domainOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_notAUrl) { return ''; } };
const filings = () => { try { return JSON.parse(localStorage.getItem(FILING)) || {}; } catch (_unreadable) { return {}; } };
const remember = (url, folderId) => {
  const domain = domainOf(url);
  if (!domain || !folderId) return;
  const all = filings();
  all[domain] = { ...all[domain], [folderId]: (all[domain]?.[folderId] || 0) + 1 };
  try { localStorage.setItem(FILING, JSON.stringify(all)); } catch (_full) { /* a habit not kept is a suggestion not made */ }
};
const habitFor = url => {
  const [best] = Object.entries(filings()[domainOf(url)] || {}).sort((a, b) => b[1] - a[1]);
  return best?.[1] >= HABIT ? { folderId: best[0], times: best[1] } : null;
};

const fillFolders = (folders, selected = '') => {
  const select = $('folder');
  const options = [...folders]
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map(folder => new Option(folder.name, folder._id));
  select.replaceChildren(new Option('No folder', ''), ...options, new Option('New folder…', 'new'));
  select.value = selected;
};

const tell = (tab, message) => chrome.tabs.sendMessage(tab.id, message);

const signIn = (resuming = false) => {
  $('signInCapture').hidden = !resuming;
  $('signIn').onclick = async () => {
    await chrome.storage.local.remove('signedOut');
    chrome.tabs.create({ url: `${APP}/login` });
    window.close();
  };
  show('signin');
};

const open = async () => {
  const { token, palette } = await chrome.storage.local.get(['token', 'palette']);
  paint(palette);
  if (!token) return signIn();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const site = domainOf(tab?.url);
  const { id: account, username } = claimsOf(token);
  const captureKey = account ? `noeis.capture:${account}` : '';
  const stored = captureKey ? (await chrome.storage.local.get(captureKey))[captureKey] : null;
  let capture = stored?.url === tab?.url ? stored : null;
  const hold = async (draft) => {
    capture = draft;
    if (captureKey) await chrome.storage.local.set({ [captureKey]: draft });
  };
  $('who').textContent = username ? `Signed in as ${username}` : '';
  $('signOut').addEventListener('click', async () => {
    await chrome.storage.local.set({ signedOut: true });
    await chrome.storage.local.remove('token');
    signIn();
  });

  /* The margin is woken on this page only, and only because the reader
     pressed the button: Chrome's own pages, the Web Store and the PDF viewer
     refuse it, and the card says so instead of failing later. */
  const woke = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['Readability.js', 'margin.js'] })
    .then(() => true, () => false);
  if (!woke) {
    $('closedSite').textContent = site;
    return show('closed');
  }

  $('site').textContent = site;
  $('pageTitle').textContent = tab.title || tab.url;
  show('page');

  const colors = paletteForMargin();
  let saved;
  try {
    saved = await request(`/api/articles/by-url?brief=1&url=${encodeURIComponent(tab.url)}`);
  } catch (error) {
    say(error.message, { error: true });
    if (!(await chrome.storage.local.get('token')).token) signIn(Boolean(capture));
    return;
  }

  if (saved && !capture) {
    const marks = saved.highlights || [];
    $('saveForm').hidden = true;
    $('pageTitle').textContent = saved.title || $('pageTitle').textContent;
    $('libraryLink').href = `${APP}/library?articleId=${encodeURIComponent(saved._id)}`;
    $('libraryLink').textContent = 'Open in Noeis';
    say(`Already saved · ${onDay(saved.createdAt)}${marks.length ? `, ${count(marks.length, 'highlight')}` : ''}. Select text to mark it.`);
    tell(tab, { type: 'open', article: { id: saved._id, title: saved.title }, marks, palette: colors });
    return;
  }

  const placement = mountSaveCardSwitch($('placement'), { initial: capture?.placement, locked: Boolean(capture) });
  const habit = capture ? null : habitFor(tab.url);
  request('/api/folders').then((folders) => {
    fillFolders(folders || [], capture?.folderId || habit?.folderId || '');
    if (habit && $('folder').value === habit.folderId) {
      $('habit').hidden = false;
      $('habit').textContent = `Filed here the last ${habit.times} times from ${site}.`;
    }
  }, error => say(error.message, { error: true }));

  if (capture) {
    $('folder').disabled = true;
    $('save').textContent = 'Finish save';
    $('pendingQuote').textContent = capture.anchor?.text || '';
    $('pendingQuote').hidden = !capture.anchor;
    $('restartCapture').hidden = false;
    $('restartCapture').onclick = async () => {
      if (captureKey) await chrome.storage.local.remove(captureKey);
      window.location.reload();
    };
    say('Your selection and destination are ready to finish saving.');
  }

  $('folder').addEventListener('change', () => {
    const naming = $('folder').value === 'new';
    $('newFolderRow').hidden = !naming;
    if (naming) $('newFolder').focus();
  });
  $('newFolder').addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const name = $('newFolder').value.trim();
    if (!name) return;
    try {
      const folder = await request('/api/folders', { method: 'POST', body: { name } });
      const kept = [...$('folder').options].filter(option => option.value && option.value !== 'new')
        .map(option => ({ _id: option.value, name: option.text }));
      fillFolders([...kept, folder], folder._id);
      $('newFolderRow').hidden = true;
      $('newFolder').value = '';
    } catch (error) {
      say(error.message, { error: true });
    }
  });

  $('saveForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('save').disabled = true;
    say('Saving…');
    try {
      if (!capture) {
        const anchor = await tell(tab, { type: 'selection' });
        await hold({
          url: tab.url, anchor,
          folderId: $('folder').value === 'new' ? '' : $('folder').value,
          folderName: $('folder').value ? $('folder').selectedOptions[0]?.text : '',
          placement: placement.placement,
          captureId: crypto.randomUUID().replace(/-/g, '').slice(0, 24)
        });
      }
      let article = capture.article || saved;
      if (!article) {
        const page = await tell(tab, { type: 'read' });
        if (!page?.content) throw new Error('This page has no article Noeis can read. Try the article’s own page.');
        article = await request('/save-article', {
          method: 'POST', session: token,
          body: { ...page, url: capture.url, folderId: capture.folderId, placement: capture.placement }
        });
        if (!article?._id) throw new Error('Noeis could not confirm the save. Try again.');
        await hold({ ...capture, article: { _id: article._id, title: article.title, placement: article.placement } });
        remember(capture.url, capture.folderId);
      }
      let mark;
      if (capture.anchor) {
        const result = await request(`/articles/${encodeURIComponent(article._id)}/highlights`, {
          method: 'POST', session: token,
          body: { text: capture.anchor.text, anchor: capture.anchor, captureId: capture.captureId }
        });
        mark = result?.highlight;
        if (!mark?._id) throw new Error('The article is saved. Noeis could not confirm the passage. Try again.');
      }
      const query = new URLSearchParams({ articleId: article._id, ...(mark ? { highlightId: mark._id } : {}) });
      const destination = capture.folderId && capture.folderName ? ` · ${capture.folderName}` : '';
      if (captureKey) await chrome.storage.local.remove(captureKey);
      capture = null;
      await tell(tab, { type: 'open', article: { id: article._id, title: article.title }, marks: [...(saved?.highlights || []), ...(mark ? [mark] : [])], palette: colors, fresh: !saved }).catch(() => {});
      $('saveForm').hidden = true;
      $('libraryLink').href = `${APP}/library?${query}`;
      $('libraryLink').textContent = mark ? 'Open saved passage' : 'Open in Noeis';
      say(`Saved ${savedPlacement(article)}${destination}. ${mark ? 'Passage marked.' : 'Select text to mark it.'}`);
    } catch (error) {
      $('save').disabled = false;
      say(error.message, { error: true });
      if ((await chrome.storage.local.get('token')).token !== token) signIn(Boolean(capture));
    }
  });
};

open();
