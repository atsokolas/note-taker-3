import { useEffect, useMemo, useState } from 'react';
import { listWikiPages } from '../../api/wiki';
import { heldHighlightIds, sourceWhereabouts } from './sourceWhereabouts';

/* Where a source went in your wiki: the pages it is read against, the lines
   saying which pages cite it or hold a view on it, and the passages a view
   already holds, so their doors are not said twice. A wiki that cannot be
   read just now is silence, never an error on the page. */
export default function useSourceWhereabouts(articleId, highlights = [], noun = 'piece') {
  const [pages, setPages] = useState([]);
  useEffect(() => {
    const replace = next => setPages(current => (current.length || next.length ? next : current));
    replace([]);
    if (!articleId) return undefined;
    let cancelled = false;
    listWikiPages({ limit: 500, summary: 1 })
      .then(next => { if (!cancelled) replace(Array.isArray(next) ? next : []); })
      .catch(() => { if (!cancelled) replace([]); });
    return () => { cancelled = true; };
  }, [articleId]);
  const whereabouts = useMemo(() => sourceWhereabouts(pages, { articleId, highlights, noun }), [articleId, pages, highlights, noun]);
  const held = useMemo(() => heldHighlightIds(whereabouts), [whereabouts]);
  return { pages, whereabouts, held };
}
