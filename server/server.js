// server.js - FULLY UPDATED WITH FOLDER FUNCTIONALITY, ARTICLE MANAGEMENT, AND FIX FOR GET /articles/:id

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config(); 

const app = express();
const PORT = process.env.PORT || 3000; // Default to 3000 if not set, Render will use its assigned port

app.use(cors({ origin: '*' })); // Allow all origins for simplicity in development
app.use(express.json({ limit: '5mb' })); // Increased limit for potentially larger article content

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true, // Deprecated, but harmless to keep for older Mongoose versions
  useUnifiedTopology: true, // Deprecated, but harmless to keep for older Mongoose versions
}).then(() => console.log("✅ MongoDB connected successfully."))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// --- SCHEMA & MODELS ---

// Folder Schema and Model
const folderSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // Added unique constraint for folder names
}, { timestamps: true });

const Folder = mongoose.model('Folder', folderSchema);

// Article Schema and Model
const articleSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  title: { type: String, required: true }, // Title should ideally be required
  content: String,
  // Reference to the Folder model
  folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  highlights: [{ 
      text: String, 
      note: String, 
      tags: [String],
      createdAt: { type: Date, default: Date.now }
  }],
}, { timestamps: true });

const Article = mongoose.model('Article', articleSchema);


// --- API ROUTES ---

// POST /save-article: Saves a new article or updates an existing one
app.post("/save-article", async (req, res) => {
  try {
    const { title, url, content, folderId } = req.body; 
    if (!title || !url) {
      return res.status(400).json({ error: "Missing required fields: title and url." });
    }

    // Ensure folderId refers to an existing folder if provided
    if (folderId && folderId !== 'null' && folderId !== 'uncategorized') {
      const folderExists = await Folder.findById(folderId);
      if (!folderExists) {
          console.warn(`Attempted to save article with non-existent folderId: ${folderId}`);
          // Option: Proceed with null folder, or return error
          // return res.status(400).json({ error: "Provided folderId does not exist." });
      }
    }

    const articleData = {
        title: title,
        content: content || '',
        folder: (folderId === 'null' || folderId === 'uncategorized' || !folderId) ? null : folderId, // Assign null if invalid/unset
        $setOnInsert: { highlights: [] } // Initialize highlights array only on first insert
    };

    const updatedArticle = await Article.findOneAndUpdate({ url: url }, articleData, {
      upsert: true, // Create if not found, update if found
      new: true, // Return the modified document rather than the original
      setDefaultsOnInsert: true // Apply schema defaults for new documents
    });
    res.status(200).json(updatedArticle);
  } catch (error) {
    console.error("❌ Error in /save-article:", error);
    res.status(500).json({ error: "Internal server error.", details: error.message });
  }
});


// --- FOLDER API ROUTES ---

// GET /folders: Fetches all created folders
app.get('/folders', async (req, res) => {
    try {
        const folders = await Folder.find({}).sort({ name: 1 }); // Sort alphabetically by name
        res.json(folders);
    } catch (err) {
        console.error("❌ Failed to fetch folders:", err);
        res.status(500).json({ error: "Failed to fetch folders" });
    }
});

// POST /folders: Creates a new folder
app.post('/folders', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: "Folder name is required." });
        }
        // Check if folder already exists (case-insensitive)
        const existingFolder = await Folder.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existingFolder) {
            return res.status(409).json({ error: "A folder with this name already exists." });
        }
        const newFolder = new Folder({ name });
        await newFolder.save();
        res.status(201).json(newFolder);
    } catch (err) {
        console.error("❌ Failed to create folder:", err);
        res.status(500).json({ error: "Failed to create folder" });
    }
});

// DELETE /folders/:id: Deletes a specific folder
app.delete('/folders/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Option 1 (chosen): Prevent deletion if the folder contains any articles.
        const articlesInFolder = await Article.countDocuments({ folder: id });
        if (articlesInFolder > 0) {
             return res.status(409).json({ error: "Cannot delete folder with articles. Please move or delete articles first." });
        }

        const result = await Folder.findByIdAndDelete(id);
        if (!result) {
            return res.status(404).json({ error: "Folder not found." });
        }
        res.status(200).json({ message: "Folder deleted successfully." });
    } catch (error) {
        console.error("❌ Error deleting folder:", error);
        // Handle CastError if an invalid ID format is provided
        if (error.name === 'CastError') {
          return res.status(400).json({ error: "Invalid folder ID format." });
        }
        res.status(500).json({ error: "Failed to delete folder.", details: error.message });
    }
});


// --- ARTICLE MANAGEMENT API ROUTES ---

// GET /get-articles: Fetches all articles, populating folder information
app.get('/get-articles', async (req, res) => {
    try {
      // Populate the folder information for each article
      const articles = await Article.find({})
                                   .populate('folder')
                                   .select('title url createdAt folder') // Select specific fields to return
                                   .sort({createdAt: -1}); // Sort by creation date, newest first
      res.json(articles);
    } catch (err) {
      console.error("❌ Failed to fetch articles:", err);
      res.status(500).json({ error: "Failed to fetch articles" });
    }
});

// GET /articles/:id: Fetches a single article by ID (FIXED ROUTE)
app.get('/articles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Populate the folder to send full folder object to frontend
        const article = await Article.findById(id).populate('folder');
        if (!article) {
            return res.status(404).json({ error: "Article not found." });
        }
        res.status(200).json(article);
    } catch (error) {
        console.error("❌ Error fetching single article by ID:", error);
        // Handle CastError specifically for invalid MongoDB IDs
        if (error.name === 'CastError') {
            return res.status(400).json({ error: "Invalid article ID format." });
        }
        res.status(500).json({ error: "Failed to fetch article.", details: error.message });
    }
});

// DELETE /articles/:id: Deletes a specific article
app.delete('/articles/:id', async (req, res) => {
  try {
      const { id } = req.params;
      const result = await Article.findByIdAndDelete(id);
      if (!result) {
          return res.status(404).json({ error: "Article not found." });
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

// PATCH /articles/:id/move: Moves an article to a different folder (or uncategorized)
// Expects: { folderId: "newFolderId" } or { folderId: null }
app.patch('/articles/:id/move', async (req, res) => {
  try {
      const { id } = req.params;
      const { folderId } = req.body; // Can be a folder _id or null/undefined

      // Validate if folderId exists if it's not null/empty/uncategorized
      let targetFolder = null;
      if (folderId && folderId !== 'null' && folderId !== 'uncategorized') { 
          const folderExists = await Folder.findById(folderId);
          if (!folderExists) {
              return res.status(400).json({ error: "Provided folderId does not exist." });
          }
          targetFolder = folderId; // Use the actual ID if it exists
      }

      const updatedArticle = await Article.findByIdAndUpdate(
          id,
          { folder: targetFolder }, // Set to null or the actual ID
          { new: true, populate: 'folder' } // Return the updated article with populated folder
      );

      if (!updatedArticle) {
          return res.status(404).json({ error: "Article not found." });
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

// POST /articles/:id/highlights: Adds a new highlight to an article
app.post('/articles/:id/highlights', async (req, res) => {
  try {
    const { id } = req.params;
    const { text, note, tags } = req.body; // Add note and tags if you expand highlight schema
    
    if (!text) {
      return res.status(400).json({ error: "Highlight text is required." });
    }

    const newHighlight = { text, note: note || '', tags: tags || [] };

    const updatedArticle = await Article.findByIdAndUpdate(
      id,
      { $push: { highlights: newHighlight } }, // Use $push to add to array
      { new: true } // Return the updated document
    );

    if (!updatedArticle) {
      return res.status(404).json({ error: "Article not found." });
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


// Root endpoint for health check
app.get('/', (req, res) => res.send('✅ Note Taker backend is running!'));

// Start the server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
