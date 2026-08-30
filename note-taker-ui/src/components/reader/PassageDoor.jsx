import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listWikiPages } from '../../api/wiki';
import { handOffSentence } from '../../motion/columnMotion';
import { rememberOpenedJudgment } from './folioModel';
import { pickPassageDoor } from './passageDoor';

const PassageDoor = ({ highlightId, articleId = '', preferredId = '' }) => {
  const [pages, setPages] = useState([]);

  useEffect(() => {
    const id = String(highlightId || '').trim();
    if (!id) {
      setPages([]);
      return undefined;
    }
    let cancelled = false;
    listWikiPages({ limit: 500, summary: 1 })
      .then((next) => {
        if (!cancelled) setPages(Array.isArray(next) ? next : []);
      })
      .catch(() => {
        if (!cancelled) setPages([]);
      });
    return () => { cancelled = true; };
  }, [highlightId]);

  const door = useMemo(
    () => pickPassageDoor(pages, { highlightId, articleId, preferredId }),
    [pages, highlightId, articleId, preferredId]
  );

  if (!door) return null;

  return (
    <Link
      to={door.href}
      className="passage-door"
      data-testid="passage-door"
      aria-label={`${door.stance} for ${door.text}`}
      onClick={(event) => {
        rememberOpenedJudgment(door.id);
        handOffSentence(door.text, event.currentTarget);
      }}
    >
      <span className="passage-door__stance">{door.stance}</span>
      <span className="passage-door__hold">{door.text}</span>
    </Link>
  );
};

export default PassageDoor;
