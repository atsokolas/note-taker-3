import {
  buildFolderTree,
  flattenFolderTree,
  isLivingFolder,
  topLevelAncestor
} from './folderTreeModel';

const folders = [
  { _id: 'investing', name: 'Investing' },
  { _id: 'costco', name: 'Costco', parentFolderId: 'investing', asFeed: true },
  { _id: 'brk', name: 'Berkshire', parentFolderId: 'investing' },
  { _id: 'macro', name: 'Macro' },
  { _id: 'inbox', name: 'Unfiled' }
];

const counts = { investing: 2, costco: 5, brk: 1, macro: 3 };

const find = (nodes, id) => flattenFolderTree(nodes).find(node => node.id === id);

describe('the cabinet as a tree', () => {
  it('hangs each folder under the drawer it belongs to', () => {
    const tree = buildFolderTree(folders, counts);
    expect(tree.map(node => node.id)).toEqual(['investing', 'macro']);
    expect(find(tree, 'investing').children.map(node => node.id)).toEqual(['brk', 'costco']);
  });

  it('rolls counts up, because that is what a drawer means', () => {
    const tree = buildFolderTree(folders, counts);
    expect(find(tree, 'investing').own).toBe(2);
    expect(find(tree, 'investing').total).toBe(8);
    expect(find(tree, 'costco').total).toBe(5);
  });

  it('does not roll living ink up — a parent is not a scroll because a child is', () => {
    const tree = buildFolderTree(folders, counts);
    expect(isLivingFolder(find(tree, 'costco'))).toBe(true);
    expect(isLivingFolder(find(tree, 'investing'))).toBe(false);
  });

  it('keeps procedural shelves out of the cabinet entirely', () => {
    const tree = buildFolderTree(folders, counts);
    expect(flattenFolderTree(tree).some(node => node.name === 'Unfiled')).toBe(false);
  });

  it('hangs an orphan at the top rather than losing it', () => {
    const tree = buildFolderTree([
      { _id: 'stray', name: 'Stray', parentFolderId: 'gone' }
    ], {});
    expect(tree.map(node => node.id)).toEqual(['stray']);
  });

  it('refuses to hang a folder inside itself', () => {
    const tree = buildFolderTree([{ _id: 'loop', name: 'Loop', parentFolderId: 'loop' }], {});
    expect(tree.map(node => node.id)).toEqual(['loop']);
    expect(tree[0].children).toEqual([]);
  });

  it('counts nothing as nothing, without inventing a total', () => {
    const tree = buildFolderTree([{ _id: 'empty', name: 'Empty' }], {});
    expect(tree[0].own).toBe(0);
    expect(tree[0].total).toBe(0);
  });

  it('survives an empty cabinet', () => {
    expect(buildFolderTree()).toEqual([]);
    expect(buildFolderTree([], {})).toEqual([]);
  });
});

describe('what the drift reads', () => {
  it('reads the top-level drawer, not the leaf a piece was filed in', () => {
    expect(topLevelAncestor(folders, 'costco').name).toBe('Investing');
    expect(topLevelAncestor(folders, 'brk').name).toBe('Investing');
  });

  it('reads a top-level folder as itself', () => {
    expect(topLevelAncestor(folders, 'macro').name).toBe('Macro');
  });

  it('says nothing about a folder it does not have', () => {
    expect(topLevelAncestor(folders, 'nowhere')).toBeNull();
    expect(topLevelAncestor(folders, '')).toBeNull();
  });

  it('stops on a cycle rather than walking forever', () => {
    const looped = [
      { _id: 'a', name: 'A', parentFolderId: 'b' },
      { _id: 'b', name: 'B', parentFolderId: 'a' }
    ];
    expect(topLevelAncestor(looped, 'a')).not.toBeNull();
  });
});
