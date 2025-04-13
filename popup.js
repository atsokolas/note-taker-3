document.addEventListener("DOMContentLoaded", () => {
    const saveButton = document.querySelector("#saveArticleButton");
    const loadButton = document.querySelector("#loadArticleButton");
    const highlightButton = document.querySelector("#highlightButton");

    if (!saveButton || !loadButton || !highlightButton) {
        console.error("❌ Required buttons missing in popup.html.");
        return;
    }

    saveButton.addEventListener("click", handleSaveArticle);
    loadButton.addEventListener("click", handleLoadArticles);
    highlightButton.addEventListener("click", handleHighlight);

    if (typeof Mark === "function") {
        console.log("✅ Mark.js loaded.");
    } else {
        console.error("❌ Mark.js failed to load.");
    }
});

async function handleSaveArticle() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return console.error("❌ Active tab not found.");

    chrome.tabs.sendMessage(tab.id, { action: "extractContent" }, async (response) => {
        if (chrome.runtime.lastError || !response || response.error) {
            console.error("❌ Error extracting content:", chrome.runtime.lastError?.message || response?.error);
            return;
        }

        console.log("📩 Received response from content script:", response);

        const payload = {
            title: response.data.title,
            url: response.data.url,
            content: response.data.content,
            text: response.data.text,
            userId: "exampleUserId" // Replace with real user ID
        };

        try {
            const res = await fetch("https://note-taker-3-unrg.onrender.com/save-article", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (res.ok) {
                alert("✅ Article saved successfully!");
            } else {
                alert("❌ Failed to save article.");
                console.error("❌ Server error:", data.error);
            }
        } catch (err) {
            console.error("❌ Network error:", err);
            alert("Network error while saving.");
        }
    });
}

async function handleLoadArticles() {
    try {
        const res = await fetch("https://note-taker-3-unrg.onrender.com/get-articles");
        const articles = await res.json();
        displayArticles(articles);
    } catch (err) {
        console.error("❌ Failed to load articles:", err);
    }
}

function displayArticles(articles = []) {
    const container = document.querySelector("#savedArticlesList");
    if (!container) return;

    container.innerHTML = "";

    if (!articles.length) {
        container.innerHTML = "<li>No saved articles found.</li>";
        return;
    }

    articles.forEach(({ title }) => {
        const item = document.createElement("li");
        item.textContent = title;
        container.appendChild(item);
    });
}

function handleHighlight() {
    const input = document.querySelector("#highlightInput")?.value.trim();
    const preview = document.querySelector("#articlePreview");

    if (!input) {
        return console.warn("⚠️ No highlight text provided.");
    }
    if (!preview) {
        return console.error("❌ Preview container not found.");
    }

    const mark = new Mark(preview);
    mark.unmark();
    mark.mark(input, {
        className: "highlighted-text",
        separateWordSearch: false
    });

    console.log(`✅ Highlighted: "${input}"`);
}