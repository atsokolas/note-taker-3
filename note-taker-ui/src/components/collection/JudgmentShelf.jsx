import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RoomShelf,
  RoomShelfList,
  RoomShelfMeta,
  RoomShelfSection,
  roomShelfItemClass
} from './RoomShelf';

const includes = (value, query) => String(value || '').toLowerCase().includes(query);

const JudgmentShelf = ({ items = [], activeId = '' }) => {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(() => (
    normalizedQuery
      ? items.filter((item) => includes(item.sentence, normalizedQuery))
      : items
  ), [items, normalizedQuery]);
  const counts = useMemo(() => ({
    decisions: items.reduce((sum, item) => sum + Number(item.decisionCount || 0), 0),
    outcomes: items.reduce((sum, item) => sum + Number(item.outcomeCount || 0), 0),
    lessons: items.reduce((sum, item) => sum + (Array.isArray(item.lessons) ? item.lessons.length : 0), 0)
  }), [items]);

  return (
    <RoomShelf
      as="nav"
      className="judgment-shelf"
      aria-label="Judgments"
      label="Judgment"
      count={items.length}
      search={query}
      searchLabel="Search judgments"
      searchPlaceholder="Search Judgment"
      onSearchChange={setQuery}
    >
      <RoomShelfSection label="Open cases">
        {visible.length ? (
          <RoomShelfList>
            {visible.slice(0, 8).map((item) => (
              <li key={item.id}>
                <Link
                  className={roomShelfItemClass({ active: String(item.id) === String(activeId) })}
                  aria-current={String(item.id) === String(activeId) ? 'page' : undefined}
                  to={`/judgment/${encodeURIComponent(item.id)}`}
                >
                  <span>{item.sentence}</span>
                  {item.state === 'arrived' ? <RoomShelfMeta>New</RoomShelfMeta> : null}
                </Link>
              </li>
            ))}
          </RoomShelfList>
        ) : <p className="judgment-shelf__empty">No matching cases.</p>}
      </RoomShelfSection>

      <RoomShelfSection label="Casebook">
        <RoomShelfList>
          <li><Link className={roomShelfItemClass()} to="/judgment"><span>Claims</span><RoomShelfMeta>{items.length}</RoomShelfMeta></Link></li>
          <li><span className={roomShelfItemClass()}><span>Decisions</span><RoomShelfMeta>{counts.decisions}</RoomShelfMeta></span></li>
          <li><span className={roomShelfItemClass()}><span>Outcomes</span><RoomShelfMeta>{counts.outcomes}</RoomShelfMeta></span></li>
          <li><span className={roomShelfItemClass()}><span>Lessons</span><RoomShelfMeta>{counts.lessons}</RoomShelfMeta></span></li>
        </RoomShelfList>
      </RoomShelfSection>
    </RoomShelf>
  );
};

export default JudgmentShelf;
