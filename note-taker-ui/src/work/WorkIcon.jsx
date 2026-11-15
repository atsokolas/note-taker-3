import React from 'react';
import calendar from '../assets/work-icons/calendar.svg';
import file from '../assets/work-icons/file-text.svg';
import inbox from '../assets/work-icons/inbox.svg';
import folder from '../assets/work-icons/folder.svg';
import lock from '../assets/work-icons/lock.svg';
import more from '../assets/work-icons/more-horizontal.svg';
import down from '../assets/work-icons/chevron-down.svg';
import right from '../assets/work-icons/chevron-right.svg';
import plus from '../assets/work-icons/plus.svg';
import check from '../assets/work-icons/check.svg';
import previous from '../assets/work-icons/arrow-left.svg';
import next from '../assets/work-icons/arrow-right.svg';
import sun from '../assets/work-icons/sun.svg';
import layers from '../assets/work-icons/layers.svg';
import clock from '../assets/work-icons/clock.svg';
import archive from '../assets/work-icons/archive.svg';
import search from '../assets/work-icons/search.svg';
import briefcase from '../assets/work-icons/briefcase.svg';
import rotatecw from '../assets/work-icons/rotate-cw.svg';
const assets = { calendar, file, inbox, folder, lock, more, down, right, plus, check, previous, next, sun, layers, clock, archive, search, briefcase, review: rotatecw };
export default function WorkIcon({ name, className = '' }) {
  return <span aria-hidden="true" className={`work-icon ${className}`} style={{ maskImage: `url(${assets[name]})`, WebkitMaskImage: `url(${assets[name]})` }} />;
}
