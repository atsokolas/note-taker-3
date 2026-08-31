import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getArticleEvergreen, setArticleEvergreen } from '../../../api/articles';
import { resolveNotebookSource } from './notebookSourceModel';

const initialState = { status: 'idle', evergreen: false, evergreenAt: null };

/* The note remembers source identity; the Library remains authoritative for
   whether that source is kept. This hook joins those two facts without copying
   article content or creating another mutation contract. */
const useNotebookSourceEvergreen = (entry) => {
  const source = useMemo(() => resolveNotebookSource(entry), [entry]);
  const articleId = source?.kind === 'library' ? source.articleId : '';
  const request = useRef(0);
  const [state, setState] = useState(initialState);

  useEffect(() => {
    const requestId = ++request.current;
    if (!articleId) {
      setState(initialState);
      return undefined;
    }

    setState(current => ({ ...current, status: 'loading' }));
    getArticleEvergreen(articleId)
      .then((saved) => {
        if (request.current !== requestId) return;
        setState({
          status: 'ready',
          evergreen: Boolean(saved?.evergreen),
          evergreenAt: saved?.evergreenAt || null
        });
      })
      .catch(() => {
        if (request.current !== requestId) return;
        setState({ ...initialState, status: 'unavailable' });
      });

    return () => { request.current += 1; };
  }, [articleId]);

  const setEvergreen = useCallback(async (evergreen) => {
    if (!articleId) return null;
    const requestId = request.current;
    const saved = await setArticleEvergreen(articleId, evergreen);
    if (request.current !== requestId) return saved;
    setState({
      status: 'ready',
      evergreen: Boolean(saved?.evergreen ?? evergreen),
      evergreenAt: saved?.evergreenAt || null
    });
    return saved;
  }, [articleId]);

  return { source, articleId, ...state, setEvergreen };
};

export default useNotebookSourceEvergreen;
