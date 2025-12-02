const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

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

// GET /api/trending - Get a list of the most recommended articles
app.get('/api/trending', async (req, res) => {
  try {
      const trendingArticles = await Recommendation.aggregate([
          // Group documents by articleUrl and count how many times each appears
          { $group: {
              _id: "$articleUrl",
              recommendationCount: { $sum: 1 },
              articleTitle: { $first: "$articleTitle" } // Get the title from the first document in each group
          }},
          // Sort by the count in descending order
          { $sort: { recommendationCount: -1 } },
          // Limit to the top 10 results
          { $limit: 10 }
      ]);

      res.status(200).json(trendingArticles);

  } catch (error) {
      console.error("❌ Error fetching trending articles:", error);
      res.status(500).json({ error: "Internal server error." });
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

      // Re-fetch and populate to ensure correct response
      const updatedArticle = await Article.findById(articleId).populate('folder');
      res.status(200).json(updatedArticle);
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
