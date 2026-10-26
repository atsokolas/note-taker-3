import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { clearStoredTokens } from '../api';
import WorkNoteEditor from './WorkNoteEditor';
import Login from '../components/Login';
import { workSessionFor, resumeWorkSession, releaseWorkSession, forgetWorkSession } from './workSessions';
import { noteTitle, noteDate, noteWords, operationId } from './workSession';
import './work-notes.css';

export function WorkDialog({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement, dialog = ref.current;
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    (dialog.querySelector('[contenteditable="true"]') || dialog.querySelector('button, input, textarea'))?.focus();
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.querySelectorAll('button:not(:disabled), input, textarea, a[href], select, [tabindex="0"]')];
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); dialog.close?.(); previous?.focus?.(); };
  }, [onClose, title]);
  return <dialog ref={ref} className="work-dialog" aria-label={title} aria-modal="true" onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2>{title}</h2>{children}
  </dialog>;
}
const defaultLogout = () => { clearStoredTokens(); window.location.assign('/login'); };

export default function WorkNotes({ onLogout = defaultLogout }) {
  const navigate = useNavigate(), [params, setParams] = useSearchParams();
  const [session] = useState(() => workSessionFor(localStorage.getItem('token') || ''));
  const version = useSyncExternalStore(session.subscribe, session.snapshot);
  const [selected, setSelected] = useState(params.get('note') || '');
  const [fresh, setFresh] = useState('');
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('all');
  const [mobileShelf, setMobileShelf] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [source, setSource] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false), intent = useRef(''), timer = useRef(null);
  const [notice, setNotice] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [locked, setLocked] = useState(false);
  const [reauthenticate, setReauthenticate] = useState(false);
  const [quick, setQuick] = useState(false);
  const departure = useRef(null), initialized = useRef(false);
  const notes = session.entries(), note = session.entry(selected), conflict = session.conflict(selected);
  const folders = session.folders();
  const update = patch => {
    if (!session.isCurrent()) { setLocked(true); return; }
    session.edit(selected, patch);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => session.flush(selected), 850);
  };
  const open = id => {
    if (!session.canLeave()) { departure.current = () => open(id); setSheet('recovery'); return; }
    session.flush(selected); setSelected(id); setMobileShelf(false); setFresh(''); setNotice('');
    const entry = session.entry(id); setParams({ context: 'work', ...(entry?._id ? { note: entry._id } : {}) }, { replace: true });
  };
  const capture = () => {
    if (!session.canLeave()) { departure.current = capture; setSheet('recovery'); return; }
    session.flush(selected); const id = session.capture(); setSelected(id); setFresh(id); setMobileShelf(false);
    setParams({ context: 'work' }, { replace: true });
  };
  useEffect(() => {
    resumeWorkSession(session, localStorage.getItem('token') || ''); session.load();
    const online = () => { if (!session.isCurrent()) { setLocked(true); return; } session.pending().forEach(([id]) => session.flush(id)); };
    const account = () => {
      session.refreshDrafts();
      const returned = resumeWorkSession(session, localStorage.getItem('token') || '');
      setLocked(!returned); if (returned) setReauthenticate(false);
    };
    const unload = event => { if (!session.canLeave()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('online', online); window.addEventListener('storage', account); window.addEventListener('focus', account); window.addEventListener('beforeunload', unload);
    return () => { window.clearTimeout(timer.current); releaseWorkSession(session); window.removeEventListener('online', online); window.removeEventListener('storage', account); window.removeEventListener('focus', account); window.removeEventListener('beforeunload', unload); };
  }, [session]);
  useEffect(() => {
    if (initialized.current || session.loading()) return;
    initialized.current = true;
    const pending = session.continuation();
    if (pending) { setSource(pending.source); intent.current = pending.operationId; setNotice('An earlier continuation is waiting for a receipt. Retry to recover the same page.'); setSheet('continue'); }
    else if (params.get('capture') === '1') { const id = session.capture(); setSelected(id); setFresh(id); setQuick(true); setParams({ context: 'work' }, { replace: true }); }
    else if (!selected && session.pending().length) setSelected(session.pending()[0][0]);
  }, [version, params, selected, session, setParams]);
  useEffect(() => {
    if (note?._id && params.get('note') !== note._id && !quick) setParams({ context: 'work', note: note._id }, { replace: true });
  }, [note?._id, params, quick, setParams]);
  const closeSheet = React.useCallback(() => { if (!busyRef.current) { setSheet(null); setNotice(''); } }, []);
  const leave = (action) => {
    if (!session.canLeave()) { departure.current = action; setSheet('recovery'); return; }
    session.flush(selected); action();
  };
  const dismissCapture = () => leave(() => { if (!session.entry(selected)?._id && !session.pending().some(([id]) => id === selected)) session.discard(selected); setQuick(false); setFresh(''); setSelected(''); });
  const dismissQuick = React.useCallback(() => {
    if (!session.canLeave()) { departure.current = () => { setQuick(false); setFresh(''); setSelected(''); }; setQuick(false); setSheet('recovery'); return; }
    session.flush(selected); if (!session.pending().some(([id]) => id === selected) && !session.entry(selected)?._id) session.discard(selected);
    setQuick(false); setFresh(''); setSelected('');
  }, [selected, session]);
  useEffect(() => {
    const key = event => {
      if (locked || !session.isCurrent() || sheet || quick || event.defaultPrevented) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSheet('commands'); return; }
      if (event.key === 'Escape' && fresh) { event.preventDefault(); dismissCapture(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); session.flush(selected); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  });
  const prepareContinue = async id => {
    if (busyRef.current) return;
    const pending = session.continuation();
    if (pending) {
      setSource(pending.source); intent.current = pending.operationId; setChoosing(false); setSheet('continue');
      setNotice('Recover the earlier continuation receipt before starting another.'); return;
    }
    busyRef.current = true; setBusy(true); setNotice('');
    const ok = await session.flush(id);
    busyRef.current = false; setBusy(false);
    if (!ok || !session.entry(id)?._id || navigator.onLine === false) { setNotice('Sync this note before continuing. Your writing stays here.'); return; }
    setSource(session.entry(id)); intent.current = operationId(); setChoosing(false); setSheet('continue');
  };
  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setNotice('');
    try {
      const id = await session.continueFrom(source, intent.current);
      if (id) { setSheet(null); setSelected(id); setFresh(id); setMobileShelf(false); setParams({ context: 'work', note: id }, { replace: true }); }
    } catch (error) {
      const current = error?.response?.data?.current;
      if (error?.response?.status === 409 && current) {
        setSource(current); intent.current = operationId();
        setNotice('The source changed. Review these words before confirming again.');
      } else setNotice(error?.response?.data?.error || error?.message || 'Could not continue. Retry uses the same request; your original note is unchanged.');
    } finally { busyRef.current = false; setBusy(false); }
  };
  const download = () => {
    const blob = new Blob([JSON.stringify(session.pending().map(([, draft]) => draft.note), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'work-notes-recovery.json'; link.click(); URL.revokeObjectURL(url);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(session.pending().map(([, draft]) => `${draft.note.title || ''}\n${noteWords(draft.note)}\n${draft.note.workingState?.nextTimeLine?.text || ''}`).join('\n\n')); setNotice('Writing copied.'); }
    catch (_) { setNotice('Copy was unavailable. Download your recovery file or select your writing.'); }
  };
  const logout = remove => {
    try { if (remove) session.removeDrafts(); forgetWorkSession(session.account); onLogout(); }
    catch (_) { setNotice('Device drafts could not be removed. Stay here or keep them on this device.'); }
  };
  const list = notes.filter(item => (folder === 'all' || (item.folder?._id || item.folder || '') === folder) && `${item.title || ''} ${noteWords(item)}`.toLowerCase().includes(query.toLowerCase()));
  const predecessor = note?.continuesFromEntryId && notes.find(item => item._id === note.continuesFromEntryId);
  const onward = notes.filter(item => item.continuesFromEntryId === note?._id && note?._id);
  if (locked || !session.isCurrent()) return <main className="work-locked">
    <h1>Account changed</h1>
    <p>{session.canLeave() ? (session.pending().length ? 'Your pending writing is on this device. Sign in to the original account to resume.' : 'Keep this page open and sign in to the original account to resume this Work session.') : 'Your latest writing is still in this page, not saved on this device. Keep this page open and sign in to the original account to recover it.'}</p>
    {reauthenticate ? <Login recovery onLoginSuccess={() => {
      if (resumeWorkSession(session, localStorage.getItem('token') || '')) { setLocked(false); setReauthenticate(false); setNotice(''); }
      else setNotice('That is a different account. Sign in to the original account to recover this writing.');
    }} /> : <button onClick={() => { setNotice(''); setReauthenticate(true); }}>Sign in to the original account</button>}
    {notice && reauthenticate ? <p role="alert">{notice}</p> : null}
  </main>;
  return <div className="work-notes">
    <div inert={sheet || quick ? true : undefined}>
      <header className="work-masthead"><a href="/think?context=work" onClick={event => { event.preventDefault(); leave(() => { setSelected(''); setMobileShelf(true); }); }}>NOEIS</a><span>Think</span><nav aria-label="Work context"><span>Work · private</span><a href="/think" onClick={event => { event.preventDefault(); leave(() => navigate('/think')); }}>Personal</a><button onClick={() => setSheet('commands')}>Commands</button><button onClick={() => (session.pending().length || session.continuation()) ? setSheet('logout') : logout(false)}>Log out</button></nav></header>
      <div className={`work-layout ${mobileShelf ? 'is-shelf-open' : ''}`}>
        <aside className="work-shelf" aria-label="Work notes">
          <div className="work-shelf-top"><strong>Work notes</strong><button onClick={capture}>New note</button></div>
          <input type="search" aria-label="Search Work notes" placeholder="Find a phrase…" value={query} onChange={event => setQuery(event.target.value)} />
          <label className="work-filter">Filter by notebook<select value={folder} onChange={event => setFolder(event.target.value)}><option value="all">All notebooks</option><option value="">Inbox</option>{folders.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
          <button className="work-new-notebook" onClick={() => { setNewFolder(''); setSheet('folder'); }}>New notebook</button>
          {session.loading() ? <p role="status">Opening Work notes…</p> : session.error() ? <div role="alert"><p>{session.error()}</p><button onClick={() => session.load()}>Retry</button></div> : null}
          <div className="work-note-list">{list.map(item => <button key={item.clientId} aria-current={session.entry(item.clientId) === note ? 'page' : undefined} onClick={() => open(item.clientId)}><span>{noteTitle(item)}</span><small>{noteDate(item)}{item.localVersion ? ' · Local version' : ''}{(query || item.localVersion) && item.content ? <span className="work-match">{noteWords(item)}</span> : null}</small></button>)}</div>
          {!session.loading() && !list.length ? <p>{query ? 'No notes match these words.' : 'A place for the work in progress.'}</p> : null}
        </aside>
        <main className="work-page">
          <div className="work-mobile-nav"><button onClick={() => setMobileShelf(true)}>← Notes</button><button onClick={capture}>New</button></div>
          {note && !quick ? <>
            <div className="work-page-top"><label>Notebook<select aria-label="Notebook" value={note.folder?._id || note.folder || ''} onChange={event => update({ folder: event.target.value || null })}><option value="">Work inbox</option>{folders.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label><span role="status">{session.status(selected)}</span><button onClick={() => session.flush(selected)}>Sync now</button></div>
            <textarea className="work-title" aria-label="Note title" placeholder="Untitled note" value={note.title || ''} rows={1} onChange={event => update({ title: event.target.value })} />
            <div className="work-metadata"><label>Date<input aria-label="Occurred on" type="date" value={note.occurredOn || ''} onChange={event => update({ occurredOn: event.target.value })} /></label><label>with<input aria-label="With" placeholder="optional" value={note.withText || ''} onChange={event => update({ withText: event.target.value })} /></label></div>
            <button className="work-continue" aria-label={`Continue this note: ${noteTitle(note)}`} disabled={busy || !note._id} onClick={() => prepareContinue(selected)}>Continue this note →</button>
            {note.continuesFromEntryId ? <div className="work-bridge">{note.continuationBridge ? <><span>Last time’s line</span><blockquote>{note.continuationBridge.text}</blockquote></> : null}{predecessor ? <button onClick={() => open(predecessor.clientId)}>Continued from {noteTitle(note.continuationBridge || predecessor)} · {noteDate(note.continuationBridge || predecessor)}</button> : <span>Continued from an unavailable note</span>}</div> : null}
            {conflict ? <section className="work-conflict" role="alert"><h2>This note changed elsewhere</h2><p>Both versions are kept. Your version remains in the editor.</p><details><summary>Review the server version</summary><h3>{noteTitle(conflict)}</h3><p className="work-server-prose">{noteWords(conflict)}</p><blockquote>{conflict.workingState?.nextTimeLine?.text}</blockquote></details><button onClick={() => { session.useServer(selected); setFresh(''); }}>Use server version</button><button onClick={() => { const id = session.saveAsNew(selected); setSelected(id); setFresh(id); }}>Save local as a new note</button></section> : null}
            <WorkNoteEditor key={`${selected}:${conflict ? 'conflict' : ''}`} note={note} fresh={fresh === selected} onChange={update} />
            <label className="work-return">Leave a line for next time<textarea aria-label="Return line" value={note.workingState?.nextTimeLine?.text || ''} placeholder="Where would you like to pick up?" onChange={event => update({ workingState: { ...note.workingState, nextTimeLine: { text: event.target.value, target: null } } })} /></label>
            {onward.length ? <nav className="work-onward" aria-label="Continued in">{onward.map(item => <button key={item.clientId} onClick={() => open(item.clientId)}>Continued in {noteTitle(item)} · {noteDate(item)}</button>)}</nav> : null}
          </> : <div className="work-empty"><p>Work notes</p><h1>Pick up where you left off.</h1><p>Open a note, or start with a few words.</p><button onClick={capture}>Write a note</button></div>}
          {notice && !sheet ? <p role="alert">{notice}</p> : null}
        </main>
      </div>
    </div>
    {sheet === 'commands' ? <WorkDialog title="Work commands" onClose={closeSheet}>
      <button onClick={() => { setSheet(null); leave(() => { capture(); setQuick(true); }); }}>Quick Work note</button>
      <button disabled={!note?._id} onClick={() => { setSheet(null); prepareContinue(selected); }}>Continue this note</button>
      <button onClick={() => { setSheet(null); setMobileShelf(true); window.requestAnimationFrame(() => document.querySelector('.work-shelf input[type=search]')?.focus()); }}>Find a phrase in Work</button>
      <button onClick={closeSheet}>Close</button>
    </WorkDialog> : null}
    {sheet === 'continue' ? <WorkDialog title={choosing ? 'Choose a note to continue' : 'Continue from this note'} onClose={closeSheet}>
      {choosing ? <div className="work-source-list">{notes.filter(item => item._id).map(item => <button key={item.clientId} onClick={() => prepareContinue(item.clientId)}>{noteTitle(item)} · {noteDate(item)}</button>)}</div> : <><h3>{noteTitle(source)}</h3><p>{noteDate(source)}{source?.withText ? ` · with ${source.withText}` : ''}</p>{source?.workingState?.nextTimeLine?.text?.trim() ? <blockquote>{source.workingState.nextTimeLine.text}</blockquote> : <p>No return line was left on this note.</p>}<p>A fresh dated page in {folders.find(item => item._id === (source?.folder?._id || source?.folder))?.name || 'Work inbox'}. The original stays as it is.</p><div className="work-actions"><button disabled={busy} onClick={confirm}>Continue →</button><button disabled={busy || Boolean(session.continuation())} onClick={() => setChoosing(true)}>Choose another note</button></div></>}
      {notice ? <p role="alert">{notice}</p> : null}<button disabled={busy} onClick={closeSheet}>Cancel</button>
    </WorkDialog> : null}
    {sheet === 'folder' ? <WorkDialog title="New notebook" onClose={closeSheet}><form onSubmit={async event => { event.preventDefault(); if (busyRef.current || !newFolder.trim()) return; busyRef.current = true; setBusy(true); try { const created = await session.addFolder(newFolder); if (created) { if (note) update({ folder: created._id }); setFolder(created._id); setSheet(null); } } catch (error) { setNotice(error?.response?.data?.error || 'Could not create this notebook. Retry.'); } finally { busyRef.current = false; setBusy(false); } }}><label>Notebook name<input value={newFolder} onChange={event => setNewFolder(event.target.value)} /></label><button disabled={busy || !newFolder.trim()}>Create notebook</button></form>{notice ? <p role="alert">{notice}</p> : null}<button onClick={closeSheet}>Cancel</button></WorkDialog> : null}
    {sheet === 'logout' ? <WorkDialog title="Your Work drafts" onClose={closeSheet}><p>Unsynced writing is on this device. Browser storage is not a secure vault; other people using this browser may be able to read it.</p><button disabled={!session.canLeave()} onClick={() => logout(false)}>Keep on this device</button><button onClick={() => logout(true)}>Remove from this device</button><button onClick={closeSheet}>Cancel</button>{notice ? <p role="alert">{notice}</p> : null}</WorkDialog> : null}
    {sheet === 'recovery' ? <WorkDialog title="Keep your writing" onClose={closeSheet}><p>This device could not keep your latest writing. Stay here until it saves, or take a copy before leaving.</p><button onClick={closeSheet}>Stay</button><button onClick={copy}>Copy writing</button><button onClick={download}>Download recovery</button><button onClick={() => { session.pending().forEach(([id]) => session.discard(id)); setSheet(null); departure.current?.(); }}>Discard and leave</button>{notice ? <p role="status">{notice}</p> : null}</WorkDialog> : null}
    {quick && note ? <WorkDialog title="Work inbox · private" onClose={dismissQuick}><WorkNoteEditor key={selected} note={note} fresh onChange={update} /><p role="status">{session.status(selected)}</p><button onClick={() => leave(() => setQuick(false))}>Open as page</button><button onClick={dismissQuick}>Close</button></WorkDialog> : null}
  </div>;
}
