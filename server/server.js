const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// This is the new, permissive CORS setup
app.use(cors());

// Allow larger payloads for PDFs (Render/nginx often defaults to 1–10MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI) // useNewUrlParser and useUnifiedTopology are deprecated in recent Mongoose versions
  .then(() => console.log("✅ MongoDB connected successfully."))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// --- SCHEMA & MODELS ---

// --- AUTHENTICATION ADDITIONS: User Schema and Model ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true }, // Hashed password
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// --- PDF attachments / annotations (defined early so Article can reference it) ---
const annotationSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  page: { type: Number, default: null },
  color: { type: String, default: '#f6c244' },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const pdfAttachmentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  dataUrl: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  annotations: [annotationSchema]
}, { _id: false });


// --- FEEDBACK STORAGE ONLY ---
const feedbackSchema = new mongoose.Schema({
  message: { type: String, required: true, trim: true },
  rating: { type: Number, min: 1, max: 5, default: null },
  email: { type: String, default: '' },
  source: { type: String, default: 'web-app' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

const Feedback = mongoose.model('Feedback', feedbackSchema);
// --- NEW SCHEMA for Recommendations ---
const recommendationSchema = new mongoose.Schema({
  articleUrl: { type: String, required: true, index: true },
  articleTitle: { type: String, required: true },
  recommendingUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sharedHighlights: [{
      text: { type: String, required: true }
  }]
}, { timestamps: true });

const Recommendation = mongoose.model('Recommendation', recommendationSchema);

// Folder Schema and Model - MODIFIED TO INCLUDE userId
const folderSchema = new mongoose.Schema({
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true } // Link to user
}, { timestamps: true });

// Add a unique compound index for name and userId to ensure unique folder names per user
folderSchema.index({ name: 1, userId: 1 }, { unique: true });

const Folder = mongoose.model('Folder', folderSchema);

// Article Schema and Model - MODIFIED TO INCLUDE userId
const articleSchema = new mongoose.Schema({
  url: { type: String, required: true },
  title: { type: String, required: true },
  content: String,
  folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  highlights: [{
      text: String,
      note: String,
      tags: [String],
      createdAt: { type: Date, default: Date.now }
  }],
  pdfs: { type: [pdfAttachmentSchema], default: [] },

  // --- CORRECT LOCATION FOR NEW FIELDS ---
  author: { type: String, default: '' },
  publicationDate: { type: String, default: '' }, // <-- TYPO FIXED
  siteName: { type: String, default: '' }
  // --- END ---

}, { timestamps: true });


// Add a unique compound index for url and userId to ensure unique article URLs per user
articleSchema.index({ url: 1, userId: 1 }, { unique: true });

const Article = mongoose.model('Article', articleSchema);

// --- NOTEBOOK: Schema for freeform notes with checklists ---
const checklistItemSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  checked: { type: Boolean, default: false }
}, { _id: true });

const noteSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, default: '' },
  checklist: [checklistItemSchema],
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

const Note = mongoose.model('Note', noteSchema);

// --- NOTEBOOK ENTRIES (new lightweight notebook) ---
const notebookEntrySchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, default: '' },
  folder: { type: mongoose.Schema.Types.ObjectId, ref: 'NotebookFolder', default: null },
  tags: { type: [String], default: [] },
  linkedArticleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', default: null },
  linkedHighlightIds: [{ type: mongoose.Schema.Types.ObjectId }],
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

const NotebookEntry = mongoose.model('NotebookEntry', notebookEntrySchema);

const notebookFolderSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

const NotebookFolder = mongoose.model('NotebookFolder', notebookFolderSchema);

// Tag metadata (concept pages)
const tagMetaSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  pinnedHighlightIds: [{ type: mongoose.Schema.Types.ObjectId }],
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

tagMetaSchema.index({ name: 1, userId: 1 }, { unique: true });

const TagMeta = mongoose.model('TagMeta', tagMetaSchema);

// Saved Views (Smart Folders)
const savedViewSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  targetType: { type: String, enum: ['articles', 'highlights', 'notebook'], default: 'highlights' },
  filters: {
    tags: [{ type: String }],
    textQuery: { type: String, default: '' },
    dateFrom: { type: Date },
    dateTo: { type: Date },
    folders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Folder' }]
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

const SavedView = mongoose.model('SavedView', savedViewSchema);
// Collections
const collectionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  slug: { type: String, required: true, trim: true },
  articleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],
  highlightIds: [{ type: mongoose.Schema.Types.ObjectId }],
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

collectionSchema.index({ slug: 1, userId: 1 }, { unique: true });

const Collection = mongoose.model('Collection', collectionSchema);

// --- AUTHENTICATION ADDITIONS: JWT Verification Middleware ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Expects 'Bearer TOKEN'

  if (token == null) {
    return res.status(401).json({ error: "Authentication token required." }); // No token provided
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.error("JWT Verification Error:", err.message);
      return res.status(403).json({ error: "Invalid or expired token." }); // Token is invalid
    }
    req.user = user; // Store user payload (e.g., { id: userId, username: username }) in request
    next(); // Proceed to the next middleware/route handler
  });
}

const slugify = (text = '') => {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'collection';
};

// --- API ROUTES ---

// --- AUTHENTICATION ADDITIONS: Register Route ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required." });
        }

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(409).json({ error: "Username already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10); // Hash password with salt rounds
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ message: "User registered successfully." });
    } catch (error) {
        console.error("❌ Error registering user:", error);
        res.status(500).json({ error: "Internal server error.", details: error.message });
    }
});

// --- AUTHENTICATION ADDITIONS: Login Route ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required." });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: "Invalid credentials." }); // User not found
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials." }); // Passwords don't match
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user._id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '1h' } // Token expires in 1 hour
        );

        res.status(200).json({ token, username: user.username, userId: user._id });
    } catch (error) {
        console.error("❌ Error logging in user:", error);
        res.status(500).json({ error: "Internal server error.", details: error.message });
    }
});

// --- NEW SOCIAL API ROUTES ---

// POST /api/recommendations - Recommend an article with selected highlights
app.post('/api/recommendations', authenticateToken, async (req, res) => {
  const { articleId, highlightIds } = req.body;
  const userId = req.user.id;

  // --- Validation Rules ---
  if (!articleId || !highlightIds) {
      return res.status(400).json({ error: "Article ID and highlight IDs are required." });
  }
  if (!Array.isArray(highlightIds) || highlightIds.length === 0) {
      return res.status(400).json({ error: "You must select at least one highlight to share." });
  }
  if (highlightIds.length > 10) {
      return res.status(400).json({ error: "You can share a maximum of 10 highlights." });
  }
  const WORD_LIMIT_PER_HIGHLIGHT = 35; // A reasonable limit
  // -------------------------

  try {
      const article = await Article.findOne({ _id: articleId, userId: userId });
      if (!article) {
          return res.status(404).json({ error: "Article not found or you do not own it." });
      }

      const sharedHighlights = [];
      for (const hId of highlightIds) {
          const highlight = article.highlights.id(hId);
          if (!highlight) {
              return res.status(400).json({ error: `Highlight with ID ${hId} not found.` });
          }
          // Check word count for each highlight
          if (highlight.text.split(' ').length > WORD_LIMIT_PER_HIGHLIGHT) {
              return res.status(400).json({ error: `One of your selected highlights exceeds the ${WORD_LIMIT_PER_HIGHLIGHT}-word limit.` });
          }
          sharedHighlights.push({ text: highlight.text });
      }

      const newRecommendation = new Recommendation({
          articleUrl: article.url,
          articleTitle: article.title,
          recommendingUserId: userId,
          sharedHighlights: sharedHighlights
      });

      await newRecommendation.save();
      res.status(201).json({ message: "Article recommended successfully!", recommendation: newRecommendation });

  } catch (error) {
      console.error("❌ Error recommending article:", error);
      res.status(500).json({ error: "Internal server error." });
  }
});

// GET /api/trending - top recommended and highlighted articles across all users (last 7 days)
app.get('/api/trending', authenticateToken, async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recommended = await Recommendation.aggregate([
      { $match: { createdAt: { $gte: cutoff } } },
      { $group: {
          _id: "$articleUrl",
          recommendationCount: { $sum: 1 },
          articleTitle: { $first: "$articleTitle" }
      }},
      { $sort: { recommendationCount: -1 } },
      { $limit: 10 }
    ]);

    const highlighted = await Article.aggregate([
      { $unwind: '$highlights' },
      { $match: { 'highlights.createdAt': { $gte: cutoff } } },
      { $group: {
          _id: '$_id',
          title: { $first: '$title' },
          count: { $sum: 1 }
      }},
      { $sort: { count: -1, title: 1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({ recommended, highlighted });
  } catch (error) {
    console.error("❌ Error fetching trending data:", error);
    res.status(500).json({ error: "Failed to fetch trending." });
  }
});

// --- NOTEBOOK ROUTES ---
const normalizeChecklist = (checklist = []) => {
  if (!Array.isArray(checklist)) return [];
  return checklist
    .map(item => ({
      text: (item?.text || '').trim(),
      checked: !!item?.checked
    }))
    .filter(item => item.text.length > 0);
};

const normalizeAnnotations = (annotations = []) => {
  if (!Array.isArray(annotations)) return [];
  return annotations
    .map(item => {
      const text = (item?.text || '').trim();
      const note = (item?.note || '').trim();
      if (!text && !note) return null;
      return {
        id: item?.id || new mongoose.Types.ObjectId().toString(),
        text,
        note,
        page: typeof item?.page === 'number' ? item.page : null,
        color: item?.color || '#f6c244',
        createdAt: item?.createdAt || new Date()
      };
    })
    .filter(Boolean);
};

const normalizePdfs = (pdfs = []) => {
  if (!Array.isArray(pdfs)) return [];
  return pdfs
    .map(pdf => {
      const dataUrl = typeof pdf?.dataUrl === 'string' ? pdf.dataUrl : '';
      if (!dataUrl) return null;
      return {
        id: pdf?.id || new mongoose.Types.ObjectId().toString(),
        name: (pdf?.name || 'Untitled.pdf').trim().slice(0, 200),
        dataUrl,
        uploadedAt: pdf?.uploadedAt || new Date(),
        annotations: normalizeAnnotations(pdf?.annotations || [])
      };
    })
    .filter(Boolean);
};

// GET /api/notes - fetch all notes for the authenticated user
app.get('/api/notes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const notes = await Note.find({ userId }).sort({ updatedAt: -1 });
    res.status(200).json(notes);
  } catch (error) {
    console.error("❌ Error fetching notes:", error);
    res.status(500).json({ error: "Failed to fetch notes." });
  }
});

// POST /api/notes - create a new note
app.post('/api/notes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, content, checklist } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "A title is required to create a note." });
    }

    const newNote = new Note({
      title: title.trim(),
      content: content || '',
      checklist: normalizeChecklist(checklist),
      userId
    });

    await newNote.save();
    res.status(201).json(newNote);
  } catch (error) {
    console.error("❌ Error creating note:", error);
    res.status(500).json({ error: "Failed to create note." });
  }
});

// PATCH /api/notes/:id - update an existing note
app.patch('/api/notes/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { title, content, checklist } = req.body;

    const updates = {};
    if (title !== undefined) {
      const trimmed = title.trim();
      updates.title = trimmed.length ? trimmed : 'Untitled note';
    }
    if (content !== undefined) updates.content = content;
    if (checklist !== undefined) updates.checklist = normalizeChecklist(checklist);

    const updatedNote = await Note.findOneAndUpdate(
      { _id: id, userId },
      updates,
      { new: true }
    );

    if (!updatedNote) {
      return res.status(404).json({ error: "Note not found or you do not have permission to edit it." });
    }

    res.status(200).json(updatedNote);
  } catch (error) {
    console.error("❌ Error updating note:", error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: "Invalid note ID format." });
    }
    res.status(500).json({ error: "Failed to update note." });
  }
});

// DELETE /api/notes/:id - delete a note
app.delete('/api/notes/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const deletedNote = await Note.findOneAndDelete({ _id: id, userId });
    if (!deletedNote) {
      return res.status(404).json({ error: "Note not found or you do not have permission to delete it." });
    }

    res.status(200).json({ message: "Note deleted successfully." });
  } catch (error) {
    console.error("❌ Error deleting note:", error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: "Invalid note ID format." });
    }
    res.status(500).json({ error: "Failed to delete note." });
  }
});

// POST /save-article: Saves a new article or updates an existing one - MODIFIED FOR USER AUTHENTICATION
app.post("/save-article", authenticateToken, async (req, res) => {
  try {
    // --- 1. I added the new fields here ---
    const {title, url, content, folderId, author, publicationDate, siteName, pdfs} = req.body;
    const userId = req.user.id; // Get user ID from authenticated token

    if (!title || !url) {
      return res.status(400).json({ error: "Missing required fields: title and url." });
    }

    // Ensure folderId refers to an existing folder for THIS user if provided
    let actualFolderId = null;
    if (folderId && folderId !== 'null' && folderId !== 'uncategorized') {
      const folderExists = await Folder.findOne({ _id: folderId, userId: userId });
      if (!folderExists) {
          console.warn(`Attempted to save article with non-existent or unauthorized folderId: ${folderId} for user ${userId}`);
          return res.status(400).json({ error: "Provided folderId does not exist or is not accessible." });
      }
      actualFolderId = folderId;
    }
    const articleData = {
        title: title,
        content: content || '',
        folder: actualFolderId,
        userId: userId,
        
        // --- 2. And I added them to the data object here ---
        author: author || '',
        publicationDate: publicationDate || '',
        siteName: siteName || '',
        ...(pdfs !== undefined ? { pdfs: normalizePdfs(pdfs) } : {}),
        
        $setOnInsert: { highlights: [] }
    }; // <-- THIS WAS THE MISSING BRACE AND SEMICOLON

    // Find and update/upsert based on url AND userId
    const updatedArticle = await Article.findOneAndUpdate({ url: url, userId: userId }, articleData, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    });
    res.status(200).json(updatedArticle);
  } catch (error) {
    console.error("❌ Error in /save-article:", error);
    res.status(500).json({ error: "Internal server error.", details: error.message });
  }
});


// --- FOLDER API ROUTES ---

// GET /folders: Fetches all created folders - MODIFIED FOR USER AUTHENTICATION
app.get('/folders', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        // Fetch folders belonging to the authenticated user
        const folders = await Folder.find({ userId: userId }).sort({ name: 1 });
        res.json(folders);
    } catch (err) {
        console.error("❌ Failed to fetch folders:", err);
        res.status(500).json({ error: "Failed to fetch folders" });
    }
});

// POST /folders: Creates a new folder - MODIFIED FOR USER AUTHENTICATION
app.post('/folders', authenticateToken, async (req, res) => {
    try {
        const { name } = req.body;
        const userId = req.user.id;
        if (!name) {
            return res.status(400).json({ error: "Folder name is required." });
        }
        // Check if folder already exists for THIS user (case-insensitive)
        const existingFolder = await Folder.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, userId: userId });
        if (existingFolder) {
            return res.status(409).json({ error: "A folder with this name already exists for your account." });
        }
        const newFolder = new Folder({ name, userId: userId }); // Assign user ID
        await newFolder.save();
        res.status(201).json(newFolder);
    } catch (err) {
        console.error("❌ Failed to create folder:", err);
        res.status(500).json({ error: "Failed to create folder" });
    }
});

// DELETE /folders/:id: Deletes a specific folder - MODIFIED FOR USER AUTHENTICATION
app.delete('/folders/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Option 1 (chosen): Prevent deletion if the folder contains any articles for THIS user.
        const articlesInFolder = await Article.countDocuments({ folder: id, userId: userId });
        if (articlesInFolder > 0) {
             return res.status(409).json({ error: "Cannot delete folder with articles. Please move or delete articles first." });
        }

        // Ensure the folder belongs to the authenticated user before deleting
        const result = await Folder.findOneAndDelete({ _id: id, userId: userId });
        if (!result) {
            return res.status(404).json({ error: "Folder not found or you do not have permission to delete it." });
        }
        res.status(200).json({ message: "Folder deleted successfully." });
    } catch (error) {
        console.error("❌ Error deleting folder:", error);
        if (error.name === 'CastError') {
          return res.status(400).json({ error: "Invalid folder ID format." });
        }
        res.status(500).json({ error: "Failed to delete folder.", details: error.message });
    }
});


// --- ARTICLE MANAGEMENT API ROUTES ---

// GET /get-articles - MODIFIED FOR USER AUTHENTICATION
app.get('/get-articles', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    // Fetch articles belonging to the authenticated user
    const articles = await Article.find({ userId: userId })
                                 .populate('folder')
                                 .select('title url createdAt folder highlights')
                                 .sort({createdAt: -1});
    res.json(articles);
  } catch (err) {
    console.error("❌ Failed to fetch articles:", err);
    res.status(500).json({ error: "Failed to fetch articles" });
  }
});


// GET /articles/:id: Fetches a single article by ID - MODIFIED FOR USER AUTHENTICATION
app.get('/articles/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        // Fetch article by ID AND ensure it belongs to the authenticated user
        const article = await Article.findOne({ _id: id, userId: userId }).populate('folder');
        if (!article) {
            return res.status(404).json({ error: "Article not found or you do not have permission to view it." });
        }
        res.status(200).json(article);
    } catch (error) {
        console.error("❌ Error fetching single article by ID:", error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: "Invalid article ID format." });
        }
        res.status(500).json({ error: "Failed to fetch article.", details: error.message });
    }
});

// Add this new route to server.js

// GET /api/articles/by-url: Finds an article by its URL for the current user
app.get('/api/articles/by-url', authenticateToken, async (req, res) => {
  try {
      const { url } = req.query;
      if (!url) {
          return res.status(400).json({ error: 'URL query parameter is required.' });
      }
      
      const userId = req.user.id;
      // Find the article that matches the URL and the logged-in user
      const article = await Article.findOne({ url: url, userId: userId });

      if (!article) {
          // It's not an error if not found, just return an empty success response
          return res.status(200).json(null); 
      }

      res.status(200).json(article); // Return the found article
  } catch (error) {
      console.error("❌ Error fetching article by URL:", error);
      res.status(500).json({ error: "Internal server error." });
  }
});

// DELETE /articles/:id: Deletes a specific article - MODIFIED FOR USER AUTHENTICATION
app.delete('/articles/:id', authenticateToken, async (req, res) => {
  try {
      const { id } = req.params;
      const userId = req.user.id;
      // Delete article by ID AND ensure it belongs to the authenticated user
      const result = await Article.findOneAndDelete({ _id: id, userId: userId });
      if (!result) {
          return res.status(404).json({ error: "Article not found or you do not have permission to delete it." });
      }
      res.status(200).json({ message: "Article deleted successfully." });
  } catch (error) {
      console.error("❌ Error deleting article:", error);
      if (error.name === 'CastError') {
        return res.status(400).json({ error: "Invalid article ID format." });
      }
      res.status(500).json({ error: "Failed to delete article.", details: error.message });
  }
});

// PATCH /articles/:id/move: Moves an article to a different folder (or uncategorized) - MODIFIED FOR USER AUTHENTICATION
app.patch('/articles/:id/move', authenticateToken, async (req, res) => {
  try {
      const { id } = req.params;
      const { folderId } = req.body;
      const userId = req.user.id;

      let targetFolder = null;
      if (folderId && folderId !== 'null' && folderId !== 'uncategorized') {
          // Validate if folderId exists AND belongs to the authenticated user
          const folderExists = await Folder.findOne({ _id: folderId, userId: userId });
          if (!folderExists) {
              return res.status(400).json({ error: "Provided folderId does not exist or is not accessible." });
          }
          targetFolder = folderId;
      }

      // Update article by ID AND ensure it belongs to the authenticated user
      const updatedArticle = await Article.findOneAndUpdate(
          { _id: id, userId: userId },
          { folder: targetFolder },
          { new: true, populate: 'folder' }
      );

      if (!updatedArticle) {
          return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
      }
      res.status(200).json(updatedArticle);
  } catch (error) {
      console.error("❌ Error moving article:", error);
      if (error.name === 'CastError') {
        return res.status(400).json({ error: "Invalid article ID format." });
      }
      res.status(500).json({ error: "Failed to move article.", details: error.message });
  }
});

// PATCH /articles/:id/pdfs - replace PDF attachments and annotations for an article
app.patch('/articles/:id/pdfs', authenticateToken, async (req, res) => {
  try {
      const { id } = req.params;
      const userId = req.user.id;
    const { pdfs } = req.body;

    const normalizedPdfs = normalizePdfs(pdfs || []);
    const updatedArticle = await Article.findOneAndUpdate(
      { _id: id, userId },
      { pdfs: normalizedPdfs },
      { new: true }
    ).populate('folder');

    if (!updatedArticle) {
      return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
    }

    res.status(200).json(updatedArticle);
  } catch (error) {
    console.error("❌ Error updating article PDFs:", error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: "Invalid article ID format." });
    }
    res.status(500).json({ error: "Failed to update PDFs.", details: error.message });
  }
});

// GET /api/highlights/all - fetch all highlights across user's articles
app.get('/api/highlights/all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const highlights = await Article.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$highlights' },
      { $project: {
          _id: '$highlights._id',
          articleId: '$_id',
          articleTitle: '$title',
          text: '$highlights.text',
          note: '$highlights.note',
          tags: '$highlights.tags',
          createdAt: '$highlights.createdAt'
      } },
      { $sort: { createdAt: -1 } }
    ]);
    res.status(200).json(highlights);
  } catch (error) {
    console.error("❌ Error fetching all highlights:", error);
    res.status(500).json({ error: "Failed to fetch highlights." });
  }
});


// --- NOTEBOOK ENTRY CRUD ---
// GET /api/notebook - list entries
app.get('/api/notebook', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const entries = await NotebookEntry.find({ userId }).sort({ updatedAt: -1 });
    res.status(200).json(entries);
  } catch (error) {
    console.error("❌ Error fetching notebook entries:", error);
    res.status(500).json({ error: "Failed to fetch notebook entries." });
  }
});

// POST /api/notebook - create
app.post('/api/notebook', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, content, folder, tags, linkedArticleId } = req.body;
    const newEntry = new NotebookEntry({
      title: (title || 'Untitled').trim(),
      content: content || '',
      folder: folder || null,
      tags: Array.isArray(tags) ? tags : [],
      linkedArticleId: linkedArticleId || null,
      userId
    });
    await newEntry.save();
    res.status(201).json(newEntry);
  } catch (error) {
    console.error("❌ Error creating notebook entry:", error);
    res.status(500).json({ error: "Failed to create notebook entry." });
  }
});

// GET /api/notebook/:id - fetch single entry
app.get('/api/notebook/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const entry = await NotebookEntry.findOne({ _id: id, userId });
    if (!entry) {
      return res.status(404).json({ error: "Notebook entry not found." });
    }
    res.status(200).json(entry);
  } catch (error) {
    console.error("❌ Error fetching notebook entry:", error);
    res.status(500).json({ error: "Failed to fetch notebook entry." });
  }
});

// POST /api/notebook/:id/link-highlight - record backlink to highlight
app.post('/api/notebook/:id/link-highlight', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { highlightId } = req.body;
    if (!highlightId) {
      return res.status(400).json({ error: "highlightId is required." });
    }
    const updated = await NotebookEntry.findOneAndUpdate(
      { _id: id, userId },
      { $addToSet: { linkedHighlightIds: highlightId } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ error: "Notebook entry not found." });
    }
    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error linking highlight to notebook:", error);
    res.status(500).json({ error: "Failed to link highlight." });
  }
});

// PUT /api/notebook/:id - update
app.put('/api/notebook/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { title, content, folder, tags, linkedArticleId } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title.trim() || 'Untitled';
    if (content !== undefined) updates.content = content;
    if (folder !== undefined) updates.folder = folder || null;
    if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : [];
    if (linkedArticleId !== undefined) updates.linkedArticleId = linkedArticleId || null;

    const updated = await NotebookEntry.findOneAndUpdate(
      { _id: id, userId },
      updates,
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ error: "Notebook entry not found." });
    }
    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error updating notebook entry:", error);
    res.status(500).json({ error: "Failed to update notebook entry." });
  }
});

// DELETE /api/notebook/:id - delete
app.delete('/api/notebook/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const deleted = await NotebookEntry.findOneAndDelete({ _id: id, userId });
    if (!deleted) {
      return res.status(404).json({ error: "Notebook entry not found." });
    }
    res.status(200).json({ message: "Notebook entry deleted." });
  } catch (error) {
    console.error("❌ Error deleting notebook entry:", error);
    res.status(500).json({ error: "Failed to delete notebook entry." });
  }
});

// NOTEBOOK FOLDERS
app.get('/api/notebook/folders', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const folders = await NotebookFolder.find({ userId }).sort({ name: 1 });
    res.status(200).json(folders);
  } catch (error) {
    console.error("❌ Error fetching notebook folders:", error);
    res.status(500).json({ error: "Failed to fetch folders." });
  }
});

app.post('/api/notebook/folders', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Folder name is required." });
    }
    const folder = new NotebookFolder({ name: name.trim(), userId });
    await folder.save();
    res.status(201).json(folder);
  } catch (error) {
    console.error("❌ Error creating notebook folder:", error);
    res.status(500).json({ error: "Failed to create folder." });
  }
});

app.delete('/api/notebook/folders/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const deleted = await NotebookFolder.findOneAndDelete({ _id: id, userId });
    if (!deleted) {
      return res.status(404).json({ error: "Folder not found." });
    }
    // Clear folder from entries that referenced it
    await NotebookEntry.updateMany({ userId, folder: id }, { $set: { folder: null } });
    res.status(200).json({ message: "Folder deleted." });
  } catch (error) {
    console.error("❌ Error deleting notebook folder:", error);
    res.status(500).json({ error: "Failed to delete folder." });
  }
});

// POST /api/feedback - store feedback in Mongo (no email)
app.post('/api/feedback', async (req, res) => {
  try {
    const { message, rating, email, source } = req.body || {};
    const trimmedMessage = (message || '').trim();
    if (!trimmedMessage) {
      return res.status(400).json({ error: "Feedback message is required." });
    }
    const safeRating = Number.isFinite(Number(rating)) ? Math.max(1, Math.min(5, Number(rating))) : null;
    const feedback = new Feedback({
      message: trimmedMessage,
      rating: safeRating,
      email: (email || '').trim(),
      source: source || 'web-app',
      userId: req.user?.id || null
    });
    await feedback.save();
    res.status(200).json({ message: "Feedback saved. Thank you!" });
  } catch (error) {
    console.error("❌ Error saving feedback:", error);
    res.status(500).json({ error: "Failed to save feedback." });
  }
});

// GET /api/feedback - fetch feedback (authenticated)
app.get('/api/feedback', authenticateToken, async (req, res) => {
  try {
    const adminList = (process.env.FEEDBACK_ADMIN_USERNAMES || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);
    if (adminList.length > 0 && !adminList.includes(req.user?.username)) {
      return res.status(403).json({ error: "Not authorized to view feedback." });
    }

    const feedback = await Feedback.find().sort({ createdAt: -1 }).limit(200);
    res.status(200).json(feedback);
  } catch (error) {
    console.error("❌ Error fetching feedback:", error);
    res.status(500).json({ error: "Failed to fetch feedback." });
  }
});

// GET /api/search?q= - search articles and highlights
app.get('/api/search', authenticateToken, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: "Query parameter q is required." });
    }
    const userId = req.user.id;
    const regex = new RegExp(q, 'i');

    const articles = await Article.find({
      userId,
      $or: [{ title: regex }, { content: regex }]
    })
      .select('title content')
      .sort({ updatedAt: -1 })
      .limit(50);

    const highlights = await Article.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$highlights' },
      { $match: {
          $or: [
            { 'highlights.text': regex },
            { 'highlights.note': regex },
            { 'highlights.tags': regex }
          ]
        }
      },
      { $project: {
          _id: '$highlights._id',
          articleId: '$_id',
          articleTitle: '$title',
          text: '$highlights.text',
          note: '$highlights.note',
          tags: '$highlights.tags',
          createdAt: '$highlights.createdAt'
      } },
      { $sort: { createdAt: -1 } },
      { $limit: 100 }
    ]);

    res.status(200).json({ articles, highlights });
  } catch (error) {
    console.error("❌ Error performing search:", error);
    res.status(500).json({ error: "Failed to perform search." });
  }
});

// GET /api/tags - list unique tags with counts
app.get('/api/tags', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const tags = await Article.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$highlights' },
      { $unwind: '$highlights.tags' },
      { $group: { _id: '$highlights.tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } }
    ]);
    res.status(200).json(tags.map(t => ({ tag: t._id, count: t.count })));
  } catch (error) {
    console.error("❌ Error fetching tags:", error);
    res.status(500).json({ error: "Failed to fetch tags." });
  }
});

// GET /api/tags/cooccurrence - top tag pairs
app.get('/api/tags/cooccurrence', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const highlights = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $project: { tags: '$highlights.tags' } }
    ]);

    const pairCounts = {};
    highlights.forEach(h => {
      const tags = Array.isArray(h.tags) ? [...new Set(h.tags.filter(Boolean))] : [];
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const a = tags[i];
          const b = tags[j];
          if (!a || !b) continue;
          const [tagA, tagB] = a.localeCompare(b) <= 0 ? [a, b] : [b, a];
          const key = `${tagA}:::${tagB}`;
          pairCounts[key] = (pairCounts[key] || 0) + 1;
        }
      }
    });

    const pairs = Object.entries(pairCounts)
      .map(([key, count]) => {
        const [tagA, tagB] = key.split(':::');
        return { tagA, tagB, count };
      })
      .sort((a, b) => b.count - a.count || a.tagA.localeCompare(b.tagA))
      .slice(0, 20);

    res.status(200).json(pairs);
  } catch (error) {
    console.error("❌ Error computing tag cooccurrence:", error);
    res.status(500).json({ error: "Failed to compute tag cooccurrence." });
  }
});

// GET /api/tags/filter?tags=a,b - highlights containing any of the selected tags
app.get('/api/tags/filter', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const tagsParam = (req.query.tags || '').trim();
    if (!tagsParam) {
      return res.status(400).json({ error: "Query parameter 'tags' is required (comma-separated)." });
    }
    const tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
    if (tags.length === 0) {
      return res.status(400).json({ error: "At least one tag is required." });
    }

    const highlights = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': { $in: tags } } },
      { $project: {
          _id: '$highlights._id',
          articleId: '$_id',
          articleTitle: '$title',
          text: '$highlights.text',
          note: '$highlights.note',
          tags: '$highlights.tags',
          createdAt: '$highlights.createdAt'
      } },
      { $sort: { createdAt: -1 } },
      { $limit: 200 }
    ]);

    res.status(200).json(highlights);
  } catch (error) {
    console.error("❌ Error filtering highlights by tags:", error);
    res.status(500).json({ error: "Failed to fetch highlights by tags." });
  }
});

// GET /api/tags/:tag - highlights for a tag and related tags
app.get('/api/tags/:tag', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const tag = req.params.tag;
    const highlights = await Article.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': tag } },
      { $project: {
          _id: '$highlights._id',
          articleId: '$_id',
          articleTitle: '$title',
          text: '$highlights.text',
          note: '$highlights.note',
          tags: '$highlights.tags',
          createdAt: '$highlights.createdAt'
      } },
      { $sort: { createdAt: -1 } }
    ]);

    const relatedCounts = {};
    highlights.forEach(h => {
      (h.tags || []).forEach(t => {
        if (t !== tag) {
          relatedCounts[t] = (relatedCounts[t] || 0) + 1;
        }
      });
    });
    const relatedTags = Object.entries(relatedCounts)
      .map(([t, count]) => ({ tag: t, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    res.status(200).json({ tag, count: highlights.length, highlights, relatedTags });
  } catch (error) {
    console.error("❌ Error fetching tag details:", error);
    res.status(500).json({ error: "Failed to fetch tag details." });
  }
});

// GET /api/tags/:name/meta - tag concept metadata
app.get('/api/tags/:name/meta', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const name = req.params.name;

    const meta = await TagMeta.findOne({ name: new RegExp(`^${name}$`, 'i'), userId });
    const pinnedIds = meta?.pinnedHighlightIds || [];

    let pinnedHighlights = [];
    if (pinnedIds.length > 0) {
      pinnedHighlights = await Article.aggregate([
        { $match: { userId } },
        { $unwind: '$highlights' },
        { $match: { 'highlights._id': { $in: pinnedIds } } },
        { $project: {
            _id: '$highlights._id',
            text: '$highlights.text',
            tags: '$highlights.tags',
            articleTitle: '$title',
            articleId: '$_id',
            createdAt: '$highlights.createdAt'
        } }
      ]);
    }

    // related tags
    const relatedAgg = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': name } },
      { $unwind: '$highlights.tags' },
      { $match: { 'highlights.tags': { $ne: name } } },
      { $group: { _id: '$highlights.tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } }
    ]);
    const relatedTags = relatedAgg.map(r => ({ tag: r._id, count: r.count }));

    const countAgg = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': name } },
      { $count: 'total' }
    ]);
    const allHighlightCount = countAgg[0]?.total || 0;

    res.status(200).json({
      name,
      description: meta?.description || '',
      pinnedHighlights,
      relatedTags,
      allHighlightCount,
      pinnedHighlightIds: pinnedIds
    });
  } catch (error) {
    console.error("❌ Error fetching tag meta:", error);
    res.status(500).json({ error: "Failed to fetch tag meta." });
  }
});

// PUT /api/tags/:name/meta - upsert tag meta
app.put('/api/tags/:name/meta', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const name = req.params.name;
    const { description = '', pinnedHighlightIds = [] } = req.body;

    const updated = await TagMeta.findOneAndUpdate(
      { name: new RegExp(`^${name}$`, 'i'), userId },
      { name, description, pinnedHighlightIds },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error updating tag meta:", error);
    res.status(500).json({ error: "Failed to update tag meta." });
  }
});

// GET /api/tags/:name/highlights - all highlights for a tag
app.get('/api/tags/:name/highlights', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const name = req.params.name;
    const highlights = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.tags': name } },
      { $project: {
          _id: '$highlights._id',
          text: '$highlights.text',
          tags: '$highlights.tags',
          articleTitle: '$title',
          articleId: '$_id',
          createdAt: '$highlights.createdAt'
      } },
      { $sort: { createdAt: -1 } }
    ]);
    res.status(200).json(highlights);
  } catch (error) {
    console.error("❌ Error fetching tag highlights:", error);
    res.status(500).json({ error: "Failed to fetch highlights for tag." });
  }
});

// GET /api/highlights/:id/references - notebook entries & collections containing highlight
app.get('/api/highlights/:id/references', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const notebookEntries = await NotebookEntry.find({ userId, linkedHighlightIds: id })
      .select('title updatedAt');
    const collections = await Collection.find({ userId, highlightIds: id })
      .select('name slug');
    res.status(200).json({ notebookEntries, collections });
  } catch (error) {
    console.error("❌ Error fetching highlight references:", error);
    res.status(500).json({ error: "Failed to fetch highlight references." });
  }
});

// GET /api/articles/:id/references - where article's highlights are used
app.get('/api/articles/:id/references', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const article = await Article.findOne({ _id: id, userId }).select('highlights');
    if (!article) {
      return res.status(404).json({ error: "Article not found." });
    }
    const highlightIds = (article.highlights || []).map(h => h._id);
    if (highlightIds.length === 0) {
      return res.status(200).json({ highlightCount: 0, notebookEntries: [], collections: [] });
    }
    const notebookEntries = await NotebookEntry.find({ userId, linkedHighlightIds: { $in: highlightIds } })
      .select('title updatedAt');
    const collections = await Collection.find({ userId, highlightIds: { $in: highlightIds } })
      .select('name slug');
    res.status(200).json({
      highlightCount: highlightIds.length,
      notebookEntries,
      collections
    });
  } catch (error) {
    console.error("❌ Error fetching article references:", error);
    res.status(500).json({ error: "Failed to fetch article references." });
  }
});

// --- SAVED VIEWS CRUD ---
app.get('/api/views', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const views = await SavedView.find({ userId }).sort({ updatedAt: -1 });
    res.status(200).json(views);
  } catch (error) {
    console.error("❌ Error fetching views:", error);
    res.status(500).json({ error: "Failed to fetch views." });
  }
});

app.post('/api/views', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description = '', targetType = 'highlights', filters = {} } = req.body;
    const view = new SavedView({ name, description, targetType, filters, userId });
    await view.save();
    res.status(201).json(view);
  } catch (error) {
    console.error("❌ Error creating view:", error);
    res.status(500).json({ error: "Failed to create view." });
  }
});

app.get('/api/views/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const view = await SavedView.findOne({ _id: req.params.id, userId });
    if (!view) return res.status(404).json({ error: "View not found." });
    res.status(200).json(view);
  } catch (error) {
    console.error("❌ Error fetching view:", error);
    res.status(500).json({ error: "Failed to fetch view." });
  }
});

app.put('/api/views/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, targetType, filters } = req.body;
    const updated = await SavedView.findOneAndUpdate(
      { _id: req.params.id, userId },
      { name, description, targetType, filters },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "View not found." });
    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error updating view:", error);
    res.status(500).json({ error: "Failed to update view." });
  }
});

app.delete('/api/views/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const deleted = await SavedView.findOneAndDelete({ _id: req.params.id, userId });
    if (!deleted) return res.status(404).json({ error: "View not found." });
    res.status(200).json({ message: "View deleted." });
  } catch (error) {
    console.error("❌ Error deleting view:", error);
    res.status(500).json({ error: "Failed to delete view." });
  }
});

// Execute a saved view
app.get('/api/views/:id/run', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const view = await SavedView.findOne({ _id: req.params.id, userId });
    if (!view) return res.status(404).json({ error: "View not found." });

    const { targetType, filters = {} } = view;
    const { tags = [], textQuery = '', dateFrom, dateTo, folders = [] } = filters;
    const regex = textQuery ? new RegExp(textQuery, 'i') : null;
    const dateFilter = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) dateFilter.$lte = new Date(dateTo);

    let items = [];

    if (targetType === 'articles') {
      const pipeline = [
        { $match: { userId: new mongoose.Types.ObjectId(userId) } }
      ];
      if (folders && folders.length > 0) {
        pipeline.push({ $match: { $or: [{ folder: { $in: folders.map(f => new mongoose.Types.ObjectId(f)) } }, { folder: { $exists: false } }] } });
      }
      if (regex) {
        pipeline.push({ $match: { $or: [{ title: regex }, { content: regex }] } });
      }
      if (tags && tags.length > 0) {
        pipeline.push({ $unwind: '$highlights' });
        pipeline.push({ $match: { 'highlights.tags': { $in: tags } } });
        pipeline.push({
          $group: {
            _id: '$_id',
            title: { $first: '$title' },
            url: { $first: '$url' },
            createdAt: { $first: '$createdAt' },
            updatedAt: { $first: '$updatedAt' }
          }
        });
      }
      if (Object.keys(dateFilter).length > 0) {
        pipeline.push({ $match: { createdAt: dateFilter } });
      }
      items = await Article.aggregate(pipeline);
    } else if (targetType === 'notebook') {
      const query = { userId };
      if (regex) query.$or = [{ title: regex }, { content: regex }];
      if (tags && tags.length > 0) query.tags = { $in: tags };
      if (Object.keys(dateFilter).length > 0) query.createdAt = dateFilter;
      items = await NotebookEntry.find(query).sort({ updatedAt: -1 });
    } else {
      // highlights
      const pipeline = [
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' }
      ];
      if (tags && tags.length > 0) {
        pipeline.push({ $match: { 'highlights.tags': { $in: tags } } });
      }
      if (regex) {
        pipeline.push({ $match: { $or: [{ 'highlights.text': regex }, { 'highlights.note': regex }] } });
      }
      if (Object.keys(dateFilter).length > 0) {
        pipeline.push({ $match: { 'highlights.createdAt': dateFilter } });
      }
      pipeline.push({
        $project: {
          _id: '$highlights._id',
          text: '$highlights.text',
          note: '$highlights.note',
          tags: '$highlights.tags',
          createdAt: '$highlights.createdAt',
          articleId: '$_id',
          articleTitle: '$title'
        }
      });
      items = await Article.aggregate(pipeline);
    }

    res.status(200).json({ targetType, items });
  } catch (error) {
    console.error("❌ Error running view:", error);
    res.status(500).json({ error: "Failed to run view." });
  }
});

// Aggregate "today" endpoint (optional wrapper)
app.get('/api/today', authenticateToken, async (req, res) => {
  try {
    const tokenUser = req.user; // just to reflect auth
    // Reuse existing endpoints via internal calls to Mongo
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const now = new Date();
    const cutoff7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const resurfacePromise = Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $project: {
          _id: '$highlights._id',
          text: '$highlights.text',
          tags: '$highlights.tags',
          articleTitle: '$title',
          articleId: '$_id',
          createdAt: '$highlights.createdAt'
      } },
      { $sample: { size: 5 } }
    ]);

    const journeyPromise = Article.find({ userId }).sort({ createdAt: -1 }).limit(5).select('title createdAt url');

    const notebookPromise = NotebookEntry.find({ userId }).sort({ updatedAt: -1 }).limit(3).select('title updatedAt');

    const brainPromise = Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $unwind: '$highlights.tags' },
      { $group: { _id: '$highlights.tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 5 }
    ]);

    const [resurfacedHighlights, recentArticles, recentNotebookEntries, topTagsAgg] = await Promise.all([
      resurfacePromise,
      journeyPromise,
      notebookPromise,
      brainPromise
    ]);

    res.status(200).json({
      resurfacedHighlights,
      recentArticles,
      recentNotebookEntries,
      brainSummary: {
        topTags: topTagsAgg.map(t => ({ tag: t._id, count: t.count }))
      }
    });
  } catch (error) {
    console.error("❌ Error building today snapshot:", error);
    res.status(500).json({ error: "Failed to load today snapshot." });
  }
});

// --- EXPORT JSON ---
app.get('/api/export/json', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [articles, notebookEntries, collections, tagsMeta] = await Promise.all([
      Article.find({ userId }).lean(),
      NotebookEntry.find({ userId }).lean(),
      Collection.find({ userId }).lean(),
      TagMeta.find({ userId }).lean()
    ]);

    // Flatten highlights across articles for convenience
    const highlights = [];
    articles.forEach(a => {
      (a.highlights || []).forEach(h => {
        highlights.push({
          _id: h._id,
          text: h.text,
          note: h.note,
          tags: h.tags,
          createdAt: h.createdAt,
          articleId: a._id,
          articleTitle: a.title
        });
      });
    });

    const payload = {
      exportedAt: new Date().toISOString(),
      articles,
      highlights,
      notebookEntries,
      collections,
      tagsMeta
    };

    res.status(200).json(payload);
  } catch (error) {
    console.error("❌ Error exporting data:", error);
    res.status(500).json({ error: "Failed to export data." });
  }
});

// --- EXPORT PDF ZIP (per-item PDFs) ---
app.get('/api/export/pdf-zip', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [articles, notebookEntries, collections, tagsMeta] = await Promise.all([
      Article.find({ userId }).lean(),
      NotebookEntry.find({ userId }).lean(),
      Collection.find({ userId }).lean(),
      TagMeta.find({ userId }).lean()
    ]);

    const highlights = [];
    articles.forEach(a => {
      (a.highlights || []).forEach(h => {
        highlights.push({
          _id: h._id,
          text: h.text,
          note: h.note,
          tags: h.tags,
          createdAt: h.createdAt,
          articleId: a._id,
          articleTitle: a.title
        });
      });
    });

    const slugify = (str) => {
      const base = (str || 'untitled').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return base || 'item';
    };

    const makePdfBuffer = async (title, lines = []) => {
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, margins: { top: 50, bottom: 50, left: 50, right: 50 } });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.addPage();
        doc.fontSize(18).text(title || 'Untitled', { underline: false });
        doc.moveDown();
        doc.fontSize(11);
        lines.forEach((line) => {
          doc.text(line || '', { lineGap: 4 });
          doc.moveDown(0.3);
        });
        doc.end();
      });
    };

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="note-taker-export-pdfs.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('❌ Error building PDF zip:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to build PDF export.' });
      } else {
        res.end();
      }
    });
    archive.pipe(res);

    const articleTitleMap = new Map();
    articles.forEach(a => articleTitleMap.set(a._id.toString(), a.title || 'Untitled article'));

    // Articles
    for (const a of articles) {
      const lines = [
        `URL: ${a.url || 'n/a'}`,
        `Folder ID: ${a.folder || 'none'}`,
        `Created: ${a.createdAt ? new Date(a.createdAt).toLocaleString() : 'n/a'}`,
        `Updated: ${a.updatedAt ? new Date(a.updatedAt).toLocaleString() : 'n/a'}`,
        '',
        'Content:',
        (a.content || '').slice(0, 4000)
      ];
      const buf = await makePdfBuffer(a.title || 'Article', lines);
      archive.append(buf, { name: `articles/${slugify(a.title)}-${a._id}.pdf` });
    }

    // Highlights
    for (const h of highlights) {
      const lines = [
        `Article: ${h.articleTitle || 'Untitled'}`,
        `Created: ${h.createdAt ? new Date(h.createdAt).toLocaleString() : 'n/a'}`,
        `Tags: ${(h.tags || []).join(', ') || 'none'}`,
        '',
        'Text:',
        h.text || '',
        '',
        'Note:',
        h.note || 'No note.'
      ];
      const buf = await makePdfBuffer('Highlight', lines);
      archive.append(buf, { name: `highlights/${slugify(h.articleTitle)}-${h._id}.pdf` });
    }

    // Notebook entries
    for (const n of notebookEntries) {
      const lines = [
        `Created: ${n.createdAt ? new Date(n.createdAt).toLocaleString() : 'n/a'}`,
        `Updated: ${n.updatedAt ? new Date(n.updatedAt).toLocaleString() : 'n/a'}`,
        '',
        n.content || 'No content.'
      ];
      const buf = await makePdfBuffer(n.title || 'Notebook Entry', lines);
      archive.append(buf, { name: `notebook/${slugify(n.title)}-${n._id}.pdf` });
    }

    // Collections
    for (const c of collections) {
      const lines = [
        `Description: ${c.description || ''}`,
        `Article IDs: ${(c.articleIds || []).join(', ') || 'none'}`,
        `Highlight IDs: ${(c.highlightIds || []).join(', ') || 'none'}`,
        `Created: ${c.createdAt ? new Date(c.createdAt).toLocaleString() : 'n/a'}`
      ];
      const buf = await makePdfBuffer(c.name || 'Collection', lines);
      archive.append(buf, { name: `collections/${slugify(c.name)}-${c._id}.pdf` });
    }

    // Tag metadata
    for (const t of tagsMeta) {
      const lines = [
        `Description: ${t.description || ''}`,
        `Pinned highlights: ${(t.pinnedHighlightIds || []).length}`,
        `Created: ${t.createdAt ? new Date(t.createdAt).toLocaleString() : 'n/a'}`
      ];
      const buf = await makePdfBuffer(t.name || 'Tag', lines);
      archive.append(buf, { name: `tags/${slugify(t.name)}-${t._id}.pdf` });
    }

    archive.finalize();
  } catch (error) {
    console.error("❌ Error exporting PDF zip:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to export PDF bundle." });
    }
  }
});

// GET /api/brain/summary - surface patterns from highlights/articles (non-AI)
app.get('/api/brain/summary', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const now = new Date();
    const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const cutoff14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Top tags (last 30 days)
    const topTagsAgg = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.createdAt': { $gte: cutoff30 } } },
      { $unwind: '$highlights.tags' },
      { $group: { _id: '$highlights.tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 5 },
      { $project: { _id: 0, tag: '$_id', count: 1 } }
    ]);

    // Most highlighted articles (last 30 days)
    const mostHighlightedAgg = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.createdAt': { $gte: cutoff30 } } },
      { $group: { _id: '$_id', title: { $first: '$title' }, count: { $sum: 1 } } },
      { $sort: { count: -1, title: 1 } },
      { $limit: 5 },
      { $project: { _id: 0, articleId: '$_id', title: 1, count: 1 } }
    ]);

    // Recent highlights (10 newest)
    const recentHighlights = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $sort: { 'highlights.createdAt': -1 } },
      { $limit: 10 },
      { $project: {
          _id: 0,
          text: '$highlights.text',
          tags: '$highlights.tags',
          articleTitle: '$title',
          articleId: '$_id',
          createdAt: '$highlights.createdAt'
      } }
    ]);

    // Tag correlations (last 30 days) computed in memory for clarity
    const highlightsForPairs = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.createdAt': { $gte: cutoff30 } } },
      { $project: { tags: '$highlights.tags' } }
    ]);

    const pairCounts = {};
    highlightsForPairs.forEach(h => {
      const tags = Array.isArray(h.tags) ? [...new Set(h.tags.filter(Boolean))] : [];
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const a = tags[i];
          const b = tags[j];
          if (!a || !b) continue;
          const [tagA, tagB] = a.localeCompare(b) <= 0 ? [a, b] : [b, a];
          const key = `${tagA}:::${tagB}`;
          pairCounts[key] = (pairCounts[key] || 0) + 1;
        }
      }
    });
    const tagCorrelations = Object.entries(pairCounts)
      .map(([key, count]) => {
        const [tagA, tagB] = key.split(':::');
        return { tagA, tagB, count };
      })
      .sort((a, b) => b.count - a.count || a.tagA.localeCompare(b.tagA))
      .slice(0, 20);

    // Reading streak: days with at least 1 highlight in last 14 days
    const streakAgg = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $match: { 'highlights.createdAt': { $gte: cutoff14 } } },
      { $project: {
          day: {
            $dateToString: { format: "%Y-%m-%d", date: '$highlights.createdAt' }
          }
      } },
      { $group: { _id: '$day', count: { $sum: 1 } } }
    ]);
    const readingStreaks = streakAgg.length;

    res.status(200).json({
      topTags: topTagsAgg,
      mostHighlightedArticles: mostHighlightedAgg,
      recentHighlights,
      tagCorrelations,
      readingStreaks
    });
  } catch (error) {
    console.error("❌ Error building brain summary:", error);
    res.status(500).json({ error: "Failed to build brain summary." });
  }
});

// GET /api/journey?range=30d - article activity snapshot
app.get('/api/journey', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const range = (req.query.range || '30d').toLowerCase();
    const rangeDays = { '7d': 7, '30d': 30, '90d': 90 };
    const days = rangeDays[range] || null;
    const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

    const pipeline = [
      { $match: { userId } },
      { $unwind: '$highlights' }
    ];

    if (cutoff) {
      pipeline.push({ $match: { 'highlights.createdAt': { $gte: cutoff } } });
    }

    pipeline.push({
      $group: {
        _id: '$_id',
        title: { $first: '$title' },
        url: { $first: '$url' },
        createdAt: { $first: '$createdAt' },
        highlightCount: { $sum: 1 },
        tags: { $push: '$highlights.tags' }
      }
    });

    pipeline.push({ $sort: { highlightCount: -1, createdAt: -1 } });

    const aggregated = await Article.aggregate(pipeline);

    const results = aggregated.map(doc => {
      const flatTags = (doc.tags || []).flat().filter(Boolean);
      const counts = {};
      flatTags.forEach(t => {
        counts[t] = (counts[t] || 0) + 1;
      });
      const topTags = Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([tag]) => tag);

      return {
        _id: doc._id,
        title: doc.title,
        url: doc.url,
        createdAt: doc.createdAt,
        highlightCount: doc.highlightCount,
        topTags
      };
    });

    res.status(200).json(results);
  } catch (error) {
    console.error("❌ Error building journey feed:", error);
    res.status(500).json({ error: "Failed to load journey." });
  }
});

// --- COLLECTIONS ---
// GET /api/collections
app.get('/api/collections', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const collections = await Collection.find({ userId }).sort({ updatedAt: -1 });
    res.status(200).json(collections);
  } catch (error) {
    console.error("❌ Error fetching collections:", error);
    res.status(500).json({ error: "Failed to fetch collections." });
  }
});

// POST /api/collections
app.post('/api/collections', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description = '', slug, articleIds = [], highlightIds = [] } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required." });
    const computedSlug = slug ? slugify(slug) : slugify(name);
    const newCollection = new Collection({
      name: name.trim(),
      description: description.trim(),
      slug: computedSlug,
      articleIds,
      highlightIds,
      userId
    });
    await newCollection.save();
    res.status(201).json(newCollection);
  } catch (error) {
    console.error("❌ Error creating collection:", error);
    if (error.code === 11000) {
      return res.status(409).json({ error: "Slug already exists." });
    }
    res.status(500).json({ error: "Failed to create collection." });
  }
});

// GET /api/collections/:slug
app.get('/api/collections/:slug', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { slug } = req.params;
    const collection = await Collection.findOne({ slug, userId });
    if (!collection) {
      return res.status(404).json({ error: "Collection not found." });
    }

    const articles = await Article.find({ _id: { $in: collection.articleIds }, userId })
      .select('title url createdAt highlights');

    const highlightIdSet = new Set((collection.highlightIds || []).map(id => id.toString()));
    let highlights = [];
    if (highlightIdSet.size > 0) {
      const highlightAgg = await Article.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $unwind: '$highlights' },
        { $match: { 'highlights._id': { $in: Array.from(highlightIdSet).map(id => new mongoose.Types.ObjectId(id)) } } },
        { $project: {
            _id: '$highlights._id',
            text: '$highlights.text',
            tags: '$highlights.tags',
            articleTitle: '$title',
            articleId: '$_id',
            createdAt: '$highlights.createdAt'
        } }
      ]);
      highlights = highlightAgg;
    }

    res.status(200).json({
      collection,
      articles: articles.map(a => ({
        _id: a._id,
        title: a.title,
        url: a.url,
        createdAt: a.createdAt,
        highlightCount: (a.highlights || []).length
      })),
      highlights
    });
  } catch (error) {
    console.error("❌ Error fetching collection detail:", error);
    res.status(500).json({ error: "Failed to fetch collection." });
  }
});

// PUT /api/collections/:id
app.put('/api/collections/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, description, slug, articleIds, highlightIds } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description.trim();
    if (slug !== undefined) updates.slug = slugify(slug || name || '');
    if (articleIds !== undefined) updates.articleIds = articleIds;
    if (highlightIds !== undefined) updates.highlightIds = highlightIds;

    const updated = await Collection.findOneAndUpdate(
      { _id: id, userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: "Collection not found." });
    res.status(200).json(updated);
  } catch (error) {
    console.error("❌ Error updating collection:", error);
    if (error.code === 11000) {
      return res.status(409).json({ error: "Slug already exists." });
    }
    res.status(500).json({ error: "Failed to update collection." });
  }
});

// DELETE /api/collections/:id
app.delete('/api/collections/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const deleted = await Collection.findOneAndDelete({ _id: id, userId });
    if (!deleted) return res.status(404).json({ error: "Collection not found." });
    res.status(200).json({ message: "Collection deleted." });
  } catch (error) {
    console.error("❌ Error deleting collection:", error);
    res.status(500).json({ error: "Failed to delete collection." });
  }
});

// --- RESURFACE HIGHLIGHTS (random sample) ---
app.get('/api/resurface', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // Count total highlights for this user
    const countAgg = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $count: 'total' }
    ]);
    const totalHighlights = countAgg[0]?.total || 0;

    if (totalHighlights === 0) {
      return res.status(200).json({ dailyRandomHighlights: [] });
    }

    const sampleSize = Math.min(5, totalHighlights);

    const dailyRandomHighlights = await Article.aggregate([
      { $match: { userId } },
      { $unwind: '$highlights' },
      { $project: {
          _id: '$highlights._id',
          text: '$highlights.text',
          tags: '$highlights.tags',
          articleTitle: '$title',
          articleId: '$_id',
          createdAt: '$highlights.createdAt'
      } },
      { $sample: { size: sampleSize } }
    ]);

    res.status(200).json({ dailyRandomHighlights });
  } catch (error) {
    console.error("❌ Error building resurface feed:", error);
    res.status(500).json({ error: "Failed to load resurfacing highlights." });
  }
});

// POST /articles/:id/highlights - MODIFIED FOR USER AUTHENTICATION
app.post('/articles/:id/highlights', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { text, note, tags } = req.body;
    const userId = req.user.id; // Get user ID from authenticated token

    if (!text) {
      return res.status(400).json({ error: "Highlight text is required." });
    }

    const newHighlight = {
        text,
        note: note || '',
        tags: tags || []
    };

    // Find article by ID AND ensure it belongs to the authenticated user
    const updatedArticle = await Article.findOneAndUpdate(
      { _id: id, userId: userId },
      { $push: { highlights: newHighlight } },
      { new: true, populate: ['highlights', 'folder'] } // Populate highlights and folder for full response
    );

    if (!updatedArticle) {
      return res.status(404).json({ error: "Article not found or you do not have permission to add highlight." });
    }
    res.status(200).json(updatedArticle);
  } catch (error) {
    console.error("❌ Error adding highlight:", error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: "Invalid article ID format." });
    }
    res.status(500).json({ error: "Failed to add highlight.", details: error.message });
  }
});

// PATCH /articles/:articleId/highlights/:highlightId: Update a specific highlight - MODIFIED FOR USER AUTHENTICATION
app.patch('/articles/:articleId/highlights/:highlightId', authenticateToken, async (req, res) => {
  try {
      const { articleId, highlightId } = req.params;
      const { note, tags } = req.body;
      const userId = req.user.id;

      // Find the article by ID AND ensure it belongs to the authenticated user
      const article = await Article.findOne({ _id: articleId, userId: userId });
      if (!article) {
          return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
      }

      // Find the highlight within the article's highlights array
      const highlight = article.highlights.id(highlightId);
      if (!highlight) {
          return res.status(404).json({ error: "Highlight not found in this article." });
      }

      // Update its properties
      highlight.note = note !== undefined ? note : highlight.note;
      highlight.tags = tags !== undefined ? tags : highlight.tags;

      await article.save();

      // Return just the updated highlight with article info
      const refreshed = await Article.findById(articleId);
      const updatedHighlight = refreshed.highlights.id(highlightId);
      res.status(200).json({
        _id: updatedHighlight._id,
        articleId: refreshed._id,
        articleTitle: refreshed.title,
        text: updatedHighlight.text,
        note: updatedHighlight.note,
        tags: updatedHighlight.tags,
        createdAt: updatedHighlight.createdAt
      });
  } catch (error) {
      console.error("❌ Error updating highlight:", error);
      if (error.name === 'CastError') {
          return res.status(400).json({ error: "Invalid ID format." });
      }
      res.status(500).json({ error: "Failed to update highlight.", details: error.message });
  }
});

// DELETE /articles/:articleId/highlights/:highlightId: Delete a specific highlight - MODIFIED FOR USER AUTHENTICATION
app.delete('/articles/:articleId/highlights/:highlightId', authenticateToken, async (req, res) => {
  try {
      const { articleId, highlightId } = req.params;
      const userId = req.user.id;

      // Find the article by ID AND ensure it belongs to the authenticated user
      const article = await Article.findOne({ _id: articleId, userId: userId });
      if (!article) {
          return res.status(404).json({ error: "Article not found or you do not have permission to modify it." });
      }

      // Use Mongoose's .pull() method to remove the subdocument
      article.highlights.pull(highlightId);
      await article.save();

      // Re-fetch and populate to ensure correct response
      const updatedArticle = await Article.findById(articleId).populate('folder');
      res.status(200).json(updatedArticle);
  } catch (error) {
      console.error("❌ Error deleting highlight:", error);
      if (error.name === 'CastError') {
          return res.status(400).json({ error: "Invalid ID format." });
      }
      res.status(500).json({ error: "Failed to delete highlight.", details: error.message });
  }
});

// --- HEALTH CHECK ENDPOINT to prevent cold starts ---
app.get("/health", (req, res) => {
  // This route does nothing but send a success status.
  // It's a lightweight way for a pinging service to keep the server alive.
  console.log("Health check ping received.");
  res.status(200).json({ status: "ok", message: "Server is warm." });
});

// Root endpoint for health check
app.get('/', (req, res) => res.send('✅ Note Taker backend is running!'));

// Start the server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
