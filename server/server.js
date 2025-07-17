// server.js - FINAL VERSION WITH ROBUST CORS & ALL ROUTES
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// This list defines which origins are allowed to make requests
const allowedOrigins = [
  'https://note-taker-3-unrg.onrender.com', // Your Web App's URL
  process.env.CHROME_EXTENSION_ID // Your Extension's Origin
];

// Temporarily allow all origins to confirm functionality
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true
}));


app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected successfully."))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// --- SCHEMA & MODELS ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

const folderSchema = new mongoose.Schema({
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
folderSchema.index({ name: 1, userId: 1 }, { unique: true });
const Folder = mongoose.model('Folder', folderSchema);

const articleSchema = new mongoose.Schema({
  url: { type: String, required: true },
  title: { type: String, required: true },
  content: String,
  folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  highlights: [{ text: String, note: String, tags: [String], createdAt: { type: Date, default: Date.now } }],
}, { timestamps: true });
articleSchema.index({ url: 1, userId: 1 }, { unique: true });
const Article = mongoose.model('Article', articleSchema);


// --- AUTHENTICATION: JWT Verification Middleware ---
function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  if (token == null) return res.status(401).json({ error: "Authentication token required." });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token." });
    req.user = user;
    next();
  });
}

// --- API ROUTES ---

// AUTHENTICATION: Register Route
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Username and password are required." });
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(409).json({ error: "Username already exists." });
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ message: "User registered successfully." });
    } catch (error) {
        console.error("❌ Error registering user:", error);
        res.status(500).json({ error: "Internal server error.", details: error.message });
    }
});

// AUTHENTICATION: Login Route
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Username and password are required." });
        const user = await User.findOne({ username });
        if (!user) return res.status(401).json({ error: "Invalid credentials." });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: "Invalid credentials." });
        const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'None', maxAge: 3600000 });
        res.status(200).json({ message: "Login successful", username: user.username });
    } catch (error) {
        console.error("❌ Error logging in user:", error);
        res.status(500).json({ error: "Internal server error." });
    }
});

// AUTHENTICATION: Logout Route
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'None' });
    res.status(200).json({ message: "Logout successful." });
});


// POST /save-article
app.post("/save-article", authenticateToken, async (req, res) => {
  try {
    const { title, url, content, folderId } = req.body;
    const userId = req.user.id;
    if (!title || !url) return res.status(400).json({ error: "Missing required fields: title and url." });
    let actualFolderId = null;
    if (folderId && folderId !== 'null' && folderId !== 'uncategorized') {
      const folderExists = await Folder.findOne({ _id: folderId, userId: userId });
      if (!folderExists) {
          console.warn(`Attempted to save article with non-existent or unauthorized folderId: ${folderId} for user ${userId}`);
          return res.status(400).json({ error: "Provided folderId does not exist or is not accessible." });
      }
      actualFolderId = folderId;
    }
    const articleData = { title, content: content || '', folder: actualFolderId, userId, $setOnInsert: { highlights: [] } };
    const updatedArticle = await Article.findOneAndUpdate({ url: url, userId: userId }, articleData, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.status(200).json(updatedArticle);
  } catch (error) {
    console.error("❌ Error in /save-article:", error);
    res.status(500).json({ error: "Internal server error.", details: error.message });
  }
});

// GET /folders
app.get('/folders', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const folders = await Folder.find({ userId: userId }).sort({ name: 1 });
        res.json(folders);
    } catch (err) {
        console.error("❌ Failed to fetch folders:", err);
        res.status(500).json({ error: "Failed to fetch folders" });
    }
});

// POST /folders
app.post('/folders', authenticateToken, async (req, res) => {
    try {
        const { name } = req.body;
        const userId = req.user.id;
        if (!name) return res.status(400).json({ error: "Folder name is required." });
        const existingFolder = await Folder.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, userId: userId });
        if (existingFolder) return res.status(409).json({ error: "A folder with this name already exists for your account." });
        const newFolder = new Folder({ name, userId: userId });
        await newFolder.save();
        res.status(201).json(newFolder);
    } catch (err) {
        console.error("❌ Failed to create folder:", err);
        res.status(500).json({ error: "Failed to create folder" });
    }
});

// DELETE /folders/:id
app.delete('/folders/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const articlesInFolder = await Article.countDocuments({ folder: id, userId: userId });
        if (articlesInFolder > 0) return res.status(409).json({ error: "Cannot delete folder with articles. Please move or delete articles first." });
        const result = await Folder.findOneAndDelete({ _id: id, userId: userId });
        if (!result) return res.status(404).json({ error: "Folder not found or you do not have permission to delete it." });
        res.status(200).json({ message: "Folder deleted successfully." });
    } catch (error) {
        console.error("❌ Error deleting folder:", error);
        res.status(500).json({ error: "Failed to delete folder.", details: error.message });
    }
});

// GET /get-articles
app.get('/get-articles', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const articles = await Article.find({ userId: userId }).populate('folder').select('title url createdAt folder highlights').sort({createdAt: -1});
    res.json(articles);
  } catch (err) {
    console.error("❌ Failed to fetch articles:", err);
    res.status(500).json({ error: "Failed to fetch articles" });
  }
});

// GET /articles/:id
app.get('/articles/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const article = await Article.findOne({ _id: id, userId: userId }).populate('folder');
        if (!article) return res.status(404).json({ error: "Article not found or you do not have permission to view it." });
        res.status(200).json(article);
    } catch (error) {
        console.error("❌ Error fetching single article by ID:", error);
        res.status(500).json({ error: "Failed to fetch article.", details: error.message });
    }
});

// DELETE /articles/:id
app.delete('/articles/:id', authenticateToken, async (req, res) => {
  try {
      const { id } = req.params;
      const userId = req.user.id;
      const result = await Article.findOneAndDelete({ _id: id, userId: userId });
      if (!result) return res.status(404).json({ error: "Article not found or you do not have permission to delete it." });
      res.status(200).json({ message: "Article deleted successfully." });
  } catch (error) {
      console.error("❌ Error deleting article:", error);
      res.status(500).json({ error: "Failed to delete article.", details: error.message });
  }
});

// PATCH /articles/:id/move
app.patch('/articles/:id/move', authenticateToken, async (req, res) => {
  try {
      const { id } = req.params;
      const { folderId } = req.body;
      const userId = req.user.id;
      let targetFolder = null;
      if (folderId && folderId !== 'null' && folderId !== 'uncategorized') {
          const folderExists = await Folder.findOne({ _id: folderId, userId: userId });
          if (!folderExists) return res.status(400).json({ error: "Provided folderId does not exist or is not accessible." });
          targetFolder = folderId;
      }
      const updatedArticle = await Article.findOneAndUpdate({ _id: id, userId: userId }, { folder: targetFolder }, { new: true, populate: 'folder' });
      if (!updatedArticle) return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
      res.status(200).json(updatedArticle);
  } catch (error) {
      console.error("❌ Error moving article:", error);
      res.status(500).json({ error: "Failed to move article.", details: error.message });
  }
});

// POST /articles/:id/highlights
app.post('/articles/:id/highlights', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { text, note, tags } = req.body;
    const userId = req.user.id;
    if (!text) return res.status(400).json({ error: "Highlight text is required." });
    const newHighlight = { text, note: note || '', tags: tags || [] };
    const updatedArticle = await Article.findOneAndUpdate({ _id: id, userId: userId }, { $push: { highlights: newHighlight } }, { new: true, populate: ['highlights', 'folder'] });
    if (!updatedArticle) return res.status(404).json({ error: "Article not found or you do not have permission to add highlight." });
    res.status(200).json(updatedArticle);
  } catch (error) {
    console.error("❌ Error adding highlight:", error);
    res.status(500).json({ error: "Failed to add highlight.", details: error.message });
  }
});

// PATCH /articles/:articleId/highlights/:highlightId
app.patch('/articles/:articleId/highlights/:highlightId', authenticateToken, async (req, res) => {
  try {
      const { articleId, highlightId } = req.params;
      const { note, tags } = req.body;
      const userId = req.user.id;
      const article = await Article.findOne({ _id: articleId, userId: userId });
      if (!article) return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
      const highlight = article.highlights.id(highlightId);
      if (!highlight) return res.status(404).json({ error: "Highlight not found in this article." });
      highlight.note = note !== undefined ? note : highlight.note;
      highlight.tags = tags !== undefined ? tags : highlight.tags;
      await article.save();
      const updatedArticle = await Article.findById(articleId).populate('folder');
      res.status(200).json(updatedArticle);
  } catch (error) {
      console.error("❌ Error updating highlight:", error);
      res.status(500).json({ error: "Failed to update highlight.", details: error.message });
  }
});

// DELETE /articles/:articleId/highlights/:highlightId
app.delete('/articles/:articleId/highlights/:highlightId', authenticateToken, async (req, res) => {
  try {
      const { articleId, highlightId } = req.params;
      const userId = req.user.id;
      const article = await Article.findOne({ _id: articleId, userId: userId });
      if (!article) return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
      article.highlights.pull(highlightId);
      await article.save();
      const updatedArticle = await Article.findById(articleId).populate('folder');
      res.status(200).json(updatedArticle);
  } catch (error) {
      console.error("❌ Error deleting highlight:", error);
      res.status(500).json({ error: "Failed to delete highlight.", details: error.message });
  }
});

// Root endpoint for health check
app.get('/', (req, res) => res.send('✅ Note Taker backend is running!'));

// Start the server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
