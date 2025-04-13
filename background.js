// background.js

let lastSavedArticle = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ping") {
        console.log("🔌 Extension is alive.");
        sendResponse({ status: "pong" });
    }

    // Save article content
    else if (request.action === "capture") {
        console.log("📰 Saving article content...");

        fetch("https://note-taker-3-unrg.onrender.com/save-article", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                title: request.title,
                url: request.url,
                content: request.content,
                userId: "exampleUserId", // Update later for real users
            }),
        })
        .then((res) => res.json())
        .then((data) => {
            console.log("✅ Article saved:", data);
            // Save article metadata in memory
            lastSavedArticle = {
                title: request.title,
                url: request.url,
            };
            sendResponse({ success: true });
        })
        .catch((err) => {
            console.error("❌ Error saving article:", err);
            sendResponse({ success: false, error: err.message });
        });

        return true; // Indicates async response
    }

    // Save highlight after popup is closed
    else if (request.action === "saveHighlight") {
        console.log("💡 Saving highlight:", request.text);

        // Use last saved article if available
        const highlightData = {
            text: request.text,
            timestamp: request.timestamp,
            userId: "exampleUserId", // Update later
            url: request.url || (lastSavedArticle?.url ?? ""),
            title: request.title || (lastSavedArticle?.title ?? ""),
        };

        fetch("https://note-taker-3-unrg.onrender.com/save-highlight", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(highlightData),
        })
        .then((res) => res.json())
        .then((data) => {
            console.log("✅ Highlight saved:", data);
            sendResponse({ success: true });
        })
        .catch((err) => {
            console.error("❌ Failed to save highlight:", err);
            sendResponse({ success: false, error: err.message });
        });

        return true; // Indicates async response
    }
});