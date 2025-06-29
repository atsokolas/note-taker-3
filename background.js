// background.js - FINAL PRODUCTION VERSION

const BASE_URL = "https://note-taker-3-1.onrender.com";

// Make the entire listener function async to reliably use await
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "capture") {
    
    // Immediately log what we received from the popup to be sure.
    console.log("Background script received 'capture' request with data:", request);

    // Create a new async function to handle the logic.
    // This is a robust pattern for async operations in listeners.
    const handleCapture = async () => {
      try {
        // Double-check that we have the necessary data before fetching
        if (!request.url || !request.title) {
          throw new Error("Missing title or url in the capture request.");
        }

        const response = await fetch(`${BASE_URL}/save-article`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: request.title,
            url: request.url,
            // We are now back to using the real content from the request
            content: request.content || "", // Default to empty string if content is missing
            userId: "exampleUserId",
          }),
        });

        const responseText = await response.text();

        if (responseText.trim() === "") {
            throw new Error("Received an empty response from server.");
        }
        if (!response.ok) {
            throw new Error(`Server Error: ${response.status} - ${responseText}`);
        }

        const data = JSON.parse(responseText);
        console.log("✅ Article saved successfully:", data);

        if (sender.tab && sender.tab.id) {
          chrome.tabs.sendMessage(sender.tab.id, { action: "activateHighlighting" });
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "articleSaved",
            article: { title: request.title, url: request.url, id: data._id ?? null },
          });
        }
        
        return { success: true, data: data };

      } catch (error) {
        console.error("❌ An error occurred in the handleCapture function:", error);
        return { success: false, error: error.message };
      }
    };

    // Call our async function and send the response when it's done.
    handleCapture().then(sendResponse);

    // Return true to indicate that the response will be sent asynchronously.
    return true;
  }
});
