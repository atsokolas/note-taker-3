import React from 'react';

// Every view drags the same saved task; a weekly priority only stores its ID.
export const TASK_DRAG = 'application/x-noeis-week-task';
export const acceptsTask = event => Array.from(event.dataTransfer?.types || []).includes(TASK_DRAG);
export const taskDragProps = (item, disabled = false) => ({
  draggable: Boolean(item._id) && !disabled,
  onDragStart: event => {
    if (!item._id || disabled) return;
    event.dataTransfer.setData(TASK_DRAG, item._id);
    event.dataTransfer.setData('text/plain', item.title);
    event.dataTransfer.effectAllowed = 'move';
  }
});

export function WorkTaskGrip({ item, ...drag }) {
  return <span className="work-task-grip" title={`Drag ${item.title} to a priority`} {...taskDragProps(item)} {...drag} aria-hidden="true">⠿</span>;
}
