// Dependencies
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");

// Initialize app
const app = express();
const PORT = process.env.PORT || 5500;

// Middleware
app.use(bodyParser.json());
app.use(cors({ origin: "*" }));

// MongoDB connection
const DB_URI = process.env.MONGO_URI;
console.log("🔗 Connecting to MongoDB with URI:", DB_URI);

mongoose.connect(DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: "test"
})
    .then(() => {
        console.log("✅ Connected to MongoDB");
        console.log("📂 Using Database:", mongoose.connection.db.databaseName);
    })
    .catch((err) => {
        console.error("❌ MongoDB connection error:", err);
        process.exit(1);
    });

// Define Article Schema and Model
const articleSchema = new mongoose.Schema({
    url: { type: String, required: true }, // ✅ Added URL field
    title: String,
    content: String,
    userId: String,
    createdAt: { type: Date, default: Date.now },
    highlights: [
        {
            text: String,
            note: String,
            tags: [String],
            createdAt: { type: Date, default: Date.now }
        }
    ]
});

const Article = mongoose.model("Article", articleSchema);

// Routes

// Save Article
app.post("/save-article", async (req, res) => {
    console.log("📩 Incoming request body:", req.body);

    const { title, content, userId, url } = req.body;

    if (!title || !content || !userId || !url) {
        console.log("⚠️ Missing fields:", req.body);
        return res.status(400).json({ error: "Missing required fields (title, content, userId, url)" });
    }

    try {
        const newArticle = new Article({ title, content, userId, url });
        await newArticle.save();
        console.log("✅ Article saved successfully:", newArticle);
        res.status(200).json({ message: "Article saved successfully!" });
    } catch (err) {
        console.error("❌ Error saving article:", err);
        res.status(500).json({ error: "Failed to save article", details: err.message });
    }
});

// Save Highlight to an Article (by Article ID - optional older route)
app.post("/articles/:articleId/highlights", async (req, res) => {
    const { articleId } = req.params;
    const { text, note, tags } = req.body;

    if (!text) {
        return res.status(400).json({ error: "Highlight text is required" });
    }

    try {
        const article = await Article.findById(articleId);
        if (!article) {
            return res.status(404).json({ error: "Article not found" });
        }

        article.highlights.push({ text, note, tags });
        await article.save();

        res.status(200).json({ message: "Highlight added successfully", article });
    } catch (err) {
        console.error("❌ Error adding highlight:", err);
        res.status(500).json({ error: "Failed to add highlight" });
    }
});

// ✅ Save Highlight to an Article (by URL - NEW ROUTE for content.js)
app.post("/articles/save-highlight", async (req, res) => {
    const { url, highlight } = req.body;

    if (!url || !highlight || !highlight.text) {
        return res.status(400).json({ error: "Missing required fields (url, highlight.text)" });
    }

    try {
        let article = await Article.findOne({ url });

        if (!article) {
            // If no article exists yet for the URL, create it
            article = new Article({ url, title: url, content: "", userId: "", highlights: [] });
        }

        article.highlights.push(highlight);
        await article.save();

        console.log("✅ Highlight saved for URL:", url);
        res.status(200).json({ message: "Highlight saved successfully", article });
    } catch (err) {
        console.error("❌ Error saving highlight:", err);
        res.status(500).json({ error: "Failed to save highlight", details: err.message });
    }
});

// Fetch Articles for a Specific User
app.get("/articles/:userId", async (req, res) => {
    const { userId } = req.params;

    try {
        const articles = await Article.find({ userId });
        console.log(`📖 Retrieved ${articles.length} articles for user: ${userId}`);
        res.status(200).json(articles);
    } catch (err) {
        console.error("❌ Error fetching articles:", err);
        res.status(500).json({ error: "Failed to fetch articles" });
    }
});

// Fetch All Articles
app.get("/get-articles", async (req, res) => {
    try {
        const articles = await Article.find();
        res.json(articles);
    } catch (error) {
        console.error("❌ Error fetching articles:", error);
        res.status(500).json({ error: "Failed to fetch articles" });
    }
});

// Health Check
app.get("/", (req, res) => {
    res.send("🚀 Server is running!");
});

// Ping Test
app.get("/ping", (req, res) => {
    console.log("🔔 Ping received!");
    res.send("✅ Server is alive");
});

// Start Server
app.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
});