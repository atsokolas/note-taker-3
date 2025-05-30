// server.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' }); // if your .env is one level up

const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---

// Enable CORS for all origins (development-safe)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch((err) => console.error('❌ MongoDB connection error:', err));

// --- SCHEMA & MODEL ---
const articleSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  content: String,
  highlights: [
    {
      text: String,
      note: String,
      tags: [String]
    }
  ]
});

const Article = mongoose.model('Article', articleSchema);

// --- ROUTES ---

// ✅ Save or update article with highlights
app.post('/articles', async (req, res) => {
  const { url, content, highlights } = req.body;

  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const updated = await Article.findOneAndUpdate(
      { url },
      { content, highlights },
      { upsert: true, new: true }
    );

    res.json({ success: true, article: updated });
  } catch (error) {
    console.error('❌ Error saving article:', error);
    res.status(500).json({ error: 'Failed to save article' });
  }
});

// ✅ Get highlights for a specific article
app.get('/highlights', async (req, res) => {
  const { url } = req.query;

  if (!url) return res.status(400).json({ error: 'URL query param is required' });

  try {
    const article = await Article.findOne({ url });

    if (!article) {
      console.warn(`🔍 No article found for URL: ${url}`);
      return res.status(404).json({ highlights: [] });
    }

    res.json({ highlights: article.highlights });
  } catch (error) {
    console.error('❌ Error fetching highlights:', error);
    res.status(500).json({ error: 'Failed to fetch highlights' });
  }
});

// ✅ Health check
app.get('/', (req, res) => {
  res.send('✅ Note Taker backend is running!');
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});