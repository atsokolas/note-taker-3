import React, { useEffect, useRef, useState } from 'react';
import { distinctionRecord } from '../../../utils/distinctionUse';
import './UseDistinctionHere.css';

export default function UseDistinctionHere({
  distinctions = [],
  held = null,
  onUse = () => {},
  disabled = false,
  startOpen = false
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const trigger = useRef(null);
  const list = useRef(null);
  const choices = (Array.isArray(distinctions) ? distinctions : [])
    .map((item) => distinctionRecord(item))
    .filter(Boolean);
  const heldRecord = distinctionRecord(held);
  const options = heldRecord && !choices.some((item) => (
    item.sourceId ? item.sourceId === heldRecord.sourceId : item.versionId === heldRecord.versionId
  ))
    ? [heldRecord, ...choices]
    : (choices.length ? choices : (heldRecord ? [heldRecord] : []));

  useEffect(() => {
    if (startOpen && options.length > 1) setOpen(true);
  }, [options.length, startOpen]);

  if (!options.length) return null;

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const apply = (record) => {
    onUse(record);
    close();
  };

  const useHeldOrOpen = () => {
    if (options.length === 1) {
      apply(options[0]);
      return;
    }
    setActive(0);
    setOpen(true);
  };

  return (
    <div className="use-distinction-here">
      <button
        ref={trigger}
        type="button"
        className="use-distinction-here__trigger"
        disabled={disabled}
        aria-haspopup={options.length > 1 ? 'listbox' : undefined}
        aria-expanded={options.length > 1 ? open : undefined}
        onClick={useHeldOrOpen}
      >
        Use this here
      </button>
      {open ? (
        <DistinctionChoices
          options={options}
          active={active}
          setActive={setActive}
          listRef={list}
          onApply={apply}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

function DistinctionChoices({
  options,
  active,
  setActive,
  listRef,
  onApply,
  onClose
}) {
  useEffect(() => {
    listRef.current?.focus();
  }, [listRef]);

  return (
    <ul
      ref={listRef}
      role="listbox"
      tabIndex={0}
      aria-label="Named distinctions"
      className="use-distinction-here__choices"
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActive((index) => (index + 1) % options.length);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActive((index) => (index - 1 + options.length) % options.length);
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          onApply(options[active]);
        }
      }}
    >
      {options.map((option, index) => (
        <li key={option.sourceId || option.versionId} role="presentation">
          <button
            type="button"
            role="option"
            aria-selected={index === active}
            onClick={() => onApply(option)}
            onMouseEnter={() => setActive(index)}
          >
            {option.name}
          </button>
        </li>
      ))}
    </ul>
  );
}
