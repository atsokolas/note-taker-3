// server.js - FINAL PRODUCTION VERSION

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config(); 

const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("✅ MongoDB connected successfully."))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// --- SCHEMA & MODEL ---
const articleSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  title: String,
  content: String,
  highlights: [{ 
      text: String, 
      note: String, 
      tags: [String],
      createdAt: { type: Date, default: Date.now }
  }],
}, { timestamps: true });

const Article = mongoose.model('Article', articleSchema);


// --- API ROUTES ---

// POST /save-article: Saves or updates an entire article.
app.post("/save-article", async (req, res) => {
  console.log("✅ /save-article route hit.");
  try {
    const { title, url, content } = req.body;
    if (!title || !url) {
      return res.status(400).json({ error: "Missing required fields: title and url." });
    }
    const updatedArticle = await Article.findOneAndUpdate(
      { url: url },
      { title: title, content: content || '', $setOnInsert: { highlights: [] } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log("✅ Database operation successful for /save-article. ID:", updatedArticle._id);
    res.status(200).json(updatedArticle);
  } catch (error) {
    console.error("❌ Error in /save-article:", error);
    res.status(500).json({ error: "Internal server error.", details: error.message });
  }
});

// GET /get-articles: Gets a list of all saved articles. THIS IS THE MISSING ROUTE.
app.get('/get-articles', async (req, res) => {
    console.log("✅ /get-articles route hit.");
    try {
      const articles = await Article.find({}).select('title url createdAt').sort({createdAt: -1});
      res.json(articles);
    } catch (err) {
      console.error("❌ Failed to fetch articles:", err);
      res.status(500).json({ error: "Failed to fetch articles" });
    }
});

// GET /highlights: Gets all highlights for a specific article URL.
app.get('/highlights', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL query param is required' });
  try {
    const article = await Article.findOne({ url });
    res.json({ highlights: article ? article.highlights : [] });
  } catch (error) {
    console.error('❌ Error fetching highlights:', error);
    res.status(500).json({ error: 'Failed to fetch highlights' });
  }
});

// POST /save-highlight: Adds a new highlight to an existing article.
app.post('/save-highlight', async (req, res) => {
    const { url, highlight } = req.body;
    if (!url || !highlight || !highlight.text) {
        return res.status(400).json({ error: 'URL and highlight object with text are required.' });
    }
    try {
        const updatedArticle = await Article.findOneAndUpdate(
            { url: url },
            { $push: { highlights: highlight } },
            { new: true }
        );
        if (!updatedArticle) {
            return res.status(404).json({ error: "Article not found to add highlight to." });
        }
        res.status(201).json(updatedArticle);
    } catch (err) {
        console.error("❌ Error saving highlight:", err);
        res.status(500).json({ error: "Failed to save highlight" });
    }
});
  
// Health check route
app.get('/', (req, res) => {
  res.send('✅ Note Taker backend is running!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
