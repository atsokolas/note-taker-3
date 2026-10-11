import React from 'react';
import { Link } from 'react-router-dom';
import {
  RoomShelf,
  RoomShelfList,
  RoomShelfMeta,
  roomShelfItemClass
} from './RoomShelf';

/* The shelf names the room's four places in plain words. The index owns the
   one list of views; the shelf only counts it. */
const JudgmentShelf = ({ items = [], activeId = '', setAsideView = false }) => {
  const open = items.filter(item => item.state !== 'parked').length;
  const parked = items.length - open;
  const onIndex = !activeId;
  const place = (to, label, active, count = 0) => (
    <li>
      <Link className={roomShelfItemClass({ active })} aria-current={active ? 'page' : undefined} to={to}>
        <span>{label}</span>
        {count ? <RoomShelfMeta>{count}</RoomShelfMeta> : null}
      </Link>
    </li>
  );

  return (
    <RoomShelf as="nav" className="judgment-shelf" aria-label="Judgment" label="Judgment">
      <RoomShelfList>
        {place('/judgment', 'Views', onIndex && !setAsideView, open)}
        {place('/judgment?view=parked', 'Set aside', onIndex && setAsideView, parked)}
        {place('/judgment/mirror#record', 'Record', false)}
        {place('/judgment/mirror', 'The Mirror', false)}
      </RoomShelfList>
    </RoomShelf>
  );
};

export default JudgmentShelf;
