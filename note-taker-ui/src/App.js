function loadArticlesHandler() {
  console.log("📌 Load Articles button clicked!");
  fetch("https://note-taker-3-unrg.onrender.com/get-articles")
      .then(response => {
          if (!response.ok) {
              throw new Error("Failed to fetch articles");
          }
          return response.json();
      })
      .then(articles => {
          console.log("✅ Fetched articles:", articles);
          displayArticles(articles);
      })
      .catch(error => {
          console.error("❌ Error fetching articles:", error);
          alert("Could not fetch articles. Please try again later.");
      });
}