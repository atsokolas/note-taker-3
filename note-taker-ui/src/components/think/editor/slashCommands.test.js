import {
  applySlashCommand,
  filterSlashCommandItems,
  getNextSlashCommandIndex,
  getSlashCommandItems,
  getSlashCommandMatch
} from './slashCommands';

describe('slashCommands', () => {
  it('matches a slash query at the start of a block', () => {
    expect(getSlashCommandMatch('/he')).toEqual({
      query: 'he',
      triggerIndex: 0
    });
  });

  it('matches a slash query after whitespace', () => {
    expect(getSlashCommandMatch('Draft /quo')).toEqual({
      query: 'quo',
      triggerIndex: 6
    });
  });

  it('ignores slashes that are part of another word', () => {
    expect(getSlashCommandMatch('path/to')).toBeNull();
    expect(getSlashCommandMatch('Draft/quote')).toBeNull();
  });

  it('filters commands by label and keywords', () => {
    const items = getSlashCommandItems('full');

    expect(filterSlashCommandItems(items, 'head').map((item) => item.id)).toContain('heading');
    expect(filterSlashCommandItems(items, 'bullet').map((item) => item.id)).toContain('bulletList');
    expect(filterSlashCommandItems(items, 'h1').map((item) => item.id)).toContain('title');
    expect(filterSlashCommandItems(items, 'ul').map((item) => item.id)).toContain('bulletList');
    expect(filterSlashCommandItems(items, 'ol').map((item) => item.id)).toContain('orderedList');
  });

  it('ranks matching artifact insertions ahead of generic formatting for concept-like queries', () => {
    const items = getSlashCommandItems('full', [
      {
        id: 'insertConcept',
        label: 'Insert concept',
        description: 'Bring a concept onto the page.',
        keywords: ['concept', 'idea', 'topic'],
        intent: 'artifact',
        artifactType: 'concept'
      }
    ]);

    expect(filterSlashCommandItems(items, 'concept')[0].id).toBe('insertConcept');
  });

  it('prefers draft-ready artifact blocks ahead of lighter insert actions for exact intent queries', () => {
    const items = getSlashCommandItems('full', [
      {
        id: 'insertQuestion',
        label: 'Insert question',
        description: 'Bring an existing question onto the page.',
        keywords: ['question', 'prompt', 'open'],
        intent: 'artifact',
        artifactType: 'question'
      },
      {
        id: 'insertQuestionBlock',
        label: 'Insert question block',
        description: 'Start a structured question frame in the draft.',
        keywords: ['question', 'frame', 'open'],
        intent: 'artifact',
        artifactType: 'question',
        prioritizeForQuery: ['question']
      }
    ]);

    expect(filterSlashCommandItems(items, 'question')[0].id).toBe('insertQuestionBlock');
  });

  it('cycles the active index for keyboard navigation', () => {
    expect(getNextSlashCommandIndex({ currentIndex: 0, itemCount: 4, key: 'ArrowDown' })).toBe(1);
    expect(getNextSlashCommandIndex({ currentIndex: 0, itemCount: 4, key: 'ArrowUp' })).toBe(3);
  });

  it('deletes the slash query and applies the selected command', () => {
    const items = getSlashCommandItems('full');
    const paragraph = items.find((item) => item.id === 'paragraph');
    const mockChain = {
      focus: jest.fn(() => mockChain),
      deleteRange: jest.fn(() => mockChain),
      setParagraph: jest.fn(() => mockChain),
      run: jest.fn(() => true)
    };
    const editor = {
      chain: jest.fn(() => mockChain)
    };

    applySlashCommand({
      editor,
      command: paragraph,
      range: { from: 5, to: 8 }
    });

    expect(mockChain.deleteRange).toHaveBeenCalledWith({ from: 5, to: 8 });
    expect(mockChain.setParagraph).toHaveBeenCalled();
    expect(mockChain.run).toHaveBeenCalled();
  });

  it('supports action commands in addition to formatting commands', () => {
    const onSelect = jest.fn();
    const actionItem = {
      id: 'insertConcept',
      label: 'Insert concept',
      description: 'Bring a concept onto the page.',
      keywords: ['concept'],
      onSelect
    };
    const items = getSlashCommandItems('full', [actionItem]);
    const mockChain = {
      focus: jest.fn(() => mockChain),
      deleteRange: jest.fn(() => mockChain),
      run: jest.fn(() => true)
    };
    const editor = {
      chain: jest.fn(() => mockChain)
    };

    applySlashCommand({
      editor,
      command: items.find((item) => item.id === 'insertConcept'),
      range: { from: 2, to: 10 }
    });

    expect(mockChain.deleteRange).toHaveBeenCalledWith({ from: 2, to: 10 });
    expect(onSelect).toHaveBeenCalledWith({ editor });
  });
});
