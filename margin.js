/* The margin.
 *
 * Woken on a page only when the reader presses the Noeis button there, never
 * by visiting it. From then until the page closes, a selection offers Mark,
 * and a marked passage gets a note in the margin beside it: where it can go
 * (a notebook entry, the Partner, a view of your own), and what you already
 * hold that it bears on. After a fresh save it also says, once, if the piece
 * pushes against a view you hold.
 *
 * Everything here lives in a closed shadow root, so the page's styles cannot
 * reach it and its styles cannot leak into the page. The marks themselves are
 * the one thing drawn into the page, as <noeis-mark>, which no site styles. */
(() => {
  if (window.__noeisMargin) return;
  window.__noeisMargin = true;

  const APP = 'https://www.noeis.io';
  const LISTEN_MS = 45000;
  const LISTEN_EVERY_MS = 3000;
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT)$/;

  const api = (path, { method = 'GET', body } = {}) => chrome.runtime.sendMessage({ type: 'api', path, method, body })
    .then((reply) => {
      if (!reply?.ok) throw new Error(reply?.error || 'Noeis could not be reached. Try again in a moment.');
      return reply.data;
    });

  const h = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([name, value]) => {
      if (name === 'on') Object.entries(value).forEach(([event, run]) => node.addEventListener(event, run));
      else if (value === true) node.setAttribute(name, '');
      else if (value || value === 0) node.setAttribute(name, value);
    });
    node.append(...children.flat().filter(child => child || child === 0));
    return node;
  };
  const link = (href, text) => h('a', { href, target: '_blank', rel: 'noreferrer' }, text);
  const onDay = value => (value ? new Date(value).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : '');
  const sentence = text => String(text || '').trim().replace(/[.\s]+$/, '');

  let article = null;
  let markColor = 'rgba(177, 134, 46, 0.26)';
  let entries = null;
  const passages = new WeakMap();

  /* The host and its card */

  const host = h('noeis-margin', { style: 'all: initial; position: absolute; top: 0; left: 0; z-index: 2147483647;' });
  const shadow = host.attachShadow({ mode: 'closed' });
  const pill = h('button', { class: 'pill', type: 'button', hidden: true }, 'Mark');
  const card = h('aside', { class: 'card', hidden: true, 'aria-live': 'polite' });
  shadow.append(h('style', {}, STYLE()), pill, card);
  document.documentElement.append(host);

  const place = (node, x, y) => {
    node.style.left = `${Math.max(8, x)}px`;
    node.style.top = `${Math.max(8, y)}px`;
  };

  const close = () => { card.hidden = true; };
  const kicker = text => h('header', {},
    h('span', { class: 'kicker' }, text),
    h('button', { type: 'button', class: 'close', 'aria-label': 'Close', on: { click: close } }, '×'));

  /* In the page's own margin, beside the passage, when the page leaves room
     for it; under the passage when it does not; with nothing on screen to
     stand beside, the top right of the window. */
  const showCard = (marks, children) => {
    const [mark] = marks || [];
    card.replaceChildren(...children);
    card.hidden = false;
    card.classList.toggle('is-fixed', !mark);
    card.classList.remove('is-arriving');
    void card.offsetWidth;
    card.classList.add('is-arriving');
    if (!mark) return;
    const rect = mark.getBoundingClientRect();
    const end = marks[marks.length - 1].getBoundingClientRect();
    const column = (mark.closest('p, li, blockquote, figure, pre, h1, h2, h3, h4') || mark).getBoundingClientRect();
    const page = document.documentElement.clientWidth;
    const width = Math.min(300, page - 32);
    if (page - column.right >= width + 36) place(card, scrollX + column.right + 20, scrollY + rect.top - 12);
    else place(card, scrollX + Math.min(column.left, page - width - 16), scrollY + end.bottom + 12);
  };

  /* Marks, drawn into the page */

  const textNodes = (within, accept = () => true) => {
    const walker = document.createTreeWalker(within, NodeFilter.SHOW_TEXT, {
      acceptNode: node => (!SKIP.test(node.parentNode?.nodeName) && accept(node)
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    return nodes;
  };

  /* A passage that runs through a link, an italic or a paragraph break is
     wrapped piece by piece, one mark per text node it touches. */
  const wrap = (range) => {
    const { startContainer, startOffset, endContainer, endOffset, commonAncestorContainer: root } = range;
    const nodes = root.nodeType === Node.TEXT_NODE ? [root] : textNodes(root, node => range.intersectsNode(node));
    return nodes.flatMap((node) => {
      const from = node === startContainer ? startOffset : 0;
      const to = node === endContainer ? endOffset : node.length;
      if (from >= to || !node.data.slice(from, to).trim()) return [];
      if (to < node.length) node.splitText(to);
      const piece = from > 0 ? node.splitText(from) : node;
      const mark = h('noeis-mark', {
        style: `background: ${markColor}; color: inherit; border-radius: 2px; cursor: pointer; -webkit-box-decoration-break: clone; box-decoration-break: clone;`
      });
      piece.replaceWith(mark);
      mark.append(piece);
      return [mark];
    });
  };

  const unwrap = marks => marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    mark.replaceWith(...mark.childNodes);
    parent.normalize();
  });

  /* Where saved words are on the page now, ignoring the whitespace that a
     selection and a page lay out differently. Words already marked are passed
     over, so a passage saved twice lands on its second appearance, not inside
     its first. */
  const rangeOf = (text) => {
    const want = String(text || '').replace(/\s+/g, '');
    if (!want) return null;
    let flat = '';
    const at = [];
    textNodes(document.body, node => !node.parentElement?.closest('noeis-mark')).forEach((node) => {
      for (let index = 0; index < node.data.length; index += 1) {
        if (/\s/.test(node.data[index])) continue;
        flat += node.data[index];
        at.push([node, index]);
      }
    });
    const found = flat.indexOf(want);
    if (found < 0) return null;
    const range = document.createRange();
    range.setStart(...at[found]);
    const [endNode, endIndex] = at[found + want.length - 1];
    range.setEnd(endNode, endIndex + 1);
    return range;
  };

  const keep = (passage) => {
    passage.marks.forEach(mark => passages.set(mark, passage));
    return passage;
  };

  /* Marking */

  const editable = node => node?.parentElement?.closest?.('input, textarea, [contenteditable=""], [contenteditable="true"]');

  const offer = () => {
    const selection = getSelection();
    const text = selection.toString().trim();
    if (!article || selection.isCollapsed || text.length < 3 || editable(selection.anchorNode)) {
      pill.hidden = true;
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    place(pill, scrollX + rect.left + rect.width / 2 - 28, scrollY + rect.top - 40);
    pill.hidden = false;
  };

  const mark = async () => {
    const selection = getSelection();
    if (selection.isCollapsed) return;
    const text = selection.toString().trim();
    const range = selection.getRangeAt(0).cloneRange();
    selection.removeAllRanges();
    pill.hidden = true;
    const passage = { text, marks: wrap(range) };
    showCard(passage.marks, [kicker('Marking'), h('p', { class: 'hush' }, 'Keeping this passage…')]);
    try {
      const saved = await api(`/articles/${encodeURIComponent(article.id)}/highlights`, { method: 'POST', body: { text } });
      passage.id = saved?.highlight?._id || saved?.highlight?.id;
      openPassage(keep(passage));
    } catch (error) {
      unwrap(passage.marks);
      showCard(passage.marks, [kicker('Not marked'), h('p', { class: 'error' }, error.message)]);
    }
  };

  /* What a marked passage can become, and what it bears on */

  const recentEntries = () => {
    entries ||= api('/api/notebook?summary=1&compact=1&limit=6')
      .then(rows => (rows || []).filter(entry => !entry.board?.archivedAt).slice(0, 2))
      .catch(() => []);
    return entries;
  };

  const settle = (row, ...receipt) => row.replaceWith(h('p', { class: 'receipt' }, ...receipt));

  const choices = (row, options) => h('span', { class: 'choices' }, options.map(([label, run, quiet]) => h('button', {
    type: 'button',
    class: quiet ? 'quiet' : '',
    on: {
      click: async () => {
        row.querySelectorAll('button').forEach((button) => { button.disabled = true; });
        try {
          await run();
        } catch (error) {
          row.querySelectorAll('button').forEach((button) => { button.disabled = false; });
          row.append(h('p', { class: 'error' }, error.message));
        }
      }
    }
  }, label)));

  const notebookRow = async (passage) => {
    const row = h('div', { class: 'row' });
    (await recentEntries()).forEach((entry) => {
      const title = entry.title || 'Untitled note';
      row.append(h('button', {
        type: 'button',
        on: {
          click: async ({ currentTarget: button }) => {
            button.disabled = true;
            try {
              await api(`/api/notebook/${encodeURIComponent(entry._id)}/append-highlight`, { method: 'POST', body: { highlightId: passage.id } });
              button.replaceWith(h('span', { class: 'done' }, 'Added to ', link(`${APP}/think?tab=notebook&entryId=${encodeURIComponent(entry._id)}`, title)));
            } catch (error) {
              button.disabled = false;
              row.append(h('p', { class: 'error' }, error.message));
            }
          }
        }
      }, `Add to “${title}”`));
    });
    return row;
  };

  const holdRow = (passage) => {
    const row = h('div', { class: 'row' });
    const words = h('textarea', { rows: 3, 'aria-label': 'The view, in your words' });
    words.value = passage.text.slice(0, 400);
    const begin = h('button', {
      type: 'button',
      class: 'quiet',
      on: {
        click: () => {
          begin.replaceWith(h('label', { class: 'hold' }, h('span', {}, 'In your words, what do you now think?'), words),
            choices(row, [['Hold this view', async () => {
              const claim = words.value.trim();
              if (!claim) throw new Error('A view needs a sentence of your own.');
              const held = await api('/api/judgment/from-highlight', { method: 'POST', body: { claim, highlightId: passage.id } });
              settle(row, 'You hold this now. ', link(`${APP}${held.href}`, 'See the view'), '.');
            }]]));
          words.focus();
        }
      }
    }, 'I think this is right');
    row.append(begin);
    return row;
  };

  const viewRows = (passage, view) => {
    const href = `${APP}/judgment/${encodeURIComponent(view.pageId)}`;
    const file = field => async () => {
      await api(`/api/judgment/pages/${encodeURIComponent(view.pageId)}/evidence`, {
        method: 'POST',
        body: { requestId: crypto.randomUUID(), expectedClaim: view.view, field, articleId: article.id, highlightId: passage.id }
      });
      settle(bears, `Filed ${field === 'why' ? 'for' : 'against'} `, link(href, 'your view'), '.');
    };
    const bears = h('div', { class: 'row' }, h('p', {}, 'This bears on your view that ', link(href, sentence(view.view)), '.'));
    const notAbout = async () => {
      await api(`/api/judgment/pages/${encodeURIComponent(view.pageId)}/not-about`, {
        method: 'POST',
        body: { articleId: article.id, highlightId: passage.id }
      });
      bears.remove();
    };
    bears.append(choices(bears, [['File for', file('why')], ['File against', file('against')], ['Not about this', notAbout, true]]));
    if (!view.dueBy) return [bears];

    const due = h('div', { class: 'row' }, h('p', {}, `You said you’d know by ${onDay(view.dueBy)}. Did it hold up?`));
    const verdict = (result, said) => async () => {
      await api(`/api/judgment/pages/${encodeURIComponent(view.pageId)}/verdicts`, {
        method: 'POST',
        body: { requestId: crypto.randomUUID(), expectedClaim: view.view, result }
      });
      settle(due, `Recorded: ${said}. `, link(href, 'See the view'), '.');
    };
    due.append(choices(due, [['Held up', verdict('held_up', 'it held up')], ['Broke', verdict('broke', 'it broke')], ['Partly', verdict('partly', 'partly')]]));
    return [bears, due];
  };

  const beforeRow = before => h('div', { class: 'row' },
    h('p', {}, 'You marked something like this in ',
      link(`${APP}/library?articleId=${encodeURIComponent(before.articleId)}&highlightId=${encodeURIComponent(before.highlightId)}`, before.title || 'a source you saved'),
      before.savedAt ? `, ${onDay(before.savedAt)}` : '', ':'),
    h('blockquote', {}, before.text));

  const openPassage = async (passage) => {
    const reading = h('p', { class: 'hush' }, 'Reading it against what you hold…');
    const ask = `${APP}/library?articleId=${encodeURIComponent(article.id)}&highlightId=${encodeURIComponent(passage.id)}&ask=1`;
    showCard(passage.marks, [
      kicker('Marked'),
      await notebookRow(passage),
      h('div', { class: 'row' }, link(ask, 'Ask the Partner about this')),
      holdRow(passage),
      reading
    ]);
    const margin = await api('/api/judgment/margin', { method: 'POST', body: { text: passage.text, articleId: article.id, highlightId: passage.id } })
      .catch(() => ({}));
    reading.replaceWith(...[
      ...(margin.view ? viewRows(passage, margin.view) : []),
      ...(margin.before ? [beforeRow(margin.before)] : [])
    ]);
  };

  /* After a save: the one view this piece argues with, if reading it finds one */

  const listen = async () => {
    for (let waited = 0; waited < LISTEN_MS; waited += LISTEN_EVERY_MS) {
      await new Promise(resolve => setTimeout(resolve, LISTEN_EVERY_MS));
      const found = await api(`/api/judgment/pushes-against?articleId=${encodeURIComponent(article.id)}`).catch(() => null);
      if (found?.reading) return pushback(found.reading);
    }
    return null;
  };

  const pushback = ({ pageId, view, proposal }) => {
    const href = `${APP}/judgment/${encodeURIComponent(pageId)}`;
    const quote = proposal?.provenance?.after || '';
    const row = h('div', { class: 'row' },
      h('p', {}, 'This piece argues against your view that ', link(href, sentence(view)), ':'),
      quote ? h('blockquote', {}, quote) : null);
    const there = quote && rangeOf(quote);
    row.append(choices(row, [
      ['File against', async () => {
        await api(`/api/judgment/pages/${encodeURIComponent(pageId)}/evidence`, { method: 'POST', body: { proposalId: proposal.id, field: 'against' } });
        settle(row, 'Filed against ', link(href, 'your view'), '.');
      }],
      ...(there ? [['Show me where', async () => {
        there.startContainer.parentElement?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      }, true]] : []),
      ['Not now', async () => close(), true]
    ]));
    showCard(null, [kicker('Pushes against what you hold'), row]);
  };

  /* Talking to the save card */

  const readPage = () => {
    const parsed = new Readability(document.cloneNode(true)).parse();
    if (!parsed?.content) return null;
    const meta = selector => document.querySelector(selector)?.getAttribute('content') || '';
    return {
      title: parsed.title || document.title,
      content: parsed.content,
      author: String(parsed.byline || '').replace(/^by\s+/i, '').trim(),
      siteName: parsed.siteName || '',
      publicationDate: meta('meta[property="article:published_time"]') || meta('meta[name="date"]')
        || document.querySelector('time[datetime]')?.getAttribute('datetime') || ''
    };
  };

  const start = ({ article: next, marks = [], palette = {}, fresh = false }) => {
    Object.entries(palette).forEach(([name, value]) => value && host.style.setProperty(name, value));
    if (palette['--noeis-thread']) markColor = `color-mix(in srgb, ${palette['--noeis-thread']} 28%, transparent)`;
    if (article?.id === next.id) return true;
    article = next;
    marks.forEach((saved) => {
      const range = rangeOf(saved.text);
      if (range) keep({ id: saved._id, text: saved.text, marks: wrap(range) });
    });
    if (fresh) listen();
    return true;
  };

  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.type === 'read') reply(readPage());
    if (message?.type === 'open') reply(start(message));
    return false;
  });

  document.addEventListener('mouseup', (event) => {
    if (event.composedPath().includes(host)) return;
    const passage = event.target.closest?.('noeis-mark') && passages.get(event.target.closest('noeis-mark'));
    if (passage && getSelection().isCollapsed) openPassage(passage);
    else setTimeout(offer, 0);
  });
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Escape') { close(); pill.hidden = true; } else if (event.shiftKey) offer();
  });
  document.addEventListener('mousedown', (event) => {
    if (!event.composedPath().includes(host)) pill.hidden = true;
  });
  pill.addEventListener('mousedown', event => event.preventDefault());
  pill.addEventListener('click', mark);

  function STYLE() {
    return `
      :host { color-scheme: light dark; }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }

      .pill, .card {
        position: absolute;
        font: 14px/1.5 var(--noeis-font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
        color: var(--noeis-ink, #332f29);
      }

      .pill {
        padding: 5px 14px;
        border: 0;
        border-radius: 999px;
        background: var(--noeis-ink, #332f29);
        color: var(--noeis-paper, #fffdf8);
        font-weight: 600;
        font-size: 13px;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
        cursor: pointer;
      }

      .card {
        width: min(300px, calc(100vw - 32px));
        max-height: calc(100vh - 32px);
        overflow: auto;
        padding: 12px 16px 14px;
        border: 1px solid var(--noeis-rule-strong, rgba(91, 80, 63, 0.28));
        border-radius: 10px;
        background: var(--noeis-paper, #fffdf8);
        box-shadow: 0 20px 48px rgba(55, 43, 26, 0.16);
      }
      .card.is-fixed { position: fixed; top: 16px; right: 16px; left: auto !important; }
      .card.is-arriving { animation: arrive 180ms cubic-bezier(0.2, 0.8, 0.2, 1); }
      @keyframes arrive { from { opacity: 0; transform: translateY(4px); } }

      header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
      .kicker {
        color: var(--noeis-ink-subtle, #7a756c);
        font-size: 11px;
        font-variant-caps: all-small-caps;
        letter-spacing: 0.12em;
      }
      .close { border: 0; background: none; color: var(--noeis-ink-subtle, #7a756c); font-size: 18px; line-height: 1; cursor: pointer; }

      p { margin: 0 0 6px; }
      .row { padding: 8px 0; border-top: 1px solid var(--noeis-rule, rgba(91, 80, 63, 0.16)); }
      header + .row { border-top: 0; padding-top: 0; }
      .row:empty { display: none; }
      .row > button, .choices button {
        margin: 2px 10px 2px 0;
        padding: 0;
        border: 0;
        background: none;
        color: var(--noeis-ink, #332f29);
        font: inherit;
        text-decoration: underline;
        text-decoration-color: var(--noeis-rule-strong, rgba(91, 80, 63, 0.28));
        text-underline-offset: 3px;
        cursor: pointer;
      }
      .row > button:hover, .choices button:hover { text-decoration-color: currentColor; }
      .quiet, .choices button.quiet { color: var(--noeis-ink-muted, #5f625f); }
      button:disabled { opacity: 0.5; cursor: default; }
      .row > button { display: block; text-align: left; }

      a { color: var(--noeis-action, #8b5f1d); text-underline-offset: 3px; }
      blockquote {
        margin: 6px 0;
        padding-left: 10px;
        border-left: 2px solid var(--noeis-thread, #b1862e);
        font-family: var(--noeis-font-reading, "Newsreader", "Iowan Old Style", Georgia, serif);
        font-size: 15px;
        line-height: 1.45;
      }
      .hush, .done, .receipt { color: var(--noeis-ink-muted, #5f625f); }
      .error { color: var(--noeis-danger, #9b5a46); }

      .hold { display: block; margin-bottom: 6px; }
      .hold span { display: block; margin-bottom: 4px; color: var(--noeis-ink-muted, #5f625f); font-size: 13px; }
      textarea {
        width: 100%;
        padding: 6px 8px;
        border: 1px solid var(--noeis-rule-strong, rgba(91, 80, 63, 0.28));
        border-radius: 6px;
        background: var(--noeis-paper, #fffdf8);
        color: inherit;
        font: 15px/1.45 var(--noeis-font-reading, "Iowan Old Style", Georgia, serif);
        resize: vertical;
      }

      :focus-visible { outline: 2px solid var(--noeis-focus, rgba(139, 95, 29, 0.38)); outline-offset: 2px; }

      @media (prefers-reduced-motion: reduce) { .card.is-arriving { animation: none; } }
    `;
  }
})();
