import React from 'react';

const SelectionMenu = React.forwardRef(({
  rect,
  onHighlight,
  onAddNote,
  onAddQuestion,
  onAddTag
}, ref) => {
  if (!rect) return null;

  const style = {
    top: Math.max(8, rect.top - 8),
    left: rect.left + rect.width / 2
  };

  return (
    <div ref={ref} className="selection-menu" style={style} role="menu">
      <button type="button" className="selection-menu-button" onClick={onHighlight}>
        Highlight
      </button>
      <span className="selection-menu-divider" />
      <button type="button" className="selection-menu-button is-muted" onClick={onAddNote}>
        Add to Notebook
      </button>
      <button type="button" className="selection-menu-button is-muted" onClick={onAddQuestion}>
        Add to Question
      </button>
      <button type="button" className="selection-menu-button is-muted" onClick={onAddTag}>
        Add Tag
      </button>
    </div>
  );
});

export default SelectionMenu;
