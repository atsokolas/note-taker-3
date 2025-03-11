import React, { useState } from "react";

function App() {
    const [articles, setArticles] = useState([]);
    const [selectedArticle, setSelectedArticle] = useState(null);

    function loadArticlesHandler() {
        console.log("📌 Load Articles button clicked!");
        fetch("https://note-taker-3-unrg.onrender.com/get-articles")
            .then(response => {
                if (!response.ok) {
                    throw new Error("Failed to fetch articles");
                }
                return response.json();
            })
            .then(fetchedArticles => {
                console.log("✅ Fetched articles:", fetchedArticles);
                setArticles(fetchedArticles);
            })
            .catch(error => {
                console.error("❌ Error fetching articles:", error);
                alert("Could not fetch articles. Please try again later.");
            });
    }

    return (
        <div style={{ display: "flex" }}>
            {/* Sidebar with Article Titles */}
            <div style={{ width: "30%", borderRight: "1px solid #ddd", padding: "10px" }}>
                <h1>Saved Articles</h1>
                <button onClick={loadArticlesHandler}>Load Articles</button>
                <ul style={{ listStyleType: "none", padding: 0 }}>
                    {articles.map(article => (
                        <li key={article._id} 
                            style={{ 
                                cursor: "pointer", 
                                padding: "5px", 
                                borderBottom: "1px solid #ddd"
                            }}
                            onClick={() => setSelectedArticle(article)}
                        >
                            {article.title}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Main Section to Display Selected Article */}
            <div style={{ width: "70%", padding: "20px" }}>
                {selectedArticle ? (
                    <div>
                        <h2>{selectedArticle.title}</h2>
                        {/* Renders the HTML correctly */}
                        <div dangerouslySetInnerHTML={{ __html: selectedArticle.content }} />
                    </div>
                ) : (
                    <p>Select an article to read</p>
                )}
            </div>
        </div>
    );
}

export default App;