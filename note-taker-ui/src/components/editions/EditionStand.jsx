import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getEdition } from '../../api/editions';
import { hasNew, latestOf } from '../../pages/editionModel';
import EditionFrontPage from './EditionFrontPage';
import EditionNewsstand from './EditionNewsstand';
import { readEditionLocal, writeEditionLocal } from './editionReadingState';

const VIEWS = { front: 'Front page', stand: 'Newsstand' };

/* The answer to "anything for me?", in one line, by name and never by
   number. Unknown says nothing. */
const newsLine = (papers) => {
  const said = papers.filter(paper => hasNew(paper.issues) !== null);
  if (!said.length) return '';
  const fresh = said.filter(paper => hasNew(paper.issues)).map(paper => paper.title);
  return fresh.length ? `Something new in ${new Intl.ListFormat('en').format(fresh)}` : 'Every paper read';
};

/* Each paper's newest issue, opened, since both views print what is inside.
   The stand asks for them opened (see useStand), so an issue is fetched on
   its own only when it came without its findings. Every refresh of the stand
   brings them again, so a finding filed while you read appears; an issue that
   failed to open is tried again, and the last good copy stays up meanwhile. */
const useNewest = (papers) => {
  const [fetched, setFetched] = useState({});
  useEffect(() => {
    const closed = papers.map(latestOf).filter(issue => !issue.items);
    if (!closed.length) return undefined;
    let active = true;
    Promise.all(closed.map(issue => getEdition(issue._id).catch(() => null)))
      .then(rows => {
        if (active) setFetched(held => ({ ...held, ...Object.fromEntries(rows.filter(Boolean).map(row => [row._id, row])) }));
      });
    return () => { active = false; };
  }, [papers]);
  return useMemo(() => ({
    ...fetched,
    ...Object.fromEntries(papers.map(latestOf).filter(issue => issue.items).map(issue => [issue._id, issue]))
  }), [papers, fetched]);
};

/**
 * Every paper you keep, read the way you choose: one front page set from all
 * of them, or a newsstand with each paper as a cover. The choice is yours and
 * is remembered on this device.
 */
export default function EditionStand({ papers, resume = null }) {
  const [chosen, setView] = useState(() => readEditionLocal('stand', 'view') || 'front');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  /* A magazine opened by link opens on the newsstand, whichever view is set. */
  const view = params.get('open') ? 'stand' : chosen;
  const opened = useNewest(papers);
  const choose = (next) => {
    setView(next);
    writeEditionLocal('stand', 'view', next);
    if (params.get('open')) navigate('/editions');
  };
  const place = resume?.issueId && papers.some(paper => paper.issues.some(issue => issue._id === resume.issueId))
    ? `/editions/${encodeURIComponent(resume.issueId)}${resume.itemId ? `?item=${encodeURIComponent(resume.itemId)}` : ''}`
    : '';
  const news = newsLine(papers);
  return (
    <div className={`edition-stand edition-stand--${view}`}>
      <div className="edition-stand__bar">
        <div className="edition-stand__views" role="group" aria-label="Read your papers as">
          {Object.entries(VIEWS).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={view === key} onClick={() => choose(key)}>{label}</button>
          ))}
        </div>
        {place ? (
          <Link className="edition-stand__resume" to={place}>
            Back to where you stopped{resume.title ? <i>{resume.title}</i> : null}
          </Link>
        ) : null}
      </div>
      {view === 'stand'
        ? <EditionNewsstand papers={papers} opened={opened} />
        : <EditionFrontPage papers={papers} opened={opened} news={news} />}
    </div>
  );
}
