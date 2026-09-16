import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  RoomShelf,
  RoomShelfList,
  RoomShelfMeta,
  RoomShelfSection,
  roomShelfItemClass
} from './RoomShelf';

/* The shelf names rooms; the casebook itself owns the one case list and its
   search. Keeping rows here as well made a second, smaller collection that
   disagreed with the main one as soon as filters or parking were involved. */
const JudgmentShelf = ({ items = [], activeId = '', collectionView = 'open' }) => {
  const counts = useMemo(() => ({
    open: items.filter(item => item.state !== 'parked').length,
    parked: items.filter(item => item.state === 'parked').length,
    decisions: items.reduce((sum, item) => sum + Number(item.decisionCount || 0), 0)
  }), [items]);
  const inCase = Boolean(activeId);

  return (
    <RoomShelf
      as="nav"
      className="judgment-shelf"
      aria-label="Judgment"
      label="Judgment"
      count={items.length}
    >
      <RoomShelfSection label="The casebook">
        <RoomShelfList>
          <li>
            <Link
              className={roomShelfItemClass({ active: !inCase && collectionView === 'open' })}
              aria-current={!inCase && collectionView === 'open' ? 'page' : undefined}
              to="/judgment"
            >
              <span>Open cases</span>
              {counts.open ? <RoomShelfMeta>{counts.open}</RoomShelfMeta> : null}
            </Link>
          </li>
          <li>
            <Link
              className={roomShelfItemClass({ active: !inCase && collectionView === 'parked' })}
              aria-current={!inCase && collectionView === 'parked' ? 'page' : undefined}
              to="/judgment?view=parked"
            >
              <span>Set aside</span>
              {counts.parked ? <RoomShelfMeta>{counts.parked}</RoomShelfMeta> : null}
            </Link>
          </li>
        </RoomShelfList>
      </RoomShelfSection>
      <RoomShelfSection label="The record">
        <RoomShelfList>
          <li>
            <Link className={roomShelfItemClass()} to="/judgment/mirror#decisions">
              <span>Decisions</span>
              {counts.decisions ? <RoomShelfMeta>{counts.decisions}</RoomShelfMeta> : null}
            </Link>
          </li>
          <li><Link className={roomShelfItemClass()} to="/judgment/mirror"><span>The Mirror</span></Link></li>
        </RoomShelfList>
      </RoomShelfSection>
    </RoomShelf>
  );
};

export default JudgmentShelf;
