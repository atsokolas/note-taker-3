const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' }); // Adjust path as needed

const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(express.json({ limit: '5mb' }));

// --- CORS (Open to all origins — dev only) ---
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// --- SCHEMA & MODEL ---
const articleSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  title: String,
  content: String,
  highlights: [
    {
      text: String,
      note: String,
      tags: [String],
    }
  ],
});
const Article = mongoose.model('Article', articleSchema);

// --- ROUTES ---

// Save or update an article and its highlights
app.post('/save-article', async (req, res) => {
  const { title, url, content, highlights = [] } = req.body;

  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    const article = await Article.findOneAndUpdate(
      { url },
      { title, content, highlights },
      { upsert: true, new: true }
    );
    res.json({ success: true, article });
  } catch (error) {
    console.error("❌ Error saving article:", error);
    res.status(500).json({ error: "Failed to save article" });
  }
});

// Get highlights for a given article
app.get('/highlights', async (req, res) => {
  const { url } = req.query;

  if (!url) return res.status(400).json({ error: 'URL query param is required' });

  try {
    const article = await Article.findOne({ url });
    if (!article) {
      return res.status(404).json({ highlights: [] });
    }
    res.json({ highlights: article.highlights });
  } catch (error) {
    console.error('❌ Error fetching highlights:', error);
    res.status(500).json({ error: 'Failed to fetch highlights' });
  }
});

// Add this in server.js
app.post('/save-highlight', async (req, res) => {
    const { url, highlight } = req.body;
  
    if (!url || !highlight) return res.status(400).json({ error: "URL and highlight are required" });
  
    try {
      const article = await Article.findOneAndUpdate(
        { url },
        { $push: { highlights: highlight } },
        { new: true }
      );
      res.json({ success: true, article });
    } catch (error) {
      console.error("❌ Error saving highlight:", error);
      res.status(500).json({ error: "Failed to save highlight" });
    }
  });

// Health check
app.get('/', (req, res) => {
  res.send('✅ Note Taker backend is running!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});