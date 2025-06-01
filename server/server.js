const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const highlightRoutes = require('./save-highlights'); // <- import router

dotenv.config({ path: '../.env' }); // Adjust if needed

const app = express(); // ✅ Declare before using!

const PORT = process.env.PORT || 3000;

// --- CORS OPTIONS ---
const corsOptions = {
  origin: '*', // Or specify specific domains
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
};

// --- MIDDLEWARE ---
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Preflight support

app.use(cors({
  origin: [
    'chrome-extension://<YOUR_EXTENSION_ID>',
    'https://joincolossus.com',
    'http://localhost:3000',
  ],
  methods: ['GET', 'POST'],
  credentials: true,
}));
app.use(express.json());

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGODB_URI)
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
      tags: [String],
    }
  ],
});
const Article = mongoose.model('Article', articleSchema);

// --- ROUTES ---

// Save or update an article and its highlights
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

// Get highlights for a given article
app.get('/highlights', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL query param is required' });

  try {
    const decodedUrl = decodeURIComponent(url);
    const article = await Article.findOne({ url: decodedUrl });
    if (!article) {
      return res.status(404).json({ highlights: [] });
    }
    res.json({ highlights: article.highlights });
  } catch (error) {
    console.error('❌ Error fetching highlights:', error);
    res.status(500).json({ error: 'Failed to fetch highlights' });
  }
});

// Mount highlight-specific routes
app.use('/', highlightRoutes);

// Health check
app.get('/', (req, res) => {
  res.send('✅ Note Taker backend is running!');
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});