import React, { useEffect, useRef } from 'react';

const SlashCommandMenu = ({
  open = false,
  items = [],
  activeIndex = 0,
  position = { top: 0, left: 0 },
  query = '',
  onSelect = () => {}
}) => {
  const itemsRef = useRef(null);
  const activeItemRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const node = activeItemRef.current;
    if (!node) return;
    if (typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }, [open, activeIndex, items.length]);

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
      ) : (
        <>
          <div className="think-slash-menu__items" ref={itemsRef} role="presentation">
            {items.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={item.id}
                  ref={isActive ? activeItemRef : undefined}
                  type="button"
                  role="menuitem"
                  aria-current={isActive ? 'true' : undefined}
                  className={`think-slash-menu__item ${isActive ? 'is-active' : ''}`.trim()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelect(item)}
                >
                  <span className="think-slash-menu__item-row">
                    <span className="think-slash-menu__item-label">{item.label}</span>
                    {isActive && (
                      <span className="think-slash-menu__item-enter" aria-hidden="true">↵</span>
                    )}
                  </span>
                  <span className="think-slash-menu__item-description">{item.description}</span>
                </button>
              );
            })}
          </div>
          <div className="think-slash-menu__footer" aria-hidden="true">
            <span className="think-slash-menu__hint">
              <kbd>↑</kbd><kbd>↓</kbd> navigate
            </span>
            <span className="think-slash-menu__hint">
              <kbd>↵</kbd> select
            </span>
            <span className="think-slash-menu__hint">
              <kbd>esc</kbd> close
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default SlashCommandMenu;
