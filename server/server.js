// server.js - UPDATED WITH FOLDER FUNCTIONALITY

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config(); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("✅ MongoDB connected successfully."))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// --- NEW: FOLDER SCHEMA & MODEL ---
const folderSchema = new mongoose.Schema({
    name: { type: String, required: true },
    // In the future, you'll link this to a user
    // userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

const Folder = mongoose.model('Folder', folderSchema);

// --- UPDATED: ARTICLE SCHEMA ---
const articleSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  title: String,
  content: String,
  // Add a reference to the Folder model
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

// POST /save-article: Now accepts an optional folderId
app.post("/save-article", async (req, res) => {
  try {
    // We now expect an optional folderId in the request
    const { title, url, content, folderId } = req.body; 
    if (!title || !url) {
      return res.status(400).json({ error: "Missing required fields: title and url." });
    }

    const articleData = {
        title: title,
        content: content || '',
        folder: folderId || null, // Assign the folderId here
        $setOnInsert: { highlights: [] }
    };

    const updatedArticle = await Article.findOneAndUpdate({ url: url }, articleData, {
      upsert: true, new: true, setDefaultsOnInsert: true
    });
    res.status(200).json(updatedArticle);
  } catch (error) {
    console.error("❌ Error in /save-article:", error);
    res.status(500).json({ error: "Internal server error.", details: error.message });
  }
});

// --- NEW: FOLDER API ROUTES ---

// GET /folders: Fetches all created folders
app.get('/folders', async (req, res) => {
    try {
        const folders = await Folder.find({}).sort({ name: 1 }); // Sort alphabetically
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


// --- EXISTING ARTICLE/HIGHLIGHT ROUTES ---

app.get('/get-articles', async (req, res) => {
    try {
      // We now also populate the folder information for each article
      const articles = await Article.find({}).populate('folder').select('title url createdAt folder').sort({createdAt: -1});
      res.json(articles);
    } catch (err) {
      console.error("❌ Failed to fetch articles:", err);
      res.status(500).json({ error: "Failed to fetch articles" });
    }
});

app.get('/articles/:id', async (req, res) => { /* ... no changes needed here yet ... */ });
app.post('/articles/:id/highlights', async (req, res) => { /* ... no changes needed here ... */ });
app.get('/', (req, res) => res.send('✅ Note Taker backend is running!'));
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
