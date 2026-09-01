import { feedPlaceHref, feedPlaces, KEPT_HREF, LATER_HREF, SET_ASIDE_HREF } from './libraryPlacesModel';

describe('library places', () => {
  it('keeps Later, Set aside, and Kept as stable Library doors', () => {
    expect(LATER_HREF).toBe('/library?scope=later');
    expect(SET_ASIDE_HREF).toBe('/library?scope=set-aside');
    expect(KEPT_HREF).toBe('/library?scope=kept');
  });

  it('prints screened folder names, never the word Feed, and drops empties', () => {
    expect(feedPlaces([
      { id: 'news', name: 'Newsletters' },
      { id: '  ', name: 'Ghost' },
      { id: 'macro', name: '  ' }
    ])).toEqual([
      { id: 'news', name: 'Newsletters', href: '/library?scope=feed&topic=news' }
    ]);
    expect(feedPlaceHref('news')).toBe('/library?scope=feed&topic=news');
    expect(feedPlaces([])).toEqual([]);
  });
});
