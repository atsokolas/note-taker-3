import { useEffect } from 'react';
import { SITE_NAME } from '../seo/siteMetadata';

/* The page knows its name: "Costco's membership model · Judgment · Noeis",
   or "Library · Noeis" when there is no object. Empty parts drop out. */
export const documentTitle = (...parts) => [...parts, SITE_NAME]
  .map((part) => String(part || '').trim())
  .filter(Boolean)
  .join(' · ');

const useDocumentTitle = (...parts) => {
  const title = documentTitle(...parts);
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
};

export default useDocumentTitle;
