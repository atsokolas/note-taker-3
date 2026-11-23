import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdded, inkAdded, strikeAdded } from '../../api/retrieval';
import { clip, markedWhen } from '../margins/LibraryMargins';
import { buildPassagePath } from '../../utils/sourceRoutes';
import './what-it-added.css';

/* What a source added to what you already hold, as Noeis connected it: the
   passages it echoes or argues with, the questions it answers, the wiki
   pages it belongs on. Each is in pencil until you ink it (a connection of yours, from then
   on; a page also gets a cited line to accept) or strike it (never offered
   again). With focus on a line, i inks and
   x strikes. Nothing connected is nothing shown. */
const LEADS = { echo: 'Echoes', argues: 'Argues with', answers: 'Answers', belongs: 'Belongs on' };

const hrefOf = ({ type, id, articleId }) => ({
  highlight: buildPassagePath({ articleId, highlightId: id }),
  question: `/think?tab=questions&questionId=${id}`,
  wiki_page: `/wiki/workspace?page=${id}`
}[type]);

const Held = ({ kind, to }) => {
  const where = <Link to={hrefOf(to)}>{to.type === 'highlight' ? <cite>{to.title}</cite> : to.title}</Link>;
  if (to.type === 'question') return <>your question {where}</>;
  if (to.type === 'wiki_page') return kind === 'argues' ? <>“{clip(to.quote)}” on {where}</> : <>{where}{to.quote ? <>, beside “{clip(to.quote)}”</> : null}</>;
  const when = markedWhen(to.at);
  return kind === 'answers'
    ? <>“{clip(to.quote)}”, which you asked beside {where}</>
    : <>“{clip(to.quote)}”, which you marked in {where}{when ? `, ${when}` : ''}</>;
};

// An argument says what this source holds instead.
const Says = ({ says, ...connection }) => <><Held {...connection} />{connection.kind === 'argues' && says ? <>: here, “{clip(says.replace(/[.!?]+$/, ""))}”</> : null}</>;

const WhatItAdded = ({ articleId, contentKey = '', hidden = false }) => {
  const [added, setAdded] = useState([]);

  useEffect(() => {
    let live = true;
    setAdded([]);
    if (articleId) fetchAdded(articleId).then(found => { if (live) setAdded(found); }).catch(() => {});
    return () => { live = false; };
  }, [articleId, contentKey]);

  const ink = async ({ key, kind }) => {
    const { inked } = await inkAdded({ articleId, key, kind });
    setAdded(all => all.map(connection => (connection.key === key ? { ...connection, inked } : connection)));
  };
  const strike = async ({ key, to }) => {
    await strikeAdded({ articleId, key, title: to.title, quote: to.quote });
    setAdded(all => all.filter(connection => connection.key !== key));
  };
  const press = connection => (event) => {
    if (connection.inked || event.target !== event.currentTarget) return;
    const act = { i: ink, x: strike }[event.key];
    if (act) act(connection).catch(() => {});
  };

  if (hidden || !added.length) return null;
  return (
    <section className="what-it-added" aria-label="What it added">
      <h2>What it added</h2>
      <ul>
        {added.map(connection => (
          <li key={connection.key} tabIndex={connection.inked ? undefined : 0} onKeyDown={press(connection)} className={connection.inked ? 'is-inked' : 'is-pencil'}>
            <span className="what-it-added__lead">{LEADS[connection.kind]}</span>{' '}
            <Says {...connection} />.
            {connection.inked ? null : (
              <span className="what-it-added__verdict">
                <button type="button" onClick={() => ink(connection).catch(() => {})}>Ink</button>
                <button type="button" onClick={() => strike(connection).catch(() => {})}>Strike</button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default WhatItAdded;
