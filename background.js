// background.js - FINAL VERSION WITH ERROR HANDLING REFINEMENT

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Check if the message is for the "capture" action
  if (request.action === "capture") {
    console.log(`[DEBUG - Background] Received 'capture' request:`, request);

    const handleCapture = async () => {
      try {
        if (!request.url || !request.title || !request.tabId) {
          throw new Error("Missing required fields: title, url, or tabId in the capture request.");
        }

        const folderIdToSend = request.folderId;
        console.log(`[DEBUG - Background] Attempting to save article with folderId: ${folderIdToSend}`);

        const response = await fetch(`${BASE_URL}/save-article`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: request.title,
            url: request.url,
            content: request.content || "",
            folderId: folderIdToSend,
          }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new new Error(`Server Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log("✅ [SUCCESS - Background] Article saved successfully:", data);

        // Send messages back to the content script for highlighting functionality
        chrome.tabs.sendMessage(request.tabId, { action: "activateHighlighting" });
        chrome.tabs.sendMessage(request.tabId, {
          action: "articleSaved",
          article: { title: request.title, url: request.url, id: data._id ?? null },
        });
        
        return { success: true, data: data }; // Resolve with success
      } catch (error) {
        console.error("❌ [ERROR - Background] An error occurred in handleCapture:", error);
        // Ensure error message is user-friendly
        const userFacingError = error.message.includes("Server Error") ? error.message : "Failed to save article due to an internal error.";
        return { success: false, error: userFacingError }; // Reject with failure
      }
    };

    // This ensures sendResponse is called when the async operation completes.
    handleCapture().then(sendResponse);
    
    // IMPORTANT: Return true to indicate that sendResponse will be called asynchronously.
    return true; 
  }

  // If the message action is not "capture", we are NOT sending an asynchronous response.
  // Explicitly returning false or nothing (undefined) tells Chrome this.
  // For safety, let's explicitly return false for unhandled actions.
  console.log(`[DEBUG - Background] Received unhandled action: ${request.action}`);
  return false; 
});
