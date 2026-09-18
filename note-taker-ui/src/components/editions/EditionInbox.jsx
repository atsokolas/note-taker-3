import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { byInboxEdition, inboxEditionLine } from '../../pages/editionModel';
import useEditionArrivals, { rowKey } from './useEditionArrivals';

/**
 * What arrived, before the papers themselves.
 *
 * Compact rows, nested under the issue that filed them. The finding and its
 * boundary live in the issue; this only asks what to do with the arrival.
 */

const LATER = '/library?scope=later';
const filedLine = (row) => {
  if (!row.filedAt) return '';
  const date = new Date(row.filedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const metaLine = (row) => [
  row.sourceLabel,
  row.sourceDate || filedLine(row)
].filter(Boolean).join(' · ');

const Head = () => (
  <header className="edition-inbox__head">
    <h2>New</h2>
    <Link to={LATER}>Later</Link>
  </header>
);

const Item = ({ row, busy, onLater, onDismiss }) => {
  const key = rowKey(row);
  const meta = metaLine(row);
  return (
    <li className="edition-inbox__row">
      <p className="edition-inbox__title">{row.title}</p>
      {meta ? <p className="edition-inbox__meta">{meta}</p> : null}
      <p className="edition-inbox__actions">
        <Link to={`/editions/${row.editionId}?item=${encodeURIComponent(row.itemId)}`}>
          Read now
        </Link>
        <button type="button" onClick={() => onLater(row)} disabled={Boolean(busy)}>
          {busy === `${key}:later` ? 'Saving…' : 'Save for later'}
        </button>
        <button
          type="button"
          className="edition-inbox__dismiss"
          onClick={() => onDismiss(row)}
          disabled={Boolean(busy)}
        >
          Dismiss
        </button>
      </p>
    </li>
  );
};

const InboxEdition = ({ group, busy, onLater, onDismiss }) => {
  const [open, setOpen] = useState(true);
  const label = inboxEditionLine(group);
  const nestId = `inbox-edition-${group.editionId || 'elsewhere'}`;
  const count = group.items.length;

  return (
    <li className={`edition-inbox__edition${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="edition-inbox__edition-head"
        aria-expanded={open}
        aria-controls={nestId}
        onClick={() => setOpen(value => !value)}
      >
        <span className="edition-inbox__edition-name">{label}</span>
        <span className="edition-inbox__edition-meta">
          <span>{`${count} new`}</span>
          <span className="edition-inbox__fold" aria-hidden="true">{open ? 'fold' : 'unfold'}</span>
        </span>
      </button>
      <div
        className="edition-inbox__nest"
        id={nestId}
        role="region"
        aria-label={label}
        inert={!open}
        aria-hidden={!open}
      >
        <div>
          <ul className="edition-inbox__items">
            {group.items.map((row) => (
              <Item
                key={rowKey(row)}
                row={row}
                busy={busy}
                onLater={onLater}
                onDismiss={onDismiss}
              />
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
};

const EditionInbox = () => {
  const {
    items, error, pending, busy, receipt, undo, more,
    load, loadMore, showPending, dismiss, later, undoChoice
  } = useEditionArrivals();

  const groups = useMemo(() => byInboxEdition(items || []), [items]);

  return (
    <section className="edition-inbox" aria-label="New">
      <Head />

      {error ? (
        <p className="edition-inbox__status">
          {error}
          <button type="button" onClick={() => load({ replace: true })}>Retry</button>
        </p>
      ) : null}

      {pending ? (
        <p className="edition-inbox__status">
          <button type="button" onClick={showPending}>
            {`Show ${pending} new item${pending === 1 ? '' : 's'}`}
          </button>
        </p>
      ) : null}

      {receipt ? (
        <p className="edition-inbox__status">
          {receipt.fromSetAside ? 'Moved to Later' : 'Saved for later'}
          {' · '}
          <Link to={LATER}>Open Later</Link>
        </p>
      ) : null}

      {undo ? (
        <p className="edition-inbox__status">
          Dismissed.
          <button type="button" onClick={undoChoice} disabled={Boolean(busy)}>Undo</button>
        </p>
      ) : null}

      {error || items === null ? null : items.length === 0 ? (
        <p className="edition-inbox__empty">No new items</p>
      ) : (
        <ul className="edition-inbox__list">
          {groups.map((group) => (
            <InboxEdition
              key={group.editionId || group.title}
              group={group}
              busy={busy}
              onLater={later}
              onDismiss={dismiss}
            />
          ))}
        </ul>
      )}

      {more && !pending ? (
        <p className="edition-inbox__status">
          <button type="button" onClick={loadMore}>
            {`Show ${more} new items`}
          </button>
        </p>
      ) : null}
    </section>
  );
};

export default EditionInbox;
