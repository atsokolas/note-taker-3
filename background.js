// background.js

const BASE_URL = "https://note-taker-3-1.onrender.com";

let lastSavedArticle = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ping") {
    console.log("🔌 Extension is alive.");
    sendResponse({ status: "pong" });
  }

  // Save article content
  else if (request.action === "capture") {
    console.log("📰 Saving article content...");
  
    fetch(`${BASE_URL}/save-article`, {
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
        lastSavedArticle = {
          title: request.title,
          url: request.url,
        };
  
        // 🔧 Send message back to the tab that made the request
        if (sender.tab && sender.tab.id !== undefined) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "articleSaved",
            article: {
              title: request.title,
              url: request.url,
              id: data.id ?? null, // if your backend returns an ID
            },
          });
        }
  
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

    const highlightData = {
      text: request.text,
      timestamp: request.timestamp,
      userId: "exampleUserId", // Update later
      url: request.url || (lastSavedArticle?.url ?? ""),
      title: request.title || (lastSavedArticle?.title ?? ""),
    };

    fetch(`${BASE_URL}/save-highlight`, {
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