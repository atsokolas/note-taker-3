import { arrivedIn, atThePassage, frameOf, markOf, roomsOf, standsOn, tagOf, wallTitle } from './museumModel';

describe('the museum model', () => {
  it('stamps every number with a mark worked out from the wall’s name', () => {
    expect(markOf('Athan Tsokolas')).toBe('AT');
    expect(markOf('Athan')).toBe('AT');
    expect(markOf('')).toBe('NO');
    expect(tagOf({ accession: '2016.1' }, 'Athan Tsokolas')).toBe('AT.2016.1');
    expect(arrivedIn({ accession: '2016.1' })).toBe('2016');
  });

  it('hangs a short line as a maxim, large, and a longer one as a passage', () => {
    expect(frameOf({ passage: 'Taste', title: 'On taste' })).toMatchObject({ text: 'Taste', maxim: true, quoted: true, size: 104 });
    const passage = frameOf({ passage: 'x'.repeat(200) });
    expect(passage).toMatchObject({ maxim: false, size: 24 });
    expect(frameOf({ passage: '', title: 'You and Your Research' })).toMatchObject({ text: 'You and Your Research', quoted: false });
  });

  it('opens the original at the lines on the wall', () => {
    expect(atThePassage('https://example.com/essay#top', 'Work on the important problems.'))
      .toBe('https://example.com/essay#:~:text=Work%20on%20the%20important%20problems.');
    expect(atThePassage('https://example.com/a', 'one two three four five six seven eight nine ten eleven twelve'))
      .toBe('https://example.com/a#:~:text=one%20two%20three%20four,nine%20ten%20eleven%20twelve');
    expect(atThePassage('https://example.com/a', 'well-known')).toBe('https://example.com/a#:~:text=well%2Dknown');
    expect(atThePassage('/share/wiki/page', 'Anything')).toBe('/share/wiki/page');
  });

  it('reads what a piece stands on from what led to it', () => {
    const pieces = [{ accession: '2016.1', ledTo: ['2019.1'], room: 'Craft' }, { accession: '2019.1', ledTo: [], room: 'Craft' }, { accession: '2020.1', ledTo: ['2019.1'], room: '' }];
    expect(standsOn(pieces, '2019.1').map(piece => piece.accession)).toEqual(['2016.1', '2020.1']);
    expect(roomsOf(pieces)).toEqual(['Craft']);
    expect(wallTitle('Athan')).toBe('Athan’s wall');
    expect(wallTitle('')).toBe('Your wall');
  });
});
