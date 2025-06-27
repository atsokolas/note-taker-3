// background.js - UPDATED WITH AUTO-ACTIVATION

const BASE_URL = "https://note-taker-3-1.onrender.com";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "capture") {
    console.log("📰 Saving article content...");
  
    fetch(`${BASE_URL}/save-article`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: request.title,
        url: request.url,
        content: request.content,
        userId: "exampleUserId",
      }),
    })
      .then(res => {
          if (!res.ok) throw new Error(`Server responded with status: ${res.status}`);
          return res.json();
      })
      .then(data => {
        console.log("✅ Article saved:", data);
        
        if (sender.tab && sender.tab.id) {
          // --- THIS IS THE KEY CHANGE ---
          // After saving, send a message to the content script to turn on highlighting.
          chrome.tabs.sendMessage(sender.tab.id, { action: "activateHighlighting" });

          // Also, send the original confirmation message so it can load past highlights
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "articleSaved",
            article: { title: request.title, url: request.url, id: data.id ?? null },
          });
        }
        sendResponse({ success: true, data: data });
      })
      .catch(err => {
        console.error("❌ Error saving article:", err);
        sendResponse({ success: false, error: err.message });
      });
  
    return true; // Indicates async response
  }
});
