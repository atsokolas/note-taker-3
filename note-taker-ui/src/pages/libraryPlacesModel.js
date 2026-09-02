/*
 * Temporary doors at the top of the paper and the Library column.
 * Later / Set aside / Kept are always named so they can be found.
 * Screened topics print their folder names — never the word Feed, never a zero.
 */

export const LATER_HREF = '/library?scope=later';
export const SET_ASIDE_HREF = '/library?scope=set-aside';
export const KEPT_HREF = '/library?scope=kept';

export const feedPlaceHref = (id) => (
  `/library?scope=feed&topic=${encodeURIComponent(String(id || '').trim())}`
);

export const feedPlaces = (topics = []) => (Array.isArray(topics) ? topics : [])
  .map((topic) => ({
    id: String(topic?.id || '').trim(),
    name: String(topic?.name || '').replace(/\s+/g, ' ').trim(),
    open: Number.isFinite(Number(topic?.open)) ? Number(topic.open) : null,
    href: feedPlaceHref(topic?.id)
  }))
  .filter((topic) => topic.id && topic.name);
