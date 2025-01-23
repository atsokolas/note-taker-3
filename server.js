const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 5500;

app.use(bodyParser.json());
app.use(cors());

const MONGO_URI = "mongodb+srv://atsokolas:<Boonies#0918>@note-taker.kdtnq.mongodb.net/?retryWrites=true&w=majority&appName=Note-taker"; // Replace with your MongoDB connection string
const DATABASE_NAME = "sample_mflix";
const COLLECTION_NAME = "articles";

let db, collection;

// Connect to MongoDB
MongoClient.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then((client) => {
        db = client.db(DATABASE_NAME);
        collection = db.collection(COLLECTION_NAME);
        console.log(`Connected to MongoDB: ${DATABASE_NAME}`);
    })
    .catch((err) => console.error("Failed to connect to MongoDB:", err));

    app.post("/save-article", (req, res) => {
        const { title, content } = req.body;
        if (!title || !content) {
            return res.status(400).send("Invalid article data.");
        }
        // Handle saving logic here
        res.status(200).send("Article saved successfully!");
    });

app.get("/articles/:userId", (req, res) => {
    const userId = req.params.userId;

    collection.find({ userId }).toArray()
        .then((articles) => res.status(200).json(articles))
        .catch((err) => {
            console.error("Error fetching articles:", err);
            res.status(500).send("Failed to fetch articles.");
        });
});

app.listen(PORT, () => {
    console.log(`Server running on http://127.0.0.1:${PORT}`);
});

const mongoose = require("mongoose");

const DB_URI = "mongodb+srv://atsokolas:<Boonies#0918>@note-taker.kdtnq.mongodb.net/?retryWrites=true&w=majority&appName=Note-taker";

mongoose.connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));