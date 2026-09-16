const {
  __testables: { libraryRetrievalFilter, searchInternalItems }
} = require('./collaborativeAgentService');
const id = '6aa123456789012345678901';
test('Library scope is explicit; malformed source/shelf scope fails closed', () => {
  const inLibrary = (type, value) =>
    libraryRetrievalFilter({ type, id: value, metadata: { room: 'library' } });
  expect(inLibrary('article', id)).toEqual({ _id: id });
  expect(inLibrary('folder', id)).toEqual({ folder: id });
  expect(inLibrary('workspace', 'library')).toEqual({});
  expect(inLibrary('folder', 'bad')).toMatchObject({ _id: null });
  expect(inLibrary('workspace', 'somewhere')).toEqual({ _id: null });
  expect(
    libraryRetrievalFilter({ type: 'article', id, metadata: { room: 'think' } })
  ).toBe(null);
});
test('shelf retrieval limits the database query and never searches notes or concepts', async () => {
  const query = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn(async () => [])
  };
  const Article = { find: jest.fn(() => query) },
    NotebookEntry = { find: jest.fn() },
    TagMeta = { find: jest.fn() };
  await searchInternalItems({
    userObjectId: 'owner',
    tokens: ['reading'],
    libraryFilter: { folder: id },
    Article,
    NotebookEntry,
    TagMeta
  });
  expect(Article.find).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 'owner', folder: id })
  );
  expect(NotebookEntry.find).not.toHaveBeenCalled();
  expect(TagMeta.find).not.toHaveBeenCalled();
});
