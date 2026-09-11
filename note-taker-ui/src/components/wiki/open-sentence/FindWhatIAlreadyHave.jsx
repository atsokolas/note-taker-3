import React, { useRef, useState } from 'react';
import LibraryPassagePicker from './LibraryPassagePicker';

// One Library search/placement control for a saved question or exploration.
export default function FindWhatIAlreadyHave({
  excluded = [],
  onPlace = () => {},
  onUndo = () => {},
  canUndo = false,
  pickerProps = {}
}) {
  const [open, setOpen] = useState(false);
  const findButton = useRef(null);
  const close = () => {
    setOpen(false);
    findButton.current?.focus();
  };

  return (
    <>
      <div className="open-sentence-pocket__actions">
        <button ref={findButton} type="button" onClick={() => setOpen(true)}>
          Find what I already have
        </button>
        {canUndo ? (
          <button type="button" onClick={onUndo}>Undo passage placement</button>
        ) : null}
      </div>
      <LibraryPassagePicker
        {...pickerProps}
        open={open}
        excluded={excluded}
        onDismiss={close}
        onPlace={(source) => {
          onPlace(source);
          close();
        }}
      />
    </>
  );
}
