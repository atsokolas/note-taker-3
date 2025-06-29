// server.js - INSTRUMENTED FOR DETAILED DEBUGGING

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// --- CATCH-ALL ERROR HANDLERS ---
// These will catch any errors that might crash the Node.js process.
process.on('uncaughtException', (error, origin) => {
  console.log('----- UNCAUGHT EXCEPTION -----');
  console.log(error);
  console.log('----- EXCEPTION ORIGIN -----');
  console.log(origin);
});
process.on('unhandledRejection', (reason, promise) => {
  console.log('----- UNHANDLED REJECTION -----');
  console.log(reason);
});
// ------------------------------------

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));

console.log('[SERVER INIT] Attempting to connect to MongoDB...');
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("✅ [SERVER INIT] MongoDB connected successfully."))
  .catch(err => console.error("❌ [SERVER INIT] MongoDB connection error:", err));

const articleSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  title: String,
  content: String,
  highlights: [{ text: String, note: String, tags: [String] }],
}, { timestamps: true });

const Article = mongoose.model('Article', articleSchema);

// --- HIGHLY-LOGGED TEST ROUTE ---
app.post("/save-article", async (req, res) => {
  console.log("-----------------------------------------");
  console.log("[STEP 1] /save-article route handler was hit.");
  try {
    console.log("[STEP 2] Entered the 'try' block.");
    const { title, url, content } = req.body;
    console.log(`[STEP 3] Destructured request body. URL is: ${url}`);

    if (!title || !url) {
      console.log("[VALIDATION FAILED] Missing title or URL.");
      return res.status(400).json({ error: "Missing required fields." });
    }
    console.log(`[STEP 4] Validation passed for article: ${title}`);

    const articleData = {
      title: title,
      content: content || '',
      $setOnInsert: { highlights: [] }
    };
    console.log("[STEP 5] Prepared data for database operation.");

    const dbOperation = await Article.findOneAndUpdate({ url: url }, articleData, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    });
    console.log("[STEP 6] Mongoose 'findOneAndUpdate' operation has completed.");

    if (!dbOperation) {
        throw new Error("Database operation completed but returned no document.");
    }
    console.log("[STEP 7] Preparing to send successful JSON response.");

    res.status(200).json(dbOperation);
    console.log("[STEP 8] Successful JSON response has been sent.");

  } catch (error) {
    console.error("[CRITICAL] An error was caught inside the 'catch' block:", error);
    res.status(500).json({ error: "Internal server error.", details: error.message });
  }
});

// All other routes remain the same
app.get('/', (req, res) => res.send('✅ Note Taker backend is running!'));
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
