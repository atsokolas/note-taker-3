import { useEffect } from 'react';

/* The rooms keep the reader's hours, read off their own clock and never
   stored: from midnight until five the pages dim to lamplight, and on a
   Sunday morning the Editions front page is set as a broadsheet. From six in
   the evening Work says pencils down. */
export const LAMPLIGHT_UNTIL = 5;
export const PENCILS_DOWN = 18;
const SUNDAY_MORNING_UNTIL = 12;

export const roomHours = (now = new Date()) => {
  const hour = now.getHours();
  return {
    hour: hour < LAMPLIGHT_UNTIL ? 'lamplight' : '',
    day: now.getDay() === 0 && hour >= LAMPLIGHT_UNTIL && hour < SUNDAY_MORNING_UNTIL ? 'sunday-morning' : ''
  };
};

export const useRoomHours = () => useEffect(() => {
  const root = document.documentElement;
  const keep = () => {
    const { hour, day } = roomHours();
    if (hour) root.setAttribute('data-hour', hour); else root.removeAttribute('data-hour');
    if (day) root.setAttribute('data-day', day); else root.removeAttribute('data-day');
  };
  keep();
  const minute = setInterval(keep, 60 * 1000);
  return () => clearInterval(minute);
}, []);
