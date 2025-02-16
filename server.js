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
app.use(cors());

// MongoDB connection
const DB_URI = process.env.MONGO_URI; // Get MongoDB URI from .env
mongoose.connect(DB_URI)
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => {
        console.error("MongoDB connection error:", err);
        process.exit(1); // Exit the process if MongoDB connection fails
    });

// Article Schema
const articleSchema = new mongoose.Schema({
    title: String,
    content: String,
    userId: String, // Optional, for multi-user functionality
    createdAt: { type: Date, default: Date.now }
});

const Article = mongoose.model("Article", articleSchema);

// Routes
app.post("/save-article", async (req, res) => {
    const { title, content, userId } = req.body;

    if (!title || !content) {
        return res.status(400).send("Invalid article data.");
    }

    try {
        const newArticle = new Article({ title, content, userId });
        await newArticle.save();
        res.status(200).send("Article saved successfully!");
    } catch (err) {
        console.error("Error saving article:", err);
        res.status(500).send("Failed to save article.");
    }
});

app.get("/articles/:userId", async (req, res) => {
    const { userId } = req.params;

    try {
        const articles = await Article.find({ userId });
        res.status(200).json(articles);
    } catch (err) {
        console.error("Error fetching articles:", err);
        res.status(500).send("Failed to fetch articles.");
    }
});

// Health check route to confirm server is running
app.get("/", (req, res) => {
    res.send("Server is running!");
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});