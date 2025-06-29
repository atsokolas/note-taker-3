// server.js - FINAL COMPLETE & PRODUCTION-READY VERSION

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

// POST /save-article: Saves or updates an entire article (from the extension).
app.post("/save-article", async (req, res) => {
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
    res.status(200).json(updatedArticle);
  } catch (error) {
    console.error("❌ Error in /save-article:", error);
    res.status(500).json({ error: "Internal server error.", details: error.message });
  }
});

// GET /get-articles: Gets a list of all saved articles (for the web app's main page).
app.get('/get-articles', async (req, res) => {
    try {
      const articles = await Article.find({}).select('title url createdAt _id').sort({createdAt: -1});
      res.json(articles);
    } catch (err) {
      console.error("❌ Failed to fetch articles:", err);
      res.status(500).json({ error: "Failed to fetch articles" });
    }
});

// GET /articles/:id: Gets a single article by its unique ID (for the web app's viewer page).
app.get('/articles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const article = await Article.findById(id);
    if (!article) {
      return res.status(404).json({ error: "Article not found" });
    }
    res.json(article);
  } catch (err) {
    console.error("❌ Error fetching article by ID:", err);
    res.status(500).json({ error: "Failed to fetch article by ID" });
  }
});

// POST /articles/:id/highlights: Adds a new highlight to a specific article. THIS IS THE MISSING ROUTE.
app.post('/articles/:id/highlights', async (req, res) => {
    try {
        const { id } = req.params;
        const { text, note, tags } = req.body; // Expecting highlight data in the body

        if (!text) {
            return res.status(400).json({ error: "Highlight text is required." });
        }

        const newHighlight = {
            text: text,
            note: note || "",
            tags: tags || []
        };

        const updatedArticle = await Article.findByIdAndUpdate(
            id,
            { $push: { highlights: newHighlight } },
            { new: true } // This option returns the updated document
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
