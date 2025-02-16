// Dependencies
require("dotenv").config(); // Load environment variables from .env
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");

// Initialize app
const app = express();
const PORT = process.env.PORT || 5500; // Use PORT from .env or fallback to 5500

// Middleware
app.use(bodyParser.json());
app.use(cors({ origin: "*" })); // Allow all origins temporarily; restrict in production

// MongoDB connection
const DB_URI = process.env.MONGO_URI; // Get MongoDB URI from .env
mongoose.connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => {
        console.error("MongoDB connection error:", err);
        process.exit(1); // Exit the process if MongoDB connection fails
    });

// Article Schema
const articleSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    userId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const Article = mongoose.model("Article", articleSchema);

// Routes
app.get("/", (req, res) => {
    res.send("Note Taker API is running.");
});

// Save an article
app.post("/save-article", async (req, res) => {
    const { title, content, userId } = req.body;

    if (!title || !content || !userId) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    try {
        const newArticle = new Article({ title, content, userId });
        await newArticle.save();
        res.status(201).json({ message: "Article saved successfully!" });
    } catch (err) {
        console.error("Error saving article:", err);
        res.status(500).json({ error: "Failed to save article." });
    }
});

// Get articles for a user
app.get("/articles/:userId", async (req, res) => {
    const { userId } = req.params;

    try {
        const articles = await Article.find({ userId });
        res.status(200).json(articles);
    } catch (err) {
        console.error("Error fetching articles:", err);
        res.status(500).json({ error: "Failed to fetch articles." });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
