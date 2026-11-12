import React from 'react';
import ThinkMark from './ThinkMark';

/* The left bar: where to go, each way of looking with its count, then the
   pieces being written so you can switch between them. Search replaces the
   ways of looking while it is open. */
const ThinkBar = ({
  view, views, working, isOpen, onView, onOpen, onNew, creating,
  searching, query, onQuery, onSearch, found, children
}) => (
  <nav className="think-bar" aria-label="Think">
    <div className="think-bar__group">
      <button type="button" className="think-bar__row" aria-current={view === 'home' ? 'page' : undefined} onClick={() => onView('home')}>
        <ThinkMark mark="home" /><span>Home</span>
      </button>
      {searching ? (
        <label className="think-bar__row think-bar__search">
          <ThinkMark mark="search" />
          <input
            autoFocus
            type="search"
            aria-label="Find your writing"
            placeholder="A phrase you remember"
            maxLength={160}
            value={query}
            onChange={event => onQuery(event.target.value)}
            onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onSearch(false); } }}
          />
        </label>
      ) : (
        <button type="button" className="think-bar__row" onClick={() => onSearch(true)}>
          <ThinkMark mark="search" /><span>Search</span>
        </button>
      )}
      <button type="button" className="think-bar__row" onClick={onNew} disabled={creating}>
        <ThinkMark mark="new" /><span>New idea</span>
      </button>
    </div>

    {searching ? found : <>
      <ul className="think-bar__group">
        {views.map(({ key, label, mark, count }) => (
          <li key={key}>
            <button type="button" className="think-bar__row" aria-current={view === key ? 'page' : undefined} onClick={() => onView(key)}>
              <ThinkMark mark={mark} /><span>{label}</span>{count == null ? null : <small>{count}</small>}
            </button>
          </li>
        ))}
      </ul>

      {working.length ? (
        <section className="think-bar__pieces" aria-labelledby="think-bar-working">
          <h2 id="think-bar-working">Working</h2>
          <ul>
            {working.map(item => (
              <li key={item.id}>
                <button type="button" aria-current={isOpen(item) ? 'page' : undefined} title={item.title} onClick={() => onOpen(item)}>{item.title}</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {children}
    </>}
  </nav>
);

export default ThinkBar;
