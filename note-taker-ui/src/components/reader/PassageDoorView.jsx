import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listWikiPages } from '../../api/wiki';
import { fileJudgmentEvidence } from '../../api/judgmentResolution';
import AriadneThread from '../judgment/AriadneThread';
import { handOffSentence } from '../../motion/columnMotion';
import { rememberOpenedJudgment } from './folioModel';
import {
  pickPassageDoor,
  pickUnfiledPassageMatch
} from './passageDoorModel';

const pageId = (value) => String(value?._id || value?.id || '').trim();

const PassageDoor = ({
  highlightId,
  articleId = '',
  preferredId = '',
  pages: suppliedPages = null,
  text = '',
}) => {
  const [pages, setPages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [threadTrace, setThreadTrace] = useState('');
  const filingRef = useRef(false);
  const stanceRef = useRef(null);
  const holdRef = useRef(null);

  useEffect(() => {
    const id = String(highlightId || '').trim();
    if (!id) {
      setPages([]);
      return undefined;
    }
    if (Array.isArray(suppliedPages)) {
      setPages(suppliedPages);
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
  }, [highlightId, suppliedPages]);

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
    const page = pages.find((item) => pageId(item) === offer.id);
    if (!page) return;

    filingRef.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await fileJudgmentEvidence({
        pageId: offer.id,
        expectedClaim: offer.text,
        field,
        articleId,
        highlightId
      });
      if (saved?.judgment) {
        setPages((current) => current.map((item) => (
          pageId(item) === offer.id
            ? { ...item, judgment: saved.judgment }
            : item
        )));
      }
      setThreadTrace(String(saved?.receipt?.id || saved?.artifact?.receiptId || Date.now()));
    } catch (_error) {
      setError('That thread did not land. Try once more.');
    } finally {
      filingRef.current = false;
      setBusy(false);
    }
  }, [articleId, highlightId, offer, pages]);

  if (door) {
    return (
      <>
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
          <span ref={stanceRef} className="passage-door__stance">{door.stance}</span>
          <span ref={holdRef} className="passage-door__hold">{door.text}</span>
        </Link>
        <AriadneThread traceId={threadTrace} sourceRef={stanceRef} targetRef={holdRef} />
      </>
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
      {error ? <span className="passage-door__error" role="status">{error}</span> : null}
    </div>
  );
};

export default PassageDoor;
