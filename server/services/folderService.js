const mergeFolderCounts = (folders, counts) => {
  const countMap = new Map();
  counts.forEach(row => {
    if (!row || !row._id) return;
    countMap.set(String(row._id), row.articleCount || 0);
  });
  return folders.map(folder => ({
    _id: folder._id,
    name: folder.name,
    parentFolderId: folder.parentFolderId || null,
    sortOrder: folder.sortOrder || 0,
    articleCount: countMap.get(String(folder._id)) || 0
  }));
};

const buildFolderService = ({ Folder, Article, mongoose }) => {
  const getFoldersWithCounts = async (userId) => {
    const folders = await Folder.find({ userId }).sort({ name: 1 });
    const counts = await Article.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), folder: { $ne: null } } },
      { $group: { _id: '$folder', articleCount: { $sum: 1 } } }
    ]);
    return mergeFolderCounts(folders, counts);
  };

  return { getFoldersWithCounts };
};

module.exports = {
  buildFolderService,
  mergeFolderCounts
};
