import React from 'react';
import '../../styles/room-shelf.css';

const join = (...names) => names.filter(Boolean).join(' ');

export const RoomShelf = ({
  as: Element = 'aside',
  label,
  count,
  description,
  search,
  searchLabel,
  searchPlaceholder,
  searchTestId,
  masthead,
  onSearchChange,
  className = '',
  children,
  ...props
}) => (
  <Element className={join('room-shelf', className)} {...props}>
    {/* Above the room's own name: anything that acts on the room rather than
        living in it. */}
    {masthead || null}
    <div className="room-shelf__heading">
      <p className="room-shelf__eyebrow">{label}</p>
      {Number.isFinite(count) ? <span className="room-shelf__count">{count}</span> : null}
    </div>
    {description ? <p className="room-shelf__description">{description}</p> : null}
    {typeof search === 'string' ? (
      <label className="room-shelf__search">
        <span className="sr-only">{searchLabel}</span>
        <input
          type="search"
          value={search}
          aria-label={searchLabel}
          placeholder={searchPlaceholder}
          data-testid={searchTestId}
          onChange={(event) => onSearchChange?.(event.target.value)}
        />
      </label>
    ) : null}
    {children}
  </Element>
);

export const RoomShelfSection = ({ label, className = '', children }) => (
  <section className={join('room-shelf__section', className)} aria-label={label}>
    <h2 className="room-shelf__section-label">{label}</h2>
    {children}
  </section>
);

export const RoomShelfList = ({ className = '', children, ...props }) => (
  <ul className={join('room-shelf__list', className)} {...props}>{children}</ul>
);

export const roomShelfItemClass = ({ active = false, nested = false, className = '' } = {}) => join(
  'room-shelf__item',
  active && 'is-active',
  nested && 'is-nested',
  className
);

export const RoomShelfButton = ({ active = false, nested = false, className = '', children, ...props }) => (
  <button
    type="button"
    className={roomShelfItemClass({ active, nested, className })}
    aria-current={active ? 'true' : undefined}
    {...props}
  >
    {children}
  </button>
);

export const RoomShelfMeta = ({ children, className = '' }) => (
  <span className={`room-shelf__item-meta${className ? ` ${className}` : ''}`.trim()}>{children}</span>
);
