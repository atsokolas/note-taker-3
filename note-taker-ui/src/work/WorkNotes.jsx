import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import WorkNoteEditor from './WorkNoteEditor';
import WorkCalendar from './WorkCalendar';
import WorkFollowups from './WorkFollowups';
import WorkShelf from './WorkShelf';
import WorkIndex from './WorkIndex';
import WorkItemForm from './WorkItemForm';
import WorkMargin from './WorkMargin';
import { KIND_LABEL, dayInZone, deviceTimeZone, displayDay, projectItem, readPlan, shiftDay, validDay, writtenDay } from './workPlannerModel';
import Login from '../components/Login';
import { workSessionFor, resumeWorkSession, releaseWorkSession } from './workSessions';
import { noteTitle, noteDate, noteWords, operationId, workAccount } from './workSession';
import './work-notes.css';

export function WorkDialog({ title, children, onClose, onCommit }) {
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
  return <dialog ref={ref} className="work-dialog" onKeyDown={event => { if (onCommit && (event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); onCommit(); } }} aria-label={title} aria-modal="true" onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2>{title}</h2>{children}
  </dialog>;
}
function ItemVersion({ record, folders }) {
  if (!record) return <p>No version is available.</p>;
  const item = projectItem(record);
  return <div className="work-item-version"><h3>{item.title || 'Day margin'}</h3><p>{item.completed ? `Completed ${displayDay(dayInZone(item.completedAt, item.completedTimeZone))}` : 'Open'} · {item.plannedOn ? `Planned ${displayDay(item.plannedOn)}` : 'No planned day'}{item.dueOn ? ` · Due ${displayDay(item.dueOn)}` : ''}</p><p>{folders.find(folder => folder._id === (item.folder?._id || item.folder))?.name || 'Work inbox'}{item.startTime ? ` · ${item.startTime}–${item.endTime}` : ''}</p>{item.content ? <p>{item.content}</p> : null}<details><summary>Action history · {item.history.length}</summary><ol>{item.history.map(event => <li key={event.operationId}>{event.type}{event.plannedOn ? ` · ${displayDay(event.plannedOn)}` : ''} · {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: event.timeZone }).format(new Date(event.actionAt))} · {event.timeZone}{event.pending ? ' · Pending sync' : ''}</li>)}</ol></details></div>;
}
const viewKey = account => `noeis:work-view:${account}`;
const rememberedView = account => { try { const value = JSON.parse(localStorage.getItem(viewKey(account)) || '{}'); if (!value || typeof value !== 'object' || Array.isArray(value)) return {}; if (value.timeZone) new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format(); return value; } catch (_) { return {}; } };

export default function WorkNotes() {
  const [params, setParams] = useSearchParams();
  const [session] = useState(() => workSessionFor(localStorage.getItem('token') || ''));
  const version = useSyncExternalStore(session.subscribe, session.snapshot);
  const [selected, setSelected] = useState(params.get('note') || '');
  const [fresh, setFresh] = useState('');
  const [query, setQuery] = useState('');
  const [preferences, setPreferences] = useState(() => rememberedView(workAccount(localStorage.getItem('token') || '')));
  const timeZone = preferences.timeZone || deviceTimeZone();
  const [today, setToday] = useState(() => dayInZone(new Date(), timeZone));
  const openedDay = useRef(today);
  useEffect(() => { const refresh = () => setToday(dayInZone(new Date(), timeZone)); refresh(); const clock = window.setInterval(refresh, 60000); return () => window.clearInterval(clock); }, [timeZone]);
  const [day, setDay] = useState(() => validDay(params.get('date')) ? params.get('date') : today);
  const [view, setView] = useState(params.get('view') || 'today');
  const [folder, setFolder] = useState(params.get('folder') || 'all');
  const [calendarMode, setCalendarMode] = useState(() => preferences.calendarMode === 'week' ? 'week' : 'compact');
  const [folderEditing, setFolderEditing] = useState(null);
  const [folderFor, setFolderFor] = useState(false);
  const [itemDraft, setItemDraft] = useState(null);
  const [move, setMove] = useState(null);
  const [moveLinked, setMoveLinked] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [jotChoice, setJotChoice] = useState('');
  const [zoneInput, setZoneInput] = useState(timeZone);
  const folderOperation = useRef(''), itemTimers = useRef(new Map()), ownURL = useRef(params.toString());
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
  const [filing, setFiling] = useState('');
  const [dragging, setDragging] = useState('');
  const departure = useRef(null), initialized = useRef(false);
  const notes = session.entries(), note = session.entry(selected), conflict = session.conflict(selected);
  const folders = session.folders();
  const items = session.items().map(item => ({ ...projectItem(item), conflicted: Boolean(session.conflict(item.clientId)) }));
  const currentFolder = folders.find(item => item._id === folder);
  const folderScope = view === 'folder' ? folder : view === 'inbox' ? '' : null;
  const writing = note && !quick ? note : null;
  const home = writing && folders.find(item => item._id === (writing.folder?._id || writing.folder));
  const elsewhere = [...folders.filter(item => !item.archivedAt && item !== home), ...(home ? [{ _id: '', name: 'Inbox' }] : [])];
  const isWriting = entry => Boolean(writing) && (entry.clientId === selected || Boolean(writing._id && entry._id === writing._id));
  const scopedItems = items.filter(item => folderScope === null || (item.folder?._id || item.folder || '') === folderScope);
  const jots = scopedItems.filter(item => item.kind === 'jot' && item.plannedOn === day && (item.folder?._id || item.folder || '') === (folderScope || '')).sort((a, b) => String(a.capturedAt || a.createdAt || a.id).localeCompare(String(b.capturedAt || b.createdAt || b.id)));
  const jot = jots.find(item => item.clientId === jotChoice) || jots[0];
  const url = React.useCallback((patch = {}, replace = true) => {
    const next = { date: day, view, folder, note: note?._id || '', ...patch };
    const value = new URLSearchParams({ date: next.date, view: next.view, ...(next.folder && next.folder !== 'all' ? { folder: next.folder } : next.view === 'inbox' ? { folder: '' } : {}), ...(next.note ? { note: next.note } : {}) });
    ownURL.current = value.toString(); setParams(value, { replace });
  }, [day, view, folder, note?._id, setParams]);
  const restoreURL = useRef(url); restoreURL.current = url;
  const quickNote = React.useCallback(() => { const id = session.capture({ folder: null, timeZone }); setSelected(id); setFresh(id); setQuick(true); restoreURL.current({ note: '' }); }, [session, timeZone]);
  useEffect(() => { try { if (session.isCurrent()) localStorage.setItem(viewKey(session.account), JSON.stringify({ ...preferences, calendarMode })); } catch (_) { /* Display preferences are optional; writing durability is reported separately. */ } }, [preferences, calendarMode, session]);
  useEffect(() => {
    if (params.toString() === ownURL.current) return; ownURL.current = params.toString();
    if (!session.canLeave()) { restoreURL.current(); setSheet('recovery'); return; }
    if (initialized.current && params.get('capture') === '1') { quickNote(); return; }
    setView(params.get('view') || 'today'); setFolder(params.get('folder') || 'all');
    if (validDay(params.get('date'))) setDay(params.get('date'));
    setSelected(params.get('note') || ''); setFresh('');
  }, [params, quickNote, session]);
  const update = patch => {
    if (!session.isCurrent()) { setLocked(true); return; }
    session.edit(selected, patch);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => session.flush(selected), 850);
  };
  const open = id => {
    if (!session.canLeave()) { departure.current = () => open(id); setSheet('recovery'); return; }
    session.flush(selected); setSelected(id); setMobileShelf(false); setFresh(''); setNotice('');
    const entry = session.entry(id); url({ note: entry?._id || '' }, false);
  };
  const capture = () => {
    if (currentFolder?.archivedAt && view === 'folder') { setNotice('Restore this folder before adding new writing.'); return; }
    if (!session.canLeave()) { departure.current = capture; setSheet('recovery'); return; }
    session.flush(selected); const id = session.capture({ folder: folderScope || null, timeZone, occurredOn: day }); setSelected(id); setFresh(id); setMobileShelf(false);
    url({ note: '' });
  };
  useEffect(() => {
    const timers = itemTimers.current;
    const online = () => { if (!session.isCurrent()) { setLocked(true); return; } session.pending().forEach(([id]) => session.flush(id)); };
    // Writing left pending in another room goes up when you come back.
    resumeWorkSession(session, localStorage.getItem('token') || ''); session.load().then(online);
    const account = () => {
      session.refreshDrafts();
      const returned = resumeWorkSession(session, localStorage.getItem('token') || '');
      setLocked(!returned); if (returned && !session.authNeeded()) setReauthenticate(false);
    };
    const unload = event => { if (!session.canLeave()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('online', online); window.addEventListener('storage', account); window.addEventListener('focus', account); window.addEventListener('beforeunload', unload);
    return () => { window.clearTimeout(timer.current); timers.forEach(value => window.clearTimeout(value)); releaseWorkSession(session); window.removeEventListener('online', online); window.removeEventListener('storage', account); window.removeEventListener('focus', account); window.removeEventListener('beforeunload', unload); };
  }, [session]);
  useEffect(() => {
    if (initialized.current || session.loading()) return;
    initialized.current = true;
    const pending = session.continuation();
    if (pending) { setSource(pending.source); intent.current = pending.operationId; setNotice('An earlier continuation is waiting for a receipt. Retry to recover the same page.'); setSheet('continue'); }
    else if (params.get('capture') === '1') quickNote();
    else if (!selected && session.pending().length) setSelected(session.pending()[0][0]);
  }, [version, params, quickNote, selected, session]);
  useEffect(() => {
    if (note?._id && params.get('note') !== note._id && !quick) url({ note: note._id });
  }, [note?._id, params, quick, setParams, url]);
  const closeSheet = React.useCallback(() => { if (!busyRef.current) { setSheet(null); setNotice(''); } }, []);
  const leave = (action) => {
    if (!session.canLeave()) { departure.current = action; setSheet('recovery'); return; }
    session.pending().forEach(([id]) => session.flush(id)); action();
  };
  const dismissCapture = () => leave(() => { if (!session.entry(selected)?._id && !session.pending().some(([id]) => id === selected)) session.discard(selected); setQuick(false); setFresh(''); setSelected(''); });
  const dismissQuick = React.useCallback(() => {
    if (!session.canLeave()) { departure.current = () => { setQuick(false); setFresh(''); setSelected(''); }; setQuick(false); setSheet('recovery'); return; }
    session.flush(selected); if (!session.pending().some(([id]) => id === selected) && !session.entry(selected)?._id) session.discard(selected);
    setQuick(false); setFresh(''); setSelected('');
  }, [selected, session]);
  useEffect(() => {
    const key = event => {
      if (locked || reauthenticate || !session.isCurrent() || sheet || quick || event.defaultPrevented) return;
      if (event.key === 'Escape' && mobileShelf) { event.preventDefault(); setMobileShelf(false); return; }
      if (event.key === 'Escape' && fresh) { event.preventDefault(); dismissCapture(); }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && fresh) { event.preventDefault(); syncNote(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); syncNote(); }
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
      const id = await session.continueFrom(source, intent.current, { timeZone });
      if (id) { setSheet(null); setSelected(id); setFresh(id); setMobileShelf(false); url({ note: id }); }
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
  const scope = (nextView, nextFolder = 'all') => leave(() => { setView(nextView); setFolder(nextFolder); if (nextView === 'today') setDay(today); setSelected(''); setFresh(''); setMobileShelf(false); url({ view: nextView, folder: nextFolder, note: '', ...(nextView === 'today' ? { date: today } : {}) }, false); });
  // A day is a view of its own: choosing one shows the day, never a note from it.
  // Choosing a day from anywhere in Work opens that day's page.
  const selectDay = next => leave(() => { setView('today'); setFolder('all'); setDay(next); setSelected(''); setFresh(''); setMobileShelf(false); url({ view: 'today', folder: 'all', date: next, note: '' }, false); });
  const openFolder = item => { setFolderEditing(item); setNewFolder(item.name); folderOperation.current = operationId(); setNotice(''); setSheet('manage-folder'); };
  // From a note's place line, the new folder is where that note goes; from the rail it is only a new place.
  const newFolderDialog = (forNote = false) => { setFolderFor(forNote); setFolderEditing(null); setNewFolder(''); folderOperation.current = operationId(); setNotice(''); setSheet('folder'); };
  const newItem = (defaults = {}) => { if (currentFolder?.archivedAt && view === 'folder') { setNotice('Restore this folder before adding planned work.'); return; } setItemDraft({ defaults: { folder: folderScope || '', ...defaults }, intent: operationId() }); setNotice(''); setSheet('item'); };
  const editItem = (item, mode = 'edit') => {
    setItemDraft({ item, intent: operationId() }); setNotice('');
    if (mode !== 'history' && session.conflict(item.clientId)) { setSheet('item-conflict'); return; }
    if (item.kind === 'jot') { leave(() => { const folder = item.folder?._id || item.folder || ''; const view = folder ? 'folder' : 'inbox'; setView(view); setFolder(folder); setDay(item.plannedOn); setSelected(''); setJotChoice(item.clientId); url({ view, folder, date: item.plannedOn, note: '' }, false); setSheet('margin'); }); return; }
    setSheet(mode === 'history' ? 'history' : 'item');
  };
  const editItemPatch = (id, patch) => { session.edit(id, patch); window.clearTimeout(itemTimers.current.get(id)); itemTimers.current.set(id, window.setTimeout(() => session.flush(id), 850)); };
  const action = (id, values) => { if (session.conflict(id)) { setItemDraft({ item: { ...session.entry(id), clientId: id } }); setSheet('item-conflict'); return null; } const operation = session.action(id, { timeZone, ...values }); if (operation) session.flush(id); return operation; };
  const saveItem = async value => {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setNotice('');
    try {
      let linked = value.noteId, createdNote = itemDraft.createdNote;
      if (value.createNote) {
        if (!createdNote) { createdNote = session.capture({ title: value.title, folder: value.folder || null, occurredOn: value.plannedOn || day, withText: value.withText, timeZone }); session.edit(createdNote, { title: value.title }); setItemDraft(current => ({ ...current, createdNote })); }
        linked = session.entry(createdNote)?._id || createdNote;
      }
      let id = itemDraft.item?.clientId || itemDraft.clientId;
      const workItem = { kind: value.kind, noteId: linked || null, dueOn: value.dueOn || null, priority: value.kind === 'appointment' ? 0 : value.priority, startTime: value.kind === 'appointment' ? value.startTime : '', endTime: value.kind === 'appointment' ? value.endTime : '' };
      if (!id) { id = session.capture({ title: value.title, folder: value.folder || null, timeZone, workItem: { ...workItem, plannedOn: value.plannedOn || null } }); setItemDraft(current => ({ ...current, clientId: id })); }
      const current = session.entry(id);
      session.edit(id, { title: value.title, folder: value.folder || null, withText: value.withText, workItem: { ...current.workItem, ...workItem } });
      if (itemDraft.item && (value.plannedOn || null) !== (projectItem(current).plannedOn || null)) session.action(id, { type: 'plan', plannedOn: value.plannedOn || null, timeZone });
      const ok = await session.flush(id);
      if (ok) { setSheet(null); if (createdNote) open(createdNote); }
      else if (session.conflict(id)) { setItemDraft({ item: { ...session.entry(id), clientId: id } }); setSheet('item-conflict'); }
      else setNotice(session.status(id));
    } finally { busyRef.current = false; setBusy(false); }
  };
  const applyReviewedItem = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setNotice('');
    try {
      session.rebaseItem(itemDraft.item.clientId);
      const accepted = await session.flush(itemDraft.item.clientId);
      if (!session.isCurrent()) return;
      if (accepted) setSheet(null); else setNotice(session.status(itemDraft.item.clientId));
    } finally { busyRef.current = false; setBusy(false); }
  };
  const mutateFolder = async patch => { if (busyRef.current) return; busyRef.current = true; setBusy(true); setNotice(''); try { const saved = await session.updateFolder(folderEditing, patch, folderOperation.current); if (saved) { setSheet(null); setReceipt({ text: saved.archivedAt ? 'Folder set aside. Its writing and planned work are kept.' : 'Folder updated.' }); } } catch (error) { setNotice(error?.response?.data?.error || 'Could not update this folder. Retry.'); } finally { busyRef.current = false; setBusy(false); } };
  const reorderFolder = async offset => { if (busyRef.current) return; const order = folders.filter(item => !item.archivedAt).map(item => item._id), at = order.indexOf(folderEditing._id), target = at + offset; if (target < 0 || target >= order.length) return; [order[at], order[target]] = [order[target], order[at]]; busyRef.current = true; setBusy(true); try { await session.reorderFolders(order, folderOperation.current); setSheet(null); } catch (error) { setNotice(error?.response?.data?.error || 'Could not reorder. Reload the folders and retry.'); } finally { busyRef.current = false; setBusy(false); } };
  const fileRecords = async (records, target, restoring = false) => {
    const previous = records.map(item => ({ clientId: item.clientId, folder: item.folder || null }));
    records.forEach(item => session.edit(item.clientId, { folder: restoring ? item.folder : target || null }));
    setSheet(null);
    setReceipt({ text: 'Filing changes on this device · sync pending' });
    const accepted = await Promise.all(records.map(item => session.flush(item.clientId)));
    if (!session.isCurrent()) return;
    setReceipt({ text: accepted.every(Boolean) ? (restoring ? 'Previous folders restored.' : `Filed in ${session.folders().find(item => item._id === target)?.name || 'the inbox'}.`) : 'Some filing changes need sync or review. Each item keeps its own saved version.',
      ...(restoring ? {} : { undo: () => fileRecords(previous, null, true) }) });
  };
  const fileNote = (target, entry = { ...note, clientId: selected }) => {
    const linked = items.filter(item => [entry._id, entry.clientId].filter(Boolean).includes(item.noteId) && ['task', 'question'].includes(item.kind));
    if (linked.length) { setMove({ target, items: linked, entry }); setMoveLinked(false); setSheet('move'); }
    else fileRecords([entry], target);
  };
  // Any note row can be dragged onto a place in the rail; the drop files it exactly as the place line does.
  // The pointer carries only the note's title in the reading face; the rail shows where it will land.
  const dragLabel = title => { const label = document.createElement('span'); label.className = 'work-drag-label'; label.textContent = title; document.body.appendChild(label); window.setTimeout(() => label.remove()); return label; };
  const drag = entry => ({ draggable: true, 'data-lifted': dragging === entry.clientId || undefined, onDragStart: event => { event.dataTransfer.setData('text/plain', entry.clientId); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setDragImage?.(dragLabel(noteTitle(entry)), 12, 12); setDragging(entry.clientId); }, onDragEnd: () => setDragging('') });
  const dropNote = (clientId, target) => { const entry = session.entry(clientId); setDragging(''); if (entry && (entry.folder?._id || entry.folder || '') !== target) fileNote(target, { ...entry, clientId }); };
  const linkedItems = items.filter(item => [note?._id, selected].filter(Boolean).includes(item.noteId));
  const notePending = session.pending().filter(([id]) => id === selected || linkedItems.some(item => item.clientId === id));
  const noteStatus = notePending.length ? notePending.map(([id]) => session.status(id)).find(status => status !== 'Saved') || session.status(selected) : session.status(selected);
  const syncNote = () => Promise.all([selected, ...linkedItems.map(item => item.clientId)].filter(Boolean).map(id => session.flush(id)));
  // One typed line becomes a follow-up, question or appointment; the full form stays for anything more.
  const plan = ({ text, kind, noteId = null, folder = folderScope || null, plannedOn = null }) => {
    if (!noteId && currentFolder?.archivedAt && view === 'folder') { newItem(); return; }
    const read = readPlan(text, today);
    const id = session.capture({ folder, timeZone, workItem: { kind: kind || read.kind || 'task', noteId, plannedOn: read.plannedOn || plannedOn, priority: 0, startTime: kind ? '' : read.startTime || '', endTime: kind ? '' : read.endTime || '' } });
    session.edit(id, { title: read.title }); session.flush(id);
  };
  // A meeting starts its own note. One held before under the same name continues from last time.
  const startMeeting = async item => {
    if (item.noteId) { open(item.noteId); return; }
    const series = notes.filter(entry => entry._id && noteTitle(entry).toLowerCase() === item.title.trim().toLowerCase()).sort((a, b) => writtenDay(b).localeCompare(writtenDay(a)))[0];
    const continued = series && navigator.onLine !== false && !session.continuation() ? await session.continueFrom(series, operationId(), { timeZone }).catch(() => null) : null;
    const id = continued || session.capture({ folder: item.folder?._id || item.folder || null, timeZone });
    session.edit(id, { title: item.title, withText: item.withText || '', occurredOn: item.plannedOn });
    session.edit(item.clientId, { workItem: { ...session.entry(item.clientId).workItem, noteId: session.entry(id)._id || id } });
    session.flush(id); session.flush(item.clientId); open(id);
  };
  const writeJot = value => { let id = jot?.clientId; if (!id && !value.trim()) return; if (!id) id = session.capture({ folder: folderScope || null, timeZone, workItem: { kind: 'jot', plannedOn: day } }); editItemPatch(id, { content: value }); };
  const occupiedPriorities = (date, except) => items.filter(item => item.id !== except && !item.completed && item.plannedOn === date && item.priority).map(item => item.priority);
  const historyItem = itemDraft?.item && session.items().find(item => item.clientId === itemDraft.item.clientId);
  const predecessor = note?.continuesFromEntryId && notes.find(item => item._id === note.continuesFromEntryId);
  const stillOpen = items.filter(item => ['task', 'question'].includes(item.kind) && !item.completed && predecessor && item.noteId === predecessor._id);
  const meetingTime = note && items.find(item => item.kind === 'appointment' && item.noteId === note._id);
  const onward = notes.filter(item => item.continuesFromEntryId === note?._id && note?._id);
  const signIn = session.authNeeded() ? <button onClick={() => { window.clearTimeout(timer.current); setNotice(''); setReauthenticate(true); }}>Sign in to sync</button> : null;
  if (reauthenticate || locked || !session.isCurrent()) return <main className="work-locked">
    <h1>{locked || !session.isCurrent() ? 'Account changed' : 'Sign in to sync'}</h1>
    <p>{session.canLeave() ? (session.pending().length ? 'Your pending writing is on this device. Sign in to the original account to resume.' : 'Keep this page open and sign in to the original account to resume this Work session.') : 'Your latest writing is still in this page, not saved on this device. Keep this page open and sign in to the original account to recover it.'}</p>
    {reauthenticate ? <Login recovery onLoginSuccess={() => {
      if (resumeWorkSession(session, localStorage.getItem('token') || '')) { setLocked(false); setReauthenticate(false); setNotice(''); session.load(); }
      else setNotice('That is a different account. Sign in to the original account to recover this writing.');
    }} /> : <button onClick={() => { setNotice(''); setReauthenticate(true); }}>Sign in to the original account</button>}
    {notice && reauthenticate ? <p role="alert">{notice}</p> : null}
  </main>;
  if (session.compatible() === false) return <main className="work-locked"><h1>{session.authNeeded() ? 'Sign in to sync' : 'Work is updating'}</h1><p role="alert">{session.error() || 'Work needs its matching server before it can save. Retry shortly.'}</p><p>Keep this page open if you have unsynced writing.</p>{signIn}<button disabled={session.authNeeded()} onClick={() => session.load()}>Retry Work</button></main>;
  return <div className="work-notes">
    <div inert={sheet || quick ? true : undefined}>
      <div className={`work-layout ${mobileShelf ? 'is-shelf-open' : ''}`}>
        <WorkShelf dragging={dragging} drag={drag} onDropNote={dropNote} onClose={() => setMobileShelf(false)} notes={notes} folders={folders} place={writing ? home?._id || '' : folderScope} current={isWriting} day={day} view={view} query={query} onQuery={setQuery} onScope={scope} onOpen={open} onCapture={capture} onNewFolder={() => newFolderDialog()} onFolderMenu={openFolder} timeZone={timeZone} onTimeZone={() => { setZoneInput(timeZone); setSheet('timezone'); }} loading={session.loading()} error={session.error()} onRetry={() => session.load()} />
        <main className="work-page">
          {!sheet && !quick ? signIn : null}
          <div className="work-mobile-nav"><button onClick={() => setMobileShelf(true)}>Notes &amp; folders</button><button aria-label="New Work note" onClick={capture}>New note</button></div>
          {openedDay.current !== today && day === openedDay.current ? <p className="work-new-day">A new day is here. This note keeps its original written day. <button onClick={() => selectDay(today)}>Open today</button></p> : null}
          <WorkCalendar page={view === 'today' && !writing} mark={writing ? writtenDay(note) : null} drag={drag} day={writing ? writtenDay(note) : day} today={today} mode={calendarMode} onMode={setCalendarMode} onDay={selectDay} items={scopedItems} notes={notes} query={query} folders={folders} onOpen={open} onEdit={editItem} onAction={action} onStart={startMeeting} onNew={newItem} onPlan={text => plan({ text, plannedOn: day })} margin={<WorkMargin disabled={Boolean(currentFolder?.archivedAt && !jot)} jots={jots} jot={jot} session={session} onChoose={setJotChoice} onChange={writeJot} onReview={editItem} />} />
          {writing ? <article className="work-note-paper">
            <div className="work-note-title"><textarea className="work-title" aria-label="Note title" placeholder={noteTitle(note)} value={note.title || ''} rows={1} onChange={event => update({ title: event.target.value })} /></div>
            <p className="work-place-line" role="group" aria-label="Where this note lives">In <button aria-expanded={!home || filing === selected} onClick={() => home ? setFiling(value => value === selected ? '' : selected) : scope('inbox', '')}>{home?.name || 'your Inbox'}</button>, written {displayDay(writtenDay(note))}{note.withText?.trim() ? `, with ${note.withText.trim()}` : ''}{meetingTime ? ` at ${meetingTime.startTime}–${meetingTime.endTime}` : ''}.{!home || filing === selected ? <span className="work-file-in"> {home ? 'Move to' : 'File in'} {elsewhere.map((item, index) => <React.Fragment key={item._id || 'inbox'}><button onClick={() => { setFiling(''); fileNote(item._id); }}>{item.name}</button>{index < elsewhere.length - 1 ? ', ' : ' '}</React.Fragment>)}or <button onClick={() => newFolderDialog(true)}>a new folder</button>.</span> : null}<span role="status" className={noteStatus === 'Saved' ? 'work-sr-only' : 'work-note-status'}> {noteStatus}</span>{noteStatus === 'Saved' ? null : <button className="work-sync" onClick={syncNote}>Sync now</button>}</p>
            {note.continuesFromEntryId ? <p className="work-last-time">Last time{predecessor ? <>, <button onClick={() => open(predecessor.clientId)}>{noteDate(note.continuationBridge || predecessor)}</button></> : null}{note.continuationBridge?.text?.trim() ? <>, you left yourself: <q>{note.continuationBridge.text.trim()}</q></> : '.'}</p> : null}
            {conflict ? <section className="work-conflict" role="alert"><h2>This note changed elsewhere</h2><p>Both versions are kept. Your version remains in the editor.</p><details><summary>Review the server version</summary><h3>{noteTitle(conflict)}</h3><p className="work-server-prose">{noteWords(conflict)}</p><blockquote>{conflict.workingState?.nextTimeLine?.text}</blockquote></details><button onClick={() => { session.useServer(selected); setFresh(''); }}>Use server version</button><button onClick={() => { const id = session.saveAsNew(selected); setSelected(id); setFresh(id); }}>Save local as a new note</button></section> : null}
            <WorkFollowups key={selected} carried={stillOpen} note={{ ...note, clientId: selected }} tomorrow={shiftDay(today, 1)} session={session} timeZone={timeZone} onEdit={editItem} onAction={action} onConflict={item => { setItemDraft({ item }); setSheet('item-conflict'); }}><WorkNoteEditor key={`${selected}:${conflict ? 'conflict' : ''}`} note={note} fresh={fresh === selected} onChange={update} onFollowUp={({ kind, text }) => plan({ text, kind, noteId: note._id || selected, folder: note.folder?._id || note.folder || null })} /></WorkFollowups>
            <div className="work-foot"><label className="work-return"><span className="work-sr-only">Leave a line for next time</span><textarea rows={1} aria-label="Return line" value={note.workingState?.nextTimeLine?.text || ''} placeholder="A line for next time" onChange={event => update({ workingState: { ...note.workingState, nextTimeLine: { text: event.target.value, target: null } } })} /></label>
            <button className="work-continue" aria-label={`Continue this note: ${noteTitle(note)}`} disabled={busy || !note._id} onClick={() => prepareContinue(selected)}>Continue this note</button></div>
            <details className="work-note-details"><summary>People and meeting date</summary><label>With<input aria-label="With" placeholder="Add people, if useful" value={note.withText || ''} onChange={event => update({ withText: event.target.value })} /></label><label>Meeting date<input aria-label="Occurred on" type="date" value={note.occurredOn || ''} onChange={event => update({ occurredOn: event.target.value })} /></label><p>Changing the meeting date or folder keeps the written day.</p></details>
            {onward.length ? <nav className="work-onward" aria-label="Continued in">{onward.map(item => <button key={item.clientId} onClick={() => open(item.clientId)}>Continued in {noteTitle(item)} · {noteDate(item)}</button>)}</nav> : null}
          </article> : view === 'today' ? null : <WorkIndex drag={drag} view={view} folder={currentFolder} folders={folders} notes={notes} items={session.items()} query={query} onOpen={open} onItem={item => editItem(item)} onNew={newItem} onFolderMenu={openFolder} />}
          {notice && !sheet ? <p role="alert">{notice}</p> : null}
        </main>
      </div>
      {receipt ? <div className="work-receipt" aria-live="polite"><span>{receipt.text}</span>{receipt.undo ? <button onClick={() => { const undo = receipt.undo; setReceipt(null); undo(); }}>Undo</button> : null}<button aria-label="Dismiss receipt" onClick={() => setReceipt(null)}>Close</button></div> : null}
    </div>
    {sheet === 'continue' ? <WorkDialog title={choosing ? 'Choose a note to continue' : 'Continue from this note'} onClose={closeSheet}>
      {choosing ? <div className="work-source-list">{notes.filter(item => item._id).map(item => <button key={item.clientId} onClick={() => prepareContinue(item.clientId)}>{noteTitle(item)} · {noteDate(item)}</button>)}</div> : <><h3>{noteTitle(source)}</h3><p>{noteDate(source)}{source?.withText ? ` · with ${source.withText}` : ''}</p>{source?.workingState?.nextTimeLine?.text?.trim() ? <blockquote>{source.workingState.nextTimeLine.text}</blockquote> : <p>No return line was left on this note.</p>}<p>A fresh dated page in {folders.find(item => item._id === (source?.folder?._id || source?.folder))?.name || 'Work inbox'}. The original stays as it is.</p><div className="work-actions"><button disabled={busy} onClick={confirm}>Continue →</button><button disabled={busy || Boolean(session.continuation())} onClick={() => setChoosing(true)}>Choose another note</button></div></>}
      {signIn}{notice ? <p role="alert">{notice}</p> : null}<button disabled={busy} onClick={closeSheet}>Cancel</button>
    </WorkDialog> : null}
    {sheet === 'folder' ? <WorkDialog title="New folder" onClose={closeSheet}><form onSubmit={async event => { event.preventDefault(); if (busyRef.current || !newFolder.trim()) return; busyRef.current = true; setBusy(true); try { const created = await session.addFolder(newFolder, folderOperation.current); if (created) { setSheet(null); if (folderFor) { setFiling(''); fileNote(created._id); } else scope('folder', created._id); } } catch (error) { setNotice(error?.response?.data?.error || 'Could not create this folder. Retry.'); } finally { busyRef.current = false; setBusy(false); } }}><label>Folder name<input aria-label="Folder name" value={newFolder} onChange={event => setNewFolder(event.target.value)} /></label><button disabled={busy || !newFolder.trim()}>Create folder</button></form>{signIn}{notice ? <p role="alert">{notice}</p> : null}<button onClick={closeSheet}>Cancel</button></WorkDialog> : null}
    {sheet === 'manage-folder' && folderEditing ? <WorkDialog title={`Folder: ${folderEditing.name}`} onClose={closeSheet}><form onSubmit={event => { event.preventDefault(); mutateFolder({ name: newFolder }); }}><label>Folder name<input value={newFolder} onChange={event => setNewFolder(event.target.value)} /></label><button disabled={busy || !newFolder.trim()}>Save name</button></form><div className="work-actions">{!folderEditing.archivedAt ? <><button disabled={busy} onClick={() => reorderFolder(-1)}>Move up</button><button disabled={busy} onClick={() => reorderFolder(1)}>Move down</button></> : null}<button disabled={busy} onClick={() => mutateFolder({ archived: !folderEditing.archivedAt })}>{folderEditing.archivedAt ? 'Restore folder' : 'Archive folder'}</button><button disabled={busy} onClick={() => { setSheet(null); scope('folder', folderEditing._id); }}>Open folder</button></div><p>Archive sets this folder aside. Its notes, links and planned tasks stay intact.</p>{signIn}{notice ? <p role="alert">{notice}</p> : null}<button onClick={closeSheet}>Close</button></WorkDialog> : null}
    {sheet === 'item' && itemDraft ? <WorkDialog title={itemDraft.item ? `Edit ${KIND_LABEL[itemDraft.item.kind].toLowerCase()}` : 'New Work item'} onClose={closeSheet}><WorkItemForm key={itemDraft.intent} item={itemDraft.item} defaults={itemDraft.defaults} notes={notes} folders={folders} occupiedPriorities={occupiedPriorities} onSave={saveItem} busy={busy} onClose={closeSheet} />{signIn}{notice ? <p role="alert">{notice}</p> : null}</WorkDialog> : null}
    {sheet === 'history' && historyItem ? <WorkDialog title="Item history" onClose={closeSheet}><h3>{historyItem.title}</h3><ol>{projectItem(historyItem).history.map(event => <li key={event.operationId}><strong>{event.type === 'plan' ? `Planned ${event.plannedOn || 'without a day'}` : event.type === 'undo' ? 'Undid an action' : event.type === 'complete' ? 'Completed' : 'Reopened'}</strong><p><time>{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: event.timeZone }).format(new Date(event.actionAt))}</time> · {event.timeZone}{event.pending ? ' · Pending sync' : ` · Recorded ${new Date(event.recordedAt).toLocaleString()}`}</p></li>)}</ol><p>Action time and receipt time are separate. Moving a folder or reopening this note does not revise either record.</p><button onClick={closeSheet}>Close</button></WorkDialog> : null}
    {sheet === 'item-conflict' && itemDraft?.item ? <WorkDialog title="Review both item versions" onClose={closeSheet}><h3>Your version</h3><ItemVersion record={session.entry(itemDraft.item.clientId)} folders={folders} /><h3>Saved elsewhere</h3><ItemVersion record={session.conflict(itemDraft.item.clientId)} folders={folders} /><p>Pending actions and metadata are kept until you choose. Authored note prose is separate.</p><button disabled={busy} onClick={() => { session.useServer(itemDraft.item.clientId); setSheet(null); }}>Use saved version</button><button disabled={busy} onClick={applyReviewedItem}>{busy ? 'Saving reviewed changes…' : 'Apply my changes after review'}</button><button disabled={busy} onClick={closeSheet}>Keep both for now</button>{notice ? <p role="alert">{notice}</p> : null}</WorkDialog> : null}
    {sheet === 'move' && move ? <WorkDialog title="Move note" onClose={closeSheet}><p>Move this note to {folders.find(item => item._id === move.target)?.name || 'Work inbox'}.</p><label className="work-check-label"><input type="checkbox" checked={moveLinked} onChange={event => setMoveLinked(event.target.checked)} />Also move {move.items.length} linked follow-ups</label><p>Linked items keep their planned dates and history.</p><button onClick={() => fileRecords([move.entry, ...(moveLinked ? move.items : [])], move.target)}>Move note</button><button onClick={closeSheet}>Cancel</button></WorkDialog> : null}
    {sheet === 'margin' ? <WorkDialog title={`Day margin · ${displayDay(day)}`} onClose={closeSheet}><p>{currentFolder?.name || 'Work'} · A line to hold the day together.</p><WorkMargin disabled={Boolean(currentFolder?.archivedAt && !jot)} jots={jots} jot={jot} session={session} onChoose={setJotChoice} onChange={writeJot} onReview={editItem} /><button onClick={closeSheet}>Done</button></WorkDialog> : null}
    {sheet === 'timezone' ? <WorkDialog title="Written-day timezone" onClose={closeSheet}><p>New notes and actions use this timezone on this device. Earlier dates keep the zone recorded when you wrote them.</p><form onSubmit={event => { event.preventDefault(); try { new Intl.DateTimeFormat('en', { timeZone: zoneInput }).format(); setPreferences(current => ({ ...current, timeZone: zoneInput })); setSheet(null); } catch (_) { setNotice('Enter a timezone such as America/Chicago or Europe/London.'); } }}><label>Timezone<input value={zoneInput} onChange={event => setZoneInput(event.target.value)} /></label><button>Use timezone</button></form>{notice ? <p role="alert">{notice}</p> : null}<button onClick={closeSheet}>Cancel</button></WorkDialog> : null}
    {sheet === 'recovery' ? <WorkDialog title="Keep your writing" onClose={closeSheet}><p>This device could not keep your latest writing. Stay here until it saves, or take a copy before leaving.</p>{signIn}<button onClick={closeSheet}>Stay</button><button onClick={copy}>Copy writing</button><button onClick={download}>Download recovery</button><button onClick={() => { session.pending().forEach(([id]) => session.discard(id)); setSheet(null); departure.current?.(); }}>Discard and leave</button>{notice ? <p role="status">{notice}</p> : null}</WorkDialog> : null}
    {quick && note ? <WorkDialog title="Work inbox · private" onClose={dismissQuick} onCommit={async () => { if (await session.flush(selected)) dismissQuick(); }}><WorkNoteEditor key={selected} note={note} fresh onChange={update} /><p role="status">{session.status(selected)}</p>{signIn}<button onClick={() => session.flush(selected)}>Sync now</button><button onClick={() => leave(() => setQuick(false))}>Open as page</button><button onClick={dismissQuick}>Close</button></WorkDialog> : null}
  </div>;
}
