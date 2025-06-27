// background.js - FINAL RECOMMENDED VERSION

const BASE_URL = "https://note-taker-3-1.onrender.com";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ping") {
    console.log("🔌 Extension is alive.");
    sendResponse({ status: "pong" });
    return; // It's good practice to exit after sending a response
  }

  // Save article content - This is its primary job now.
  if (request.action === "capture") {
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
      .then((res) => {
          if (!res.ok) { // Add better error checking
              throw new Error(`Server responded with status: ${res.status}`);
          }
          return res.json();
      })
      .then((data) => {
        console.log("✅ Article saved:", data);
  
        // Send message back to the tab that made the request
        if (sender.tab && sender.tab.id !== undefined) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "articleSaved",
            article: {
              title: request.title,
              url: request.url,
              id: data.id ?? null,
            },
          });
        }
  
        sendResponse({ success: true, data: data });
      })
      .catch((err) => {
        console.error("❌ Error saving article:", err);
        sendResponse({ success: false, error: err.message });
      });
  
    return true; // Indicates async response
  }
});
