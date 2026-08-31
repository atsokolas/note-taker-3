import { approvalLine, casePath, formatDay, hasRoom, partedLine } from './livingTeamModel';

describe('living team client model', () => {
  it('names dissent without inventing consensus', () => {
    expect(partedLine({
      left: { label: 'Athan' },
      right: { label: 'Sam' },
      parted: ['interpretation', 'action']
    })).toBe('Athan and Sam part on interpretation, action.');
  });

  it('keeps a superseded approval visible', () => {
    expect(approvalLine({
      actor: { label: 'Athan' },
      at: '2026-08-01T12:00:00.000Z',
      supersededBy: 'later'
    })).toMatch(/paper has moved/);
  });

  it('stays quiet when the case is still one author', () => {
    expect(hasRoom({ visible: true, members: [{ roles: ['administer'] }] })).toBe(false);
    expect(hasRoom({ visible: true, members: [{}, {}], mandate: { purpose: '' } })).toBe(true);
    expect(casePath('abc')).toBe('/judgment/abc');
    expect(formatDay('2026-08-31T12:00:00.000Z')).toBe('August 31, 2026');
  });
});
