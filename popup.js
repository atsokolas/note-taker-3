document.addEventListener("DOMContentLoaded", function () {
    console.log("✅ DOM fully loaded, attaching event listeners...");

    // Ensure buttons exist before adding event listeners
    const saveButton = document.querySelector("#saveArticleButton");
    const loadButton = document.querySelector("#loadArticleButton");
    const highlightButton = document.querySelector("#highlightButton");

    if (!saveButton || !loadButton || !highlightButton) {
        console.error("❌ One or more buttons not found in popup.html");
        return;
    }

    // Attach event listeners
    saveButton.addEventListener("click", saveArticleHandler);
    loadButton.addEventListener("click", loadArticlesHandler);
    highlightButton.addEventListener("click", highlightTextHandler);

    // Log Mark.js loading status
    checkMarkJS();
});

/**
 * Handler for saving an article
 */
async function saveArticleHandler() {
    console.log("📰 Save Article button clicked");

    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
        console.error("❌ Could not find the active tab.");
        return;
    }

    // Send message to content script to extract article content
    chrome.tabs.sendMessage(tab.id, { action: "extractContent" }, async (response) => {
        if (chrome.runtime.lastError) {
            console.error("❌ Error communicating with content script:", chrome.runtime.lastError.message);
            return;
        }

        if (!response || response.error) {
            console.error("❌ Failed to extract article:", response?.error);
            return;
        }

        console.log("✅ Article content extracted:", response.title);

        // Send to your backend API
        try {
            const res = await fetch("https://note-taker-3-unrg.onrender.com/save-article", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    title: response.title,
                    url: tab.url,
                    content: response.content,
                    text: response.text,
                    userId: "exampleUserId" // TODO: Replace with real user ID
                })
            });

            const data = await res.json();

            if (res.ok) {
                console.log("✅ Article saved:", data);
                alert("Article saved successfully!");
            } else {
                console.error("❌ Failed to save article:", data.error);
                alert("Failed to save article.");
            }
        } catch (error) {
            console.error("❌ Network error while saving article:", error);
            alert("Error saving article.");
        }
    });
}

/**
 * Function to send extracted article data to the backend
 * @param {string} title - Title of the article
 * @param {string} content - Extracted article content
 */
function sendToBackend(title, content) {
    fetch("https://note-taker-3-unrg.onrender.com/save-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, userId: "exampleUserId" }) // Replace with actual user ID
    })
    .then(response => response.json())
    .then(data => console.log("✅ Server response:", data))
    .catch(error => console.error("❌ Error saving article:", error));
}

/**
 * Handler for loading saved articles
 */
function loadArticlesHandler() {
    console.log("📌 Load Articles button clicked!");
    fetch("https://note-taker-3-unrg.onrender.com/get-articles")
        .then(response => response.json())
        .then(articles => {
            console.log("✅ Fetched articles:", articles);
            displayArticles(articles);
        })
        .catch(error => console.error("❌ Error fetching articles:", error));
}

/**
 * Function to display loaded articles in the popup
 * @param {Array} articles - List of saved articles
 */
function displayArticles(articles) {
    const listContainer = document.querySelector("#savedArticlesList");
    listContainer.innerHTML = "";

    if (!articles || articles.length === 0) {
        listContainer.innerHTML = "<li>No saved articles found.</li>";
        return;
    }

    articles.forEach(article => {
        const listItem = document.createElement("li");
        listItem.textContent = article.title;
        listContainer.appendChild(listItem);
    });
}

/**
 * Handler for highlighting text in the article preview
 */
function highlightTextHandler() {
    console.log("📌 Highlight button clicked!");

    const highlightInput = document.querySelector("#highlightInput").value.trim();
    if (!highlightInput) {
        console.warn("⚠️ No text entered for highlighting.");
        return;
    }

    const articlePreview = document.querySelector("#articlePreview");
    if (!articlePreview) {
        console.error("❌ Article preview section not found.");
        return;
    }

    const markInstance = new Mark(articlePreview);
    markInstance.unmark(); // Remove existing highlights
    markInstance.mark(highlightInput, {
        className: "highlighted-text",
        separateWordSearch: false
    });

    console.log(`✅ Highlighted occurrences of: "${highlightInput}"`);
}

/**
 * Check if Mark.js is loaded
 */
function checkMarkJS() {
    if (typeof Mark === "function") {
        console.log("✅ Mark.js loaded!");
    } else {
        console.error("❌ Mark.js failed to load.");
    }
}