import React from 'react';

const SlashCommandMenu = ({
  open = false,
  items = [],
  activeIndex = 0,
  position = { top: 0, left: 0 },
  query = '',
  onSelect = () => {}
}) => {
  if (!open) return null;

  return (
    <div
      className="think-slash-menu"
      role="menu"
      aria-label="Quick commands"
      style={{ top: position.top, left: position.left }}
    >
      {items.length === 0 ? (
        <div className="think-slash-menu__empty">
          <span className="think-slash-menu__empty-title">No commands found</span>
          <span className="think-slash-menu__empty-copy">Try a different keyword for "/{query}".</span>
        </div>
      ) : items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={`think-slash-menu__item ${index === activeIndex ? 'is-active' : ''}`.trim()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(item)}
        >
          <span className="think-slash-menu__item-label">{item.label}</span>
          <span className="think-slash-menu__item-description">{item.description}</span>
        </button>
      ))}
    </div>
  );
};

export default SlashCommandMenu;
