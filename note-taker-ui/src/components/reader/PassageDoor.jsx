import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listWikiPages, updateWikiPage } from '../../api/wiki';
import { fileEvidenceIntoJudgment } from '../../pages/judgmentModel';
import { handOffSentence } from '../../motion/columnMotion';
import { rememberOpenedJudgment } from './folioModel';
import {
  passageFileCandidate,
  pickPassageDoor,
  pickUnfiledPassageMatch
} from './passageDoor';

const pageId = (value) => String(value?._id || value?.id || '').trim();

const PassageDoor = ({
  highlightId,
  articleId = '',
  preferredId = '',
  text = '',
  sourceLabel = ''
}) => {
  const [pages, setPages] = useState([]);
  const [busy, setBusy] = useState(false);
  const filingRef = useRef(false);

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
  const offer = useMemo(
    () => (door ? null : pickUnfiledPassageMatch(pages, {
      highlightId,
      articleId,
      text,
      preferredId
    })),
    [door, pages, highlightId, articleId, text, preferredId]
  );

  const file = useCallback(async (field) => {
    if (filingRef.current || !offer) return;
    const candidate = passageFileCandidate({
      articleId,
      highlightId,
      text,
      sourceLabel
    });
    const page = pages.find((item) => pageId(item) === offer.id);
    if (!candidate || !page) return;

    const previous = pages;
    const judgment = fileEvidenceIntoJudgment(page, candidate, field);
    filingRef.current = true;
    setBusy(true);
    setPages((current) => current.map((item) => (
      pageId(item) === offer.id ? { ...item, judgment } : item
    )));
    try {
      const saved = await updateWikiPage(offer.id, { judgment });
      if (saved?.judgment) {
        setPages((current) => current.map((item) => (
          pageId(item) === offer.id
            ? { ...item, ...saved, judgment: { ...judgment, ...saved.judgment } }
            : item
        )));
      }
    } catch (_error) {
      setPages(previous);
    } finally {
      filingRef.current = false;
      setBusy(false);
    }
  }, [articleId, highlightId, offer, pages, sourceLabel, text]);

  if (door) {
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
  }

  if (!offer) return null;

  return (
    <div
      className="passage-door passage-door--offer"
      data-testid="passage-door-offer"
      role="group"
      aria-label={`File this passage on ${offer.text}`}
    >
      <span className="passage-door__actions">
        <button type="button" disabled={busy} onClick={() => file('why')}>Why</button>
        <button type="button" disabled={busy} onClick={() => file('against')}>Against</button>
      </span>
      <span className="passage-door__hold">{offer.text}</span>
    </div>
  );
};

export default PassageDoor;
