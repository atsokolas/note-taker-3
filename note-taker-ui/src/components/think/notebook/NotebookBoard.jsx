import React, { useEffect, useMemo, useState } from 'react';
import { clearNotebookCache, getNotebookBoard, moveNotebookEntry } from '../../../api/notebook';
import { Button, PageHeader } from '../../ui';
import { useSystemStatusControls } from '../../../system/SystemStatusContext';
import { wikiReadPath } from '../../../utils/wikiFeatureFlags';
import { settleNote } from './settleNote';
import {
  ARCHIVE_GROUPS,
  STAGES,
  buildBoard,
  cardLine,
  countLine,
  doneReceipt,
  placeCard
} from './notebookBoardModel';

// The board: every note filed as an idea, in progress, or done, with an
// archive for finished work and ideas let go. Drag a card between columns
// with a pointer; the Move menu does the same from a keyboard or a phone.

const MOVES = [...STAGES.map(({ key, label }) => ({ key, label: label === 'Ideas' ? 'Idea' : label })), { key: 'archive', label: 'Archive' }];

const BoardCard = ({ card, now, onOpen, onMove, archived }) => (
  <li
    className="notebook-board__card"
    draggable={!archived}
    onDragStart={event => {
      event.dataTransfer.setData('text/plain', card.id);
      event.dataTransfer.effectAllowed = 'move';
    }}
  >
    <button type="button" className="notebook-board__title" onClick={() => onOpen(card)}>{card.title}</button>
    {card.nextTimeLine && !archived ? <p className="notebook-board__next">Next: {card.nextTimeLine}</p> : null}
    {card.snippet && card.snippet !== card.title ? <p className="notebook-board__snippet">{card.snippet}</p> : null}
    <div className="notebook-board__meta">
      <span>{cardLine(card, now)}</span>
      {archived ? (
        <button type="button" className="notebook-board__restore" onClick={() => onMove(card, { archived: false })}>Restore</button>
      ) : (
        <select
          aria-label={`Move “${card.title}”`}
          value={card.stage}
          onChange={event => onMove(card, event.target.value === 'archive' ? { archived: true } : { stage: event.target.value })}
        >
          {MOVES.map(move => <option key={move.key} value={move.key}>{move.label}</option>)}
        </select>
      )}
    </div>
  </li>
);

const NotebookBoard = ({ view = 'board', onView, onOpen, onClose }) => {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [over, setOver] = useState('');
  const systemStatus = useSystemStatusControls();
  const now = Date.now();
  const board = useMemo(() => buildBoard(notes, now), [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    getNotebookBoard()
      .then(rows => { if (!cancelled) setNotes(rows); })
      .catch(() => { if (!cancelled) setError('Your notes could not be loaded. Reload to try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  /* Every move lands at once and is put back if the server refuses it. */
  const move = async (cards, change, said = null) => {
    const stamp = new Date().toISOString();
    const local = {
      ...(change.stage ? { stage: change.stage, movedAt: stamp } : {}),
      ...(change.archived !== undefined ? { archivedAt: change.archived ? stamp : null } : {})
    };
    setNotes(current => cards.reduce((next, card) => placeCard(next, card.id, local), current));
    setReceipt(said);
    try {
      const saved = await Promise.all(cards.map(card => moveNotebookEntry(card.id, change)));
      setNotes(current => cards.reduce((next, card, index) => (saved[index] ? placeCard(next, card.id, saved[index]) : next), current));
      clearNotebookCache();
    } catch (_error) {
      setNotes(current => cards.reduce((next, card) => placeCard(next, card.id, {
        stage: card.stage, movedAt: card.movedAt, archivedAt: card.archivedAt
      }), current));
      setReceipt({ message: cards.length === 1 ? `“${cards[0].title}” did not move. Try again.` : 'Those notes did not move. Try again.' });
    }
  };

  const moveOne = (card, change) => {
    if (change.stage === card.stage) return;
    const back = change.stage ? { stage: card.stage } : { archived: !change.archived };
    const undo = () => move([card], back);
    move([card], change, change.stage === 'done' ? { message: doneReceipt(card, Date.now()), undo, settle: card }
      : change.archived ? { message: `“${card.title}” is in the archive.`, undo }
      : change.archived === false ? { message: `“${card.title}” is back on the board.`, undo }
      : null);
  };

  /* Done is where finished thinking can settle into Wiki: offered, never assumed. */
  const settle = async (card) => {
    setReceipt({ message: `Settling “${card.title}” into Wiki…` });
    const { settledIn, resettled, refusal } = await settleNote(card.id, systemStatus);
    setReceipt(settledIn
      ? { message: `“${settledIn.title}” ${resettled ? 'revised' : 'settled'} in Wiki.`, href: wikiReadPath(settledIn._id) }
      : { message: refusal });
  };

  const archiveStale = () => {
    const stale = board.stale;
    move(stale, { archived: true }, {
      message: `${stale.length === 1 ? 'One idea' : `${stale.length} ideas`} set aside in the archive.`,
      undo: () => move(stale, { archived: false })
    });
  };

  const drop = (event, stage) => {
    event.preventDefault();
    setOver('');
    const id = event.dataTransfer.getData('text/plain');
    const card = board.columns.idea.concat(board.columns.in_progress, board.columns.done).find(item => item.id === id);
    if (card) moveOne(card, { stage });
  };

  const archive = view === 'archive';

  return (
    <section className="notebook-board" aria-labelledby="notebook-board-title">
      <PageHeader
        titleId="notebook-board-title"
        className="notebook-board__header"
        title={archive ? 'Archive' : 'Board'}
        lede={loading ? 'Gathering your notes…' : archive
          ? 'Finished pieces and ideas you set aside. Restore one to put it back on the board.'
          : countLine(board.columns)}
        actions={<>
          <Button variant="quiet" aria-pressed={archive} onClick={() => onView(archive ? 'board' : 'archive')}>
            {archive ? 'Back to the board' : `Archive${board.archived ? ` · ${board.archived}` : ''}`}
          </Button>
          <Button variant="quiet" onClick={onClose}>Back to writing</Button>
        </>}
      />
      <p className="notebook-board__receipt" role="status">
        {error || receipt?.message || ''}
        {receipt?.settle ? <button type="button" onClick={() => settle(receipt.settle)}>Settle into Wiki</button> : null}
        {receipt?.undo ? <button type="button" onClick={() => { const undo = receipt.undo; setReceipt(null); undo(); }}>Undo</button> : null}
        {receipt?.href ? <a href={receipt.href}>Open the page</a> : null}
      </p>

      {archive ? (
        <div className="notebook-board__archive">
          {board.archived ? ARCHIVE_GROUPS.filter(({ key }) => board.archive[key].length).map(({ key, label }) => (
            <section key={key} className="notebook-board__group" aria-label={label}>
              <h2>{label} <span>{board.archive[key].length}</span></h2>
              <ul>
                {board.archive[key].map(card => <BoardCard key={card.id} card={card} now={now} archived onOpen={onOpen} onMove={moveOne} />)}
              </ul>
            </section>
          )) : !loading ? <p className="notebook-board__quiet">Nothing set aside yet. When a piece is finished or an idea has gone cold, archive it and it waits here.</p> : null}
        </div>
      ) : (
        <div className="notebook-board__columns">
          {STAGES.map(({ key, label, empty }) => (
            <section
              key={key}
              className={`notebook-board__column${over === key ? ' is-over' : ''}`}
              aria-label={label}
              onDragOver={event => { event.preventDefault(); setOver(key); }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOver(''); }}
              onDrop={event => drop(event, key)}
            >
              <h2>{label} <span>{board.columns[key].length}</span></h2>
              {key === 'idea' && board.stale.length ? (
                <p className="notebook-board__stale">
                  {board.stale.length === 1 ? 'One idea has' : `${board.stale.length} ideas have`} gone a month or more without a word.
                  {' '}<button type="button" onClick={archiveStale}>Set {board.stale.length === 1 ? 'it' : 'them'} aside</button>
                </p>
              ) : null}
              {board.columns[key].length ? (
                <ul>
                  {board.columns[key].map(card => <BoardCard key={card.id} card={card} now={now} onOpen={onOpen} onMove={moveOne} />)}
                </ul>
              ) : loading ? null : notes.length ? <p className="notebook-board__quiet">{empty}</p>
                : key === 'idea' ? <p className="notebook-board__quiet">Nothing written yet. A new note starts here.</p> : null}
            </section>
          ))}
        </div>
      )}
    </section>
  );
};

export default NotebookBoard;
