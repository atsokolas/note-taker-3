const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' }); // Adjust path if needed

const app = express();

const PORT = process.env.PORT || 3000;

// CORS – allow your front-end domain
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// Middleware
app.use(express.json({ limit: '5mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
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

app.post("/save-article", async (req, res) => {
  try {
    console.log("📥 Incoming article payload:", req.body); // Log the incoming body

    const { title, url, content, highlights } = req.body;

    // Validate input
    if (!title || !url || !content) {
      console.warn("⚠️ Missing required fields in request body");
      return res.status(400).json({ error: "Missing required fields: title, url, and content are mandatory." });
    }

    // Save or update article in the DB
    const updatedArticle = await Article.findOneAndUpdate(
      { url },
      { title, content, highlights: highlights || [] },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log("✅ Article saved:", updatedArticle);
    res.status(200).json(updatedArticle);

  } catch (error) {
    console.error("❌ Error in /save-article:", error.message);
    res.status(500).json({ error: "Internal server error." });
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

// This new route matches the POST /articles/:id/highlights request from your frontend
app.post('/articles/:id/highlights', async (req, res) => {
  try {
    // Get the article's unique ID from the URL parameters
    const { id } = req.params; 

    // Get the text of the new highlight directly from the request body
    const newHighlightData = req.body;

    const newHighlight = {
      text: newHighlightData.text,
      note: newHighlightData.note || "",
      tags: newHighlightData.tags || [],
      createdAt: new Date().toISOString()
    };

    // Find the article by its ID and push the new highlight into its 'highlights' array
    const updatedArticle = await Article.findByIdAndUpdate(
      id,
      { $push: { highlights: newHighlight } },
      { new: true } // This option returns the updated document
    );

    if (!updatedArticle) {
      return res.status(404).json({ error: "Article not found" });
    }

    // Success! Send back the entire updated article.
    res.status(201).json(updatedArticle); 

  } catch (err) {
    console.error("❌ Error saving highlight:", err);
    res.status(500).json({ error: "Failed to save highlight" });
  }
});


// This new route matches the GET /articles/:id request from your frontend
app.get('/articles/:id', async (req, res) => {
  try {
    // Get the 'id' from the URL parameters instead of a query string
    const { id } = req.params;

    // Use Mongoose's findById to look for the article by its primary key
    const article = await mongoose.model('Article').findById(id);

    if (!article) {
      // If no article is found with that ID, send a 404
      return res.status(404).json({ error: "Article not found" });
    }

    // If found, send the article data back
    res.json(article);
  } catch (err) {
    console.error("❌ Error fetching article by ID:", err);
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