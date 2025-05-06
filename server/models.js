const ArticleSchema = new mongoose.Schema({
    title: String,
    content: String,
  });
  
  const Article = mongoose.model("Article", ArticleSchema);
  
  module.exports = Article;

  const Article = require("./models/Article");

app.post("/save-article", async (req, res) => {
  const { title, content } = req.body;
  const article = new Article({ title, content });
  await article.save();
  res.json({ message: "Article saved!" });
});
