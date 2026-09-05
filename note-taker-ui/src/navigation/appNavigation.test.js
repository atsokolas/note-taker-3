import {
  buildThinkPosturePath,
  consumeGoToChord,
  getPrimaryNavItems,
  getSecondaryNavItems,
  getTopBarUtilityNavItems,
  GO_TO_CHORD_MS,
  goToKeyFor,
  isGoToTypingTarget,
  NOEIS_GO_TO_SHORTCUTS,
  resolveGoToShortcut
} from './appNavigation';

describe('appNavigation', () => {
  it('names the four rooms, with Editions belonging to the wiki', () => {
    const primaryLabels = getPrimaryNavItems().map(item => item.label);

    /* Paper used to open this row. It named the same place twice: the wiki
       opened onto its own morning briefing while Paper held the reading loop,
       so two front pages competed for the same first look. The paper is the
       top of the wiki now.

       Editions sits after Wiki and belongs to it — a thing the wiki received
       rather than a room of your own work. It was in the More menu, which was
       honest about that and meant nobody found it. Named in the bar until it
       has earned or lost the place. */
    expect(primaryLabels).toEqual(['Library', 'Think', 'Wiki', 'Editions', 'Judgment']);
    expect(primaryLabels.indexOf('Editions')).toBe(primaryLabels.indexOf('Wiki') + 1);
    expect(primaryLabels).not.toContain('Paper');
    expect(primaryLabels).not.toContain('Notebook');
    expect(primaryLabels).not.toContain('Concepts');
    expect(primaryLabels).not.toContain('Questions');
  });

  it('marks Wiki active on the root route and on the paper it absorbed', () => {
    const wiki = getPrimaryNavItems().find(item => item.label === 'Wiki');

    expect(wiki.to).toBe('/wiki');
    expect(wiki.match({ pathname: '/' })).toBe(true);
    expect(wiki.match({ pathname: '/paper' })).toBe(true);
    expect(wiki.match({ pathname: '/wiki' })).toBe(true);
    expect(wiki.match({ pathname: '/library' })).toBe(false);
  });

  it('keeps Paper out of the overflow menu now that it has a room', () => {
    expect(getSecondaryNavItems().map(item => item.label)).not.toContain('Paper');
  });

  it('keeps Judgment active across the index and a single claim', () => {
    const judgment = getPrimaryNavItems().find(item => item.label === 'Judgment');

    expect(judgment.to).toBe('/judgment');
    expect(judgment.match({ pathname: '/judgment' })).toBe(true);
    expect(judgment.match({ pathname: '/judgment/wiki-page-1' })).toBe(true);
    expect(judgment.match({ pathname: '/wiki' })).toBe(false);
  });

  it('keeps legacy Think postures addressable without reintroducing top-level surfaces', () => {
    expect(buildThinkPosturePath('concepts', 'Moats')).toBe('/think?tab=concepts&concept=Moats');
    expect(buildThinkPosturePath('notebook', 'note-123')).toBe('/think?tab=notebook&entryId=note-123');
    expect(buildThinkPosturePath('questions', 'question-123')).toBe('/think?tab=questions&questionId=question-123');
  });

  it('keeps operational tools out of the primary nav', () => {
    const secondaryLabels = getSecondaryNavItems().map(item => item.label);
    const utilityLabels = getTopBarUtilityNavItems().map(item => item.label);

    expect(utilityLabels).toEqual(['Connections', 'Settings']);
    expect(secondaryLabels).not.toContain('Connections');
    expect(secondaryLabels).not.toContain('Settings');
    expect(secondaryLabels).not.toContain('Capture');
    expect(getPrimaryNavItems().map(item => item.label)).not.toEqual(expect.arrayContaining(secondaryLabels));
  });

  it('stops advertising Today, Map, Review and the Return Queue as rooms', () => {
    // Their routes still resolve — Today lands on the paper, Map is reachable
    // from the wiki workspace, and the paper says what is due. What changed is
    // that they are no longer places you are invited to go.
    const secondaryLabels = getSecondaryNavItems().map(item => item.label);

    ['Today', 'Map', 'Review', 'Return Queue'].forEach((label) => {
      expect(secondaryLabels).not.toContain(label);
    });
    /* Exact, so a room cannot creep back in unnoticed. */
    expect(secondaryLabels).toEqual(['Growth', 'How To Use']);
  });

  /* Every letter is the room's own initial, so the rule is guessable and the
     list cannot drift from the nav. It used to be hand-kept, and half of it
     was fiction: `h` and `n` both landed on the one Think page, and `c` and
     `q` set a tab Think overwrites a tick later with whichever note is open. */
  it('gives each room the letter its own name starts with', () => {
    expect(NOEIS_GO_TO_SHORTCUTS.map(item => `${item.key}:${item.to}`)).toEqual([
      'l:/library',
      't:/think',
      'w:/wiki',
      'e:/editions',
      'j:/judgment',
      'c:/connections#sources',
      's:/settings'
    ]);
    expect(resolveGoToShortcut('W')?.to).toBe('/wiki');
    expect(resolveGoToShortcut('T')?.to).toBe('/think');
    expect(resolveGoToShortcut('r')).toBeNull();
    expect(resolveGoToShortcut('x')).toBeNull();
  });

  it('advertises nothing the navigation does not already call a place', () => {
    const places = new Set([...getPrimaryNavItems(), ...getTopBarUtilityNavItems()].map(item => item.to));
    NOEIS_GO_TO_SHORTCUTS.forEach((room) => {
      expect(places.has(room.to)).toBe(true);
      expect(room.key).toBe(room.label.charAt(0).toLowerCase());
    });
  });

  /* G has to stay free so a second G re-primes rather than inventing a `gg`
     home chord, and two rooms sharing an initial would make one of them
     unreachable by a letter that looks like it should work. */
  it('never spends G, and never spends one letter twice', () => {
    const keys = NOEIS_GO_TO_SHORTCUTS.map(item => item.key);
    expect(resolveGoToShortcut('g')).toBeNull();
    expect(new Set(keys).size).toBe(keys.length);
  });

  /* The legend printed in the masthead and the key that actually navigates
     are read out of the same map, so the hint on screen cannot lie. */
  it('hands the masthead the same letter it answers to', () => {
    expect(goToKeyFor('/library')).toBe('l');
    expect(goToKeyFor('/think')).toBe('t');
    expect(goToKeyFor('/wiki')).toBe('w');
    expect(goToKeyFor('/judgment')).toBe('j');
    expect(goToKeyFor('/nowhere')).toBe('');
    expect(goToKeyFor()).toBe('');
  });
});

const bodyEvent = (key, extras = {}) => ({ key, target: document.body, ...extras });

const playChord = (keys, { start = 1_000, step = 120, extras = {} } = {}) => {
  const navigate = jest.fn();
  let primedAt = 0;
  keys.forEach((key, index) => {
    const next = consumeGoToChord({ primedAt }, bodyEvent(key, extras), start + (index * step));
    primedAt = next.primedAt;
    if (next.to) navigate(next.to);
  });
  return navigate;
};

describe('G-then-rooms', () => {
  it('navigates each mnemonic letter after G', () => {
    NOEIS_GO_TO_SHORTCUTS.forEach((room) => {
      const navigate = playChord(['g', room.key]);
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(room.to);
    });
  });

  it('does not fire while typing in an input, textarea, or contenteditable', () => {
    const navigate = jest.fn();
    const targets = ['input', 'textarea', 'div'].map((tag) => {
      const el = document.createElement(tag);
      if (tag === 'div') el.setAttribute('contenteditable', 'true');
      document.body.appendChild(el);
      return el;
    });
    const prose = document.createElement('div');
    prose.className = 'ProseMirror tiptap-editor';
    prose.setAttribute('contenteditable', 'true');
    document.body.appendChild(prose);
    targets.push(prose);
    const slash = document.createElement('div');
    slash.className = 'think-slash-menu';
    const slashItem = document.createElement('button');
    slash.appendChild(slashItem);
    document.body.appendChild(slash);
    targets.push(slashItem);

    targets.forEach((target) => {
      expect(isGoToTypingTarget(target)).toBe(true);
      let primedAt = 0;
      [['g', 1000], ['l', 1100]].forEach(([key, now]) => {
        const next = consumeGoToChord({ primedAt }, { key, target }, now);
        primedAt = next.primedAt;
        if (next.to) navigate(next.to);
      });
    });

    expect(navigate).not.toHaveBeenCalled();
    targets.forEach((target) => target.remove());
    slash.remove();
  });

  it('fails silently when the chord is incomplete or the window lapses', () => {
    expect(playChord(['g', 'x'])).not.toHaveBeenCalled();
    expect(playChord(['l'])).not.toHaveBeenCalled();
    expect(playChord(['g', 'g'])).not.toHaveBeenCalled();

    const navigate = jest.fn();
    let primedAt = 0;
    primedAt = consumeGoToChord({ primedAt }, bodyEvent('g'), 1000).primedAt;
    const late = consumeGoToChord({ primedAt }, bodyEvent('l'), 1000 + GO_TO_CHORD_MS + 1);
    if (late.to) navigate(late.to);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores the chord when modifier keys are down', () => {
    expect(playChord(['g', 'l'], { extras: { metaKey: true } })).not.toHaveBeenCalled();
    expect(playChord(['g', 'l'], { extras: { ctrlKey: true } })).not.toHaveBeenCalled();
    expect(playChord(['g', 'l'], { extras: { altKey: true } })).not.toHaveBeenCalled();
  });
});

/* An edition is something that arrived rather than a room of your own work, so
   it stands beside the wiki that received it. It began in the More menu, which
   was honest about that and meant nobody ever found it. */
describe('where the newsstand sits', () => {
  it('stands in the bar, next to the wiki it belongs to', () => {
    const primary = getPrimaryNavItems();
    expect(primary.map(item => item.label)).toContain('Editions');
    expect(primary.find(item => item.label === 'Editions')?.to).toBe('/editions');
    expect(getSecondaryNavItems().map(item => item.label)).not.toContain('Editions');
  });

  /* E was free, so the rule still holds: every letter is the room's own
     initial, and nothing had to be taken from another room. */
  it('takes its own initial without spending another room’s', () => {
    expect(resolveGoToShortcut('e')?.to).toBe('/editions');
    expect(goToKeyFor('/editions')).toBe('e');
    expect(resolveGoToShortcut('w')?.to).toBe('/wiki');
  });
});
