import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getEdition, saveEditionItem, saveEditionItemLater, setEditionItemState } from '../api/editions';
import EditionShare from '../components/editions/EditionShare';
import { gapLine, issueLine, standLayout, takenLine, windowLine } from './editionModel';

/**
 * Reading a paper your agent wrote.
 *
 * Every other surface here runs library → wiki: a page cites what you already
 * own. This one runs the other way. It cites what an agent found and you have
 * not taken, which is why each item has a door into your library — and why
 * that door is the whole feature. Without it this is a newsletter.
 *
 * Each item states its finding and its boundary, because the shape refuses
 * items that will not. A named column nobody filled is printed empty rather
 * than dropped. No columns configured is silence, not an invented layout.
 */

const EditionItem = ({ item, onSave, onLater, saving, laterSaving, unread = null, laterNote = null }) => (
  <article className="edition-item" id={`edition-item-${item.itemId}`}>
    <h3 className="edition-item__title">
      <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
    </h3>
    {item.sourceLabel || item.sourceDate ? (
      <p className="edition-item__source">{[item.sourceLabel, item.sourceDate].filter(Boolean).join(' · ')}</p>
    ) : null}

    <p className="edition-item__finding">{item.finding}</p>
    <p className="edition-item__boundary">
      <span className="edition-item__label">What would limit it</span>
      {item.boundary}
    </p>
    {item.note ? <p className="edition-item__note">{item.note}</p> : null}

    <div className="edition-item__doors">
      {item.savedArticleId ? (
        <>
          <Link className="edition-item__saved" to={`/articles/${item.savedArticleId}`}>
            In your library →
          </Link>
          {unread ? (
            <span className="edition-item__unread">
              Saved, but the text would not come — open the original.
            </span>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          className="edition-item__save"
          onClick={() => onSave(item.itemId)}
          disabled={saving}
          data-testid={`edition-save-${item.itemId}`}
        >
          {saving ? 'Saving…' : 'Save to library'}
        </button>
      )}
      {item.readerStatus === 'later' || laterNote?.itemId === item.itemId ? (
        <Link className="edition-item__saved" to="/library?scope=later">
          {laterNote?.fromSetAside ? 'Moved to Later · Open Later' : 'Saved for later · Open Later'}
        </Link>
      ) : (
        <button
          type="button"
          className="edition-item__save"
          onClick={() => onLater(item.itemId)}
          disabled={laterSaving}
          data-testid={`edition-later-${item.itemId}`}
        >
          {laterSaving ? 'Saving…' : 'Save for later'}
        </button>
      )}
    </div>
  </article>
);

const EditionRead = () => {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const focusItem = params.get('item') || '';
  const [edition, setEdition] = useState(null);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [laterId, setLaterId] = useState('');
  const [unread, setUnread] = useState(null);
  const [laterNote, setLaterNote] = useState(null);
  const acknowledged = useRef('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    setEdition(null);
    getEdition(id)
      .then((found) => { if (!cancelled) setEdition(found); })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError?.response?.data?.error || 'That edition did not open.');
      });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!edition || !focusItem || acknowledged.current === `${id}:${focusItem}`) return;
    if (!(edition.items || []).some(item => item.itemId === focusItem)) return;
    acknowledged.current = `${id}:${focusItem}`;
    Promise.resolve(setEditionItemState(id, focusItem, 'opened')).catch(() => {
      acknowledged.current = '';
    });
    window.requestAnimationFrame(() => {
      document.getElementById(`edition-item-${focusItem}`)?.scrollIntoView?.({ block: 'start' });
    });
  }, [edition, focusItem, id]);

  const save = useCallback(async (itemId) => {
    setSavingId(itemId);
    setError('');
    try {
      const result = await saveEditionItem(id, itemId);
      if (result?.edition) setEdition(result.edition);
      /* Saved and saved-but-empty are different things to a reader about to
         go looking for the text. The row is filed either way — a paywall is
         still a source worth keeping — so this is a note, not an error. */
      setUnread(result && result.readable === false
        ? { itemId, reason: result.readError || '' }
        : null);
    } catch (saveError) {
      setError(saveError?.response?.data?.error || 'That source did not save.');
    } finally {
      setSavingId('');
    }
  }, [id]);

  const later = useCallback(async (itemId) => {
    setLaterId(itemId);
    setError('');
    try {
      const result = await saveEditionItemLater(id, itemId);
      if (result?.edition) setEdition(result.edition);
      if (result?.placed === false) {
        setError(result.error || 'Saved to Library; could not move to Later — Retry');
        return;
      }
      setLaterNote({ itemId, fromSetAside: Boolean(result?.fromSetAside) });
    } catch (laterError) {
      setError(laterError?.response?.data?.error || 'That source did not save for later.');
    } finally {
      setLaterId('');
    }
  }, [id]);

  if (error && !edition) {
    return (
      <div className="edition">
        <p className="status-message error-message">{error}</p>
        <Link to="/editions">← Editions</Link>
      </div>
    );
  }

  if (!edition) return <p className="editions__quiet" role="status">Opening…</p>;

  const gap = gapLine(edition);
  const issue = issueLine(edition);
  const { columns, looseItems } = standLayout(edition);
  const renderItem = (item) => (
    <EditionItem
      key={item.itemId}
      item={item}
      onSave={save}
      onLater={later}
      saving={savingId === item.itemId}
      laterSaving={laterId === item.itemId}
      unread={unread?.itemId === item.itemId ? unread : null}
      laterNote={laterNote}
    />
  );

  return (
    <div className="edition" data-testid="edition-read">
      <Link className="edition__back" to="/editions">← Editions</Link>

      <header className="edition__masthead">
        <h1 className="edition__title">{edition.title}</h1>
        <p className="edition__meta">{[windowLine(edition), issue].filter(Boolean).join(' · ')}</p>
        {/* A paper written by an agent says so, so the reader knows which of
            their agents to argue with. */}
        {edition.writtenBy ? <p className="edition__byline">Written by {edition.writtenBy}</p> : null}
        <p className="edition__taken">{takenLine(edition)}</p>
        <EditionShare editionId={id} edition={edition} />
      </header>

      {error ? <p className="status-message error-message">{error}</p> : null}

      {edition.standfirst ? <p className="edition__standfirst">{edition.standfirst}</p> : null}

      {columns.length ? columns.map((section) => (
        <section key={section.key || section.label} className="edition__section">
          <h2 className="edition__section-title">{section.label}</h2>
          {section.items.length ? (
            section.items.map(renderItem)
          ) : (
            /* Printed, not dropped. A named column nobody filled is saying
               something; hiding it is what a newsletter does. */
            <p className="edition__section-empty">Nothing this week.</p>
          )}
        </section>
      )) : looseItems.length ? (
        <section className="edition__section edition__section--loose">
          {looseItems.map(renderItem)}
        </section>
      ) : (
        <p className="editions__quiet" data-testid="edition-columns-silence">No columns set.</p>
      )}

      {edition.throughLine ? (
        <section className="edition__section">
          <h2 className="edition__section-title">Across the week</h2>
          <p>{edition.throughLine}</p>
        </section>
      ) : null}

      {edition.watchNext?.length ? (
        <section className="edition__section">
          <h2 className="edition__section-title">What to watch next</h2>
          <ul className="edition__watch">
            {edition.watchNext.map(line => <li key={line}>{line}</li>)}
          </ul>
        </section>
      ) : null}

      {gap ? <p className="edition__gap">{gap}</p> : null}
    </div>
  );
};

export default EditionRead;
