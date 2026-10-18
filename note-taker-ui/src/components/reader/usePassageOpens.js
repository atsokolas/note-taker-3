import { useEffect, useMemo, useRef, useState } from 'react';
import { markPassageOpened } from '../../api/articleReadingState';

const idOf = (highlight) => String(highlight?._id || highlight?.id || '');
/* A passage marked a moment ago is being written, not returned to. */
const FRESH_MS = 30 * 60 * 1000;

/**
 * Deeper ink. Opening a passage you already hold counts once per visit; the
 * server keeps the count, and this visit's open shows in the ink at once.
 * Returns the highlights to render.
 */
export default function usePassageOpens({ articleId, highlightId, highlights }) {
  const counted = useRef({ articleId, keys: new Set() });
  const [opened, setOpened] = useState(null);
  if (counted.current.articleId !== articleId) counted.current = { articleId, keys: new Set() };

  useEffect(() => {
    const id = String(highlightId || '');
    const highlight = highlights.find((item) => idOf(item) === id);
    if (!articleId || !highlight || id.startsWith('temp-')) return;
    const markedAt = new Date(highlight.createdAt || 0).getTime();
    if (Date.now() - markedAt < FRESH_MS) return;
    const key = `${articleId}:${id}`;
    if (counted.current.keys.has(key)) return;
    counted.current.keys.add(key);
    setOpened({ key, opens: (Number(highlight.opens) || 0) + 1 });
    markPassageOpened(articleId, id).catch(() => {});
  }, [articleId, highlightId, highlights]);

  return useMemo(() => (
    opened
      ? highlights.map((item) => (
        `${articleId}:${idOf(item)}` === opened.key && !(Number(item.opens) >= opened.opens)
          ? { ...item, opens: opened.opens }
          : item
      ))
      : highlights
  ), [articleId, highlights, opened]);
}
