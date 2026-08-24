import { buildNoeisSurface, resolveNoeisRoom } from './noeisSurfaceModel';

describe('noeis surface model', () => {
  it.each([
    ['/library', 'library'],
    ['/library?articleId=1', 'library'],
    ['/think', 'think'],
    ['/wiki', 'wiki'],
    ['/wiki/workspace', 'wiki'],
    ['/paper', 'wiki'],
    ['/judgment/abc', 'judgment']
  ])('maps %s to %s', (pathname, room) => {
    expect(resolveNoeisRoom(pathname)?.id).toBe(room);
  });

  it('leaves utility routes outside the four-room contract', () => {
    expect(resolveNoeisRoom('/settings')).toBeNull();
    expect(buildNoeisSurface({ pathname: '/connections' }).room).toBe('');
  });

  it('lets an exact page identity refine the route default', () => {
    expect(buildNoeisSurface({
      pathname: '/wiki/workspace',
      descriptor: {
        objectType: 'wiki_page',
        objectId: 'page-1',
        title: 'Compound interest',
        orientation: 'A maintained explanation grounded in your library.'
      }
    })).toEqual(expect.objectContaining({
      room: 'wiki',
      label: 'Wiki',
      objectType: 'wiki_page',
      objectId: 'page-1',
      title: 'Compound interest',
      orientation: 'A maintained explanation grounded in your library.'
    }));
  });
});
