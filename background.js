// background.js - FINAL WORKING VERSION
const BASE_URL = "https://note-taker-3-unrg.onrender.com";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "capture") {
    
    const handleCapture = async () => {
      try {
        if (!request.url || !request.title || !request.tabId) {
          throw new Error("Missing required fields in the capture request.");
        }

        const { token } = await chrome.storage.local.get("token");
        if (!token) {
          throw new Error("Authentication token not found. Please log in again.");
        }

        // --- MODIFIED FETCH REQUEST ---
        const response = await fetch(`${BASE_URL}/save-article`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}` 
          },
          body: JSON.stringify({
            title: request.title,
            url: request.url,
            content: request.content || "",
            folderId: request.folderId,
            
            // Add the new fields here
            author: request.author,
            publicationDate: request.publicationDate,
            siteName: request.siteName
          }),
        });
        // --- END MODIFIED FETCH REQUEST ---

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server Error: ${response.status}`);
        }

        const data = await response.json();
        console.log("✅ [SUCCESS - Background] Article saved successfully:", data);
        
        try {
            await chrome.tabs.sendMessage(request.tabId, { action: "activateHighlighting" });
            await chrome.tabs.sendMessage(request.tabId, {
              action: "articleSaved",
              article: { title: request.title, url: request.url, id: data._id ?? null },
            });
        } catch (sendMessageError) {
            console.error("❌ [ERROR - Background] Failed to send message to content script:", sendMessageError);
        }
        
        return { success: true, data: data };
      } catch (error) {
        console.error("❌ [ERROR - Background] An error occurred in handleCapture:", error);
        return { success: false, error: error.message };
      }
    };

    handleCapture().then(sendResponse);
    return true; // Keep the message channel open for the async response
  }
  return false; 
});
