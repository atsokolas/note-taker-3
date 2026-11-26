import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { readUnderneathMonths } from '../../api/home';
import { issueMonth } from '../home/homeModel';

/* On the newsstand beside the papers your agents write: one issue a month
   made from your own marks. A month where nothing came back has none. */
export default function UnderneathIssues() {
  const [months, setMonths] = useState([]);
  useEffect(() => { let live = true; readUnderneathMonths().then(found => live && setMonths(found), () => {}); return () => { live = false; }; }, []);
  if (!months.length) return null;
  const [latest, ...back] = months;
  return (
    <section className="editions__underneath" aria-labelledby="editions-underneath">
      <h2 id="editions-underneath"><Link to={`/editions/underneath/${latest}`}>Underneath, {issueMonth(latest)}</Link></h2>
      <p>An issue made from your own marks: what came back this month, what formed, and the old marks that collided most.</p>
      {back.length ? <p className="editions__underneath-back">Back issues: {back.map((month, at) => <React.Fragment key={month}>{at ? ', ' : ''}<Link to={`/editions/underneath/${month}`}>{issueMonth(month)}</Link></React.Fragment>)}</p> : null}
    </section>
  );
}
