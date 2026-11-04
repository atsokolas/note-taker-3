import React from 'react';
import { displayDay, validDay, writtenDay } from './workPlannerModel';

export default function WorkNoteDate({ note }) {
  // A legacy meeting date is not evidence of when the note was written.
  const day = writtenDay({ ...note, occurredOn: null });
  if (!validDay(day)) return null;
  const label = displayDay(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return <p className="work-note-date"><time dateTime={day} aria-label={`Written on ${label}`}>{label}</time></p>;
}
