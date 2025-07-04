// background.js - FINAL VERSION - WITH FOLDERID FIX

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "capture") {
    const handleCapture = async () => {
      try {
        if (!request.url || !request.title || !request.tabId) { // Check for tabId
          throw new Error("Missing title, url, or tabId in the capture request.");
        }

        // --- NEW: Access folderId from the request object ---
        const folderIdToSend = request.folderId; // This is the ID passed from popup.js
        console.log(`[DEBUG - Background] Attempting to save article with folderId: ${folderIdToSend}`);
        // ----------------------------------------------------

        const response = await fetch(`${BASE_URL}/save-article`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: request.title,
            url: request.url,
            content: request.content || "",
            // userId: "exampleUserId", // This might be for future use, but not needed for folder linking
            folderId: folderIdToSend, // <-- ADD THIS LINE!
          }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log("✅ Article saved successfully:", data);

        // THE FIX: Use request.tabId instead of sender.tab.id (already correctly done in your code)
        chrome.tabs.sendMessage(request.tabId, { action: "activateHighlighting" });
        chrome.tabs.sendMessage(request.tabId, {
          action: "articleSaved",
          article: { title: request.title, url: request.url, id: data._id ?? null },
        });
        
        return { success: true, data: data };

      } catch (error) {
        console.error("❌ An error occurred in the handleCapture function:", error);
        return { success: false, error: error.message };
      }
    };

    handleCapture().then(sendResponse);
    return true;
  }
});
