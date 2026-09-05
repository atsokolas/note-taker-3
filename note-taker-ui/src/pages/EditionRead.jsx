import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getEdition, saveEditionItem } from '../api/editions';
import { bySection, gapLine, issueLine, takenLine, windowLine } from './editionModel';

/**
 * Reading a paper your agent wrote.
 *
 * Every other surface here runs library → wiki: a page cites what you already
 * own. This one runs the other way. It cites what an agent found and you have
 * not taken, which is why each item has a door into your library — and why
 * that door is the whole feature. Without it this is a newsletter.
 *
 * Each item states its finding and its boundary, because the shape refuses
 * items that will not. A section nobody filled is printed as an empty section
 * rather than dropped, which is the one thing a newsletter never does.
 */

const EditionItem = ({ item, onSave, saving, unread = null }) => (
  <article className="edition-item">
    <h3 className="edition-item__title">
      <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
    </h3>
    {item.sourceLabel || item.sourceDate ? (
      <p className="edition-item__source">{[item.sourceLabel, item.sourceDate].filter(Boolean).join(' · ')}</p>
    ) : null}

    <p className="edition-item__finding">{item.finding}</p>
    {/* The required half. An item that could not say this was refused. */}
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
    </div>
  </article>
);

const EditionRead = () => {
  const { id = '' } = useParams();
  const [edition, setEdition] = useState(null);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [unread, setUnread] = useState(null);

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

  /* The crossing. The whole edition comes back so the masthead's count of
     what you have taken is right the moment you take one. */
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
      </header>

      {error ? <p className="status-message error-message">{error}</p> : null}

      {edition.standfirst ? <p className="edition__standfirst">{edition.standfirst}</p> : null}

      {bySection(edition).map((section) => (
        <section key={section.key || section.label} className="edition__section">
          <h2 className="edition__section-title">{section.label}</h2>
          {section.items.length ? (
            section.items.map(item => (
              <EditionItem
                key={item.itemId}
                item={item}
                onSave={save}
                saving={savingId === item.itemId}
                unread={unread?.itemId === item.itemId ? unread : null}
              />
            ))
          ) : (
            /* Printed, not dropped. A week with nothing under counterevidence
               is saying something, and hiding it is what a newsletter does. */
            <p className="edition__section-empty">Nothing this week.</p>
          )}
        </section>
      ))}

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
