document.addEventListener("DOMContentLoaded", async () => {
    const userId = "example-user-id"; // Replace with actual userId logic
    const API_URL = `https://note-taker-3-unrg.onrender.com/articles/${userId}`;
    
    try {
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error("Failed to fetch articles");
        }
        const articles = await response.json();
        
        const container = document.getElementById("articles-container");
        container.innerHTML = ""; // Clear any existing content

        if (articles.length === 0) {
            container.innerHTML = "<p>No articles saved yet.</p>";
        } else {
            articles.forEach((article) => {
                const articleElement = document.createElement("div");
                articleElement.innerHTML = `
                    <h3>${article.title}</h3>
                    <p>${article.content}</p>
                `;
                container.appendChild(articleElement);
            });
        }
    } catch (error) {
        console.error("Error fetching articles:", error);
        document.getElementById("articles-container").innerHTML =
            "<p>Failed to load articles. Please try again later.</p>";
    }
});
