import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getEdition } from '../../api/editions';
import { latestOf, newCountOf, plural } from '../../pages/editionModel';
import EditionFrontPage from './EditionFrontPage';
import EditionNewsstand from './EditionNewsstand';
import { readEditionLocal, writeEditionLocal } from './editionReadingState';

const VIEWS = { front: 'Front page', stand: 'Newsstand' };

/* The answer to "anything for me?", in one line. Unknown says nothing. */
const newsLine = (papers) => {
  const counts = papers.map(paper => newCountOf(paper.issues));
  if (counts.every(count => count === null)) return '';
  const total = counts.reduce((sum, count) => sum + (count || 0), 0);
  return total ? `${plural(total, 'new finding')} across ${plural(counts.filter(Boolean).length, 'paper')}` : 'Every paper read';
};

/* Each paper's newest issue, opened, since both views print what is inside. */
const useNewest = (papers) => {
  const ids = papers.map(paper => latestOf(paper)._id).join(',');
  const [opened, setOpened] = useState({});
  useEffect(() => {
    let active = true;
    Promise.all(ids.split(',').filter(Boolean).map(id => getEdition(id).catch(() => null)))
      .then(rows => { if (active) setOpened(Object.fromEntries(rows.filter(Boolean).map(row => [row._id, row]))); });
    return () => { active = false; };
  }, [ids]);
  return opened;
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
