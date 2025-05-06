// server/save-highlights.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define your schema
const highlightSchema = new mongoose.Schema({
  userId: String,
  articleUrl: String,
  text: String,
  note: String,
  tags: [String],
  createdAt: { type: Date, default: Date.now }
});

// Create the model
const Highlight = mongoose.model('Highlight', highlightSchema);

// POST /api/highlights — Save a new highlight
router.post('/api/highlights', async (req, res) => {
  try {
    const highlight = new Highlight(req.body);
    const saved = await highlight.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('Failed to save highlight:', err);
    res.status(500).json({ error: 'Failed to save highlight' });
  }
});

module.exports = router;