const express = require('express');

const PASSWORD_MIN_LENGTH = 8;

const validateRegistration = ({ username, password }) => {
  const cleanUsername = String(username || '').trim();
  const rawPassword = String(password || '');

  if (!cleanUsername || !rawPassword) {
    return { error: 'Username and password are required.' };
  }

  if (rawPassword.length < PASSWORD_MIN_LENGTH) {
    return { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }

  if (cleanUsername.toLowerCase() === rawPassword.trim().toLowerCase()) {
    return { error: 'Password cannot match your username.' };
  }

  if (!/[A-Za-z]/.test(rawPassword) || !/\d/.test(rawPassword)) {
    return { error: 'Password must include at least one letter and one number.' };
  }

  return {
    cleanUsername,
    password: rawPassword
  };
};

const buildAuthDiscoveryRouter = ({
  bcrypt,
  jwt,
  User,
  authenticateToken,
  Recommendation,
  Article
}) => {
  const router = express.Router();

  router.post('/api/auth/register', async (req, res) => {
    try {
      const validation = validateRegistration(req.body || {});
      if (validation.error) {
        return res.status(400).json({ error: validation.error });
      }
      const { cleanUsername, password } = validation;

      const existingUser = await User.exists({ username: cleanUsername });
      if (existingUser) {
        return res.status(409).json({ error: "Username already exists." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({ username: cleanUsername, password: hashedPassword });
      await newUser.save();
      res.status(201).json({
        message: "User registered successfully.",
        loginMessage: "Account created. You can log in now."
      });
    } catch (error) {
      console.error("❌ Error registering user:", error);
      res.status(500).json({ error: "Internal server error.", details: error.message });
    }
  });

  router.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
      }

      const user = await User.findOne({ username });
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials." });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: "Invalid credentials." });
      }

      const token = jwt.sign(
        { id: user._id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.clearCookie('token');
      res.clearCookie('authToken');
      res.clearCookie('jwt');
      res.status(200).json({ token, username: user.username, userId: user._id });
    } catch (error) {
      console.error("❌ Error logging in user:", error);
      res.status(500).json({ error: "Internal server error.", details: error.message });
    }
  });

  router.post('/api/recommendations', authenticateToken, async (req, res) => {
    const { articleId, highlightIds } = req.body;
    const userId = req.user.id;

    if (!articleId || !highlightIds) {
      return res.status(400).json({ error: "Article ID and highlight IDs are required." });
    }
    if (!Array.isArray(highlightIds) || highlightIds.length === 0) {
      return res.status(400).json({ error: "You must select at least one highlight to share." });
    }
    if (highlightIds.length > 10) {
      return res.status(400).json({ error: "You can share a maximum of 10 highlights." });
    }
    const WORD_LIMIT_PER_HIGHLIGHT = 35;

    try {
      const article = await Article.findOne({ _id: articleId, userId: userId });
      if (!article) {
        return res.status(404).json({ error: "Article not found or you do not own it." });
      }

      const sharedHighlights = [];
      for (const hId of highlightIds) {
        const highlight = article.highlights.id(hId);
        if (!highlight) {
          return res.status(400).json({ error: `Highlight with ID ${hId} not found.` });
        }
        if (highlight.text.split(' ').length > WORD_LIMIT_PER_HIGHLIGHT) {
          return res.status(400).json({ error: `One of your selected highlights exceeds the ${WORD_LIMIT_PER_HIGHLIGHT}-word limit.` });
        }
        sharedHighlights.push({ text: highlight.text });
      }

      const newRecommendation = new Recommendation({
        articleUrl: article.url,
        articleTitle: article.title,
        recommendingUserId: userId,
        sharedHighlights: sharedHighlights
      });

      await newRecommendation.save();
      res.status(201).json({ message: "Article recommended successfully!", recommendation: newRecommendation });
    } catch (error) {
      console.error("❌ Error recommending article:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });

  router.get('/api/trending', authenticateToken, async (req, res) => {
    try {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const recommended = await Recommendation.aggregate([
        { $match: { createdAt: { $gte: cutoff } } },
        { $group: {
          _id: "$articleUrl",
          recommendationCount: { $sum: 1 },
          articleTitle: { $first: "$articleTitle" }
        } },
        { $sort: { recommendationCount: -1 } },
        { $limit: 10 }
      ]);

      const highlighted = await Article.aggregate([
        { $unwind: '$highlights' },
        { $match: { 'highlights.createdAt': { $gte: cutoff } } },
        { $group: {
          _id: '$_id',
          title: { $first: '$title' },
          count: { $sum: 1 }
        } },
        { $sort: { count: -1, title: 1 } },
        { $limit: 10 }
      ]);

      res.status(200).json({ recommended, highlighted });
    } catch (error) {
      console.error("❌ Error fetching trending data:", error);
      res.status(500).json({ error: "Failed to fetch trending." });
    }
  });

  return router;
};

module.exports = {
  buildAuthDiscoveryRouter
};
