const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' }); // Adjust path if needed

const app = express();

const PORT = process.env.PORT || 3000;

// CORS – allow your front-end domain
app.use(cors({
  origin: "https://note-taker-3-1.onrender.com", // Change to your actual frontend URL
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// Middleware
app.use(express.json({ limit: '5mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// Your routes go here
// Example:
// const articleRoutes = require('./routes/articles');
// app.use('/articles', articleRoutes);

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
app.post("/save-article", async (req, res) => {
    const { title, url, content, highlights } = req.body;
  
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }
    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }
    
    // Validate highlights
    const highlightsToSave = Array.isArray(highlights) ? highlights : [];
  
    try {
      const article = await Article.findOneAndUpdate(
        { url },
        { title, content, highlights: highlightsToSave },
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

app.post('/save-highlight', async (req, res) => {
    const { url, highlight } = req.body;
  
    console.log('📥 Incoming highlight save request:', req.body);
  
    if (!url || !highlight) {
      console.error('❌ Missing url or highlight:', { url, highlight });
      return res.status(400).json({ error: "URL and highlight are required" });
    }
  
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

  app.get('/get-article', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "URL is required" });
  
    try {
      const article = await Article.findOne({ url });
      if (!article) return res.status(404).json({ error: "Article not found" });
  
      res.json(article); // Includes title, content, highlights
    } catch (err) {
      console.error("❌ Error fetching article:", err);
      res.status(500).json({ error: "Failed to fetch article" });
    }
  });

  // Get all articles
app.get('/get-articles', async (req, res) => {
    try {
      const articles = await Article.find({});
      res.json(articles);
    } catch (err) {
      console.error("❌ Failed to fetch articles:", err);
      res.status(500).json({ error: "Failed to fetch articles" });
    }
  });
  
// Health check
app.get('/', (req, res) => {
  res.send('✅ Note Taker backend is running!');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});