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
app.use(cors({ origin: "*" })); // Allow all origins temporarily for testing

// MongoDB connection
const DB_URI = process.env.MONGO_URI;
console.log("🔗 Connecting to MongoDB with URI:", DB_URI); // Debugging connection string

mongoose.connect(DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: "test" // Ensure connection to the correct database
})
    .then(() => {
        console.log("✅ Connected to MongoDB");
        console.log("📂 Using Database:", mongoose.connection.db.databaseName);
    })
    .catch((err) => {
        console.error("❌ MongoDB connection error:", err);
        process.exit(1);
    });
    const articleSchema = new mongoose.Schema({
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
    
    const Article = mongoose.model("Article", articleSchema); // ✅ Add this
    
// Routes

// Save Article
app.post("/save-article", async (req, res) => {
    console.log("📩 Incoming request body:", req.body); // Debugging incoming data

    const { title, content, userId } = req.body;

    // Validate request body
    if (!title || !content || !userId) {
        console.log("⚠️ Missing fields:", req.body);
        return res.status(400).json({ error: "Missing required fields (title, content, userId)" });
    }

    try {
        const newArticle = new Article({ title, content, userId });
        await newArticle.save();
        console.log("✅ Article saved successfully:", newArticle);
        res.status(200).json({ message: "Article saved successfully!" });
    } catch (err) {
        console.error("❌ Error saving article:", err);
        res.status(500).json({ error: "Failed to save article", details: err.message });
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

// Fetch All Articles (for debugging)
app.get("/get-articles", async (req, res) => {
    try {
        console.log("📂 Fetching articles from DB:", mongoose.connection.db.databaseName); // Debugging database name
        const articles = await Article.find();
        res.json(articles);
    } catch (error) {
        console.error("❌ Error fetching articles:", error);
        res.status(500).json({ error: "Failed to fetch articles" });
    }
});

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

// Health check
app.get("/", (req, res) => {
    res.send("🚀 Server is running!");
});

// Ping test
app.get("/ping", (req, res) => {
    console.log("🔔 Ping received!");
    res.send("✅ Server is alive");
});

// Start server
app.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
});