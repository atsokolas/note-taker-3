import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { settleIntoWiki as postSettle } from '../../api/wiki';
import { useSystemStatusControls } from '../../system/SystemStatusContext';
import { wikiReadPath } from '../../utils/wikiFeatureFlags';
import '../../styles/settle.css';

const NOUN = { notebook: 'note', concepts: 'concept', books: 'book' };

const passages = (count) => (
  count === 0 ? 'No quoted passages to cite.'
    : `${count === 1 ? 'Its quoted passage is' : `Its ${count} quoted passages are`} cited and open where they came from.`
);

/* Settle a note, a concept or a book into Wiki and say exactly what happened: which
   page, whether it is new or a new revision, and what its quotes became. A
   refusal comes back as the one line the page shows, with what to fix. */
export const settleIntoWiki = async (kind, id, systemStatus) => {
  try {
    const { page, resettled } = await postSettle(kind, id);
    const settledIn = { _id: String(page._id), title: page.title };
    systemStatus.setLatestReceipt({
      id: `settle-${settledIn._id}-${Date.now()}`,
      title: `“${page.title}” ${resettled ? 'revised' : 'settled'} in Wiki`,
      summary: resettled
        ? `A new revision; the earlier words stay in the page history. ${passages(page.sourceRefs?.length || 0)}`
        : passages(page.sourceRefs?.length || 0),
      status: 'completed',
      href: wikiReadPath(settledIn._id)
    });
    return { settledIn, resettled };
  } catch (error) {
    return { refusal: error?.response?.data?.error || `The ${NOUN[kind]} did not settle. Try again.` };
  }
};

/* The page a note or concept keeps a quiet link to. Saving first, so what
   settles is what is on screen. A later save never clears the link: only
   opening something else does. */
export const useSettleIntoWiki = (kind, id, settledFrom) => {
  const systemStatus = useSystemStatusControls();
  const [settledIn, setSettledIn] = useState(settledFrom || null);
  const [line, setLine] = useState('');
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    setSettledIn(settledFrom || null);
    setLine('');
  }, [id, settledFrom?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const settle = async (save) => {
    setLine('');
    if (!(await save())) {
      setLine(`This ${NOUN[kind]} did not save, so it did not settle. Try again.`);
      return;
    }
    setSettling(true);
    const settled = await settleIntoWiki(kind, id, systemStatus);
    setSettling(false);
    if (settled.settledIn) setSettledIn(settled.settledIn);
    else setLine(settled.refusal);
  };

  return {
    settle,
    settling,
    settled: Boolean(settledIn),
    action: settledIn ? 'Settle again' : 'Settle into Wiki',
    lines: (
      <>
        {settledIn ? (
          <p className="think-notebook-settled">Settled in Wiki → <Link to={wikiReadPath(settledIn._id)}>{settledIn.title}</Link>. Share it from there.</p>
        ) : null}
        {settling || line ? (
          <p className="think-notebook-settle-line" role="status">{settling ? 'Settling into Wiki…' : line}</p>
        ) : null}
      </>
    )
  };
};
