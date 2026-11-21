import React from 'react';
import WorkIcon from './WorkIcon';
import { displayRange, weekDays } from './workPlannerModel';

const views = { today: 'Today', actions: 'Actions', review: 'Review' };
export const plannerViews = [...Object.keys(views), 'week'];

export function WorkNavigation({ view, onScope, unsorted }) {
  return <nav aria-label="Work navigation" className="work-primary-nav">
    {Object.entries(views).map(([key, title]) => <button key={key} aria-current={view === key ? 'page' : undefined} onClick={() => onScope(key)}><span>{title}</span>
      {key === 'actions' && unsorted > 0 ? <small aria-label={`${unsorted} to sort`}>{unsorted}</small> : null}
    </button>)}
  </nav>;
}

export function WorkWeekLink({ day, onOpen }) {
  const week = weekDays(day);
  return <button className="work-week-link" onClick={onOpen}>This week <span>{displayRange(week[0], week.at(-1))}</span><WorkIcon name="next" /></button>;
}
