// background.js - FINAL CORRECTED VERSION
const BASE_URL = "https://note-taker-3-unrg.onrender.com";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
          credentials: 'include', // <-- THE FIX IS HERE
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log("✅ [SUCCESS - Background] Article saved successfully:", data);
        
        // Send messages to the content script to activate highlighting
        try {
            console.log(`[DEBUG - Background] Sending 'activateHighlighting' to tab: ${request.tabId}`);
            await chrome.tabs.sendMessage(request.tabId, { action: "activateHighlighting" });
            
            console.log(`[DEBUG - Background] Sending 'articleSaved' to tab: ${request.tabId}`);
            await chrome.tabs.sendMessage(request.tabId, {
              action: "articleSaved",
              article: { title: request.title, url: request.url, id: data._id ?? null },
            });
            console.log("[DEBUG - Background] Messages sent to content script successfully.");
        } catch (sendMessageError) {
            console.error("❌ [ERROR - Background] Failed to send message to content script:", sendMessageError);
        }
        
        return { success: true, data: data }; // Resolve popup.js's call
      } catch (error) {
        console.error("❌ [ERROR - Background] An error occurred in handleCapture:", error);
        const userFacingError = error.message.includes("Server Error") ? error.message : "Failed to save article due to an internal error.";
        return { success: false, error: userFacingError }; // Reject popup.js's call
      }
    };

    handleCapture().then(sendResponse);
    return true; // Indicate that sendResponse will be called asynchronously
  }
  
  return false; 
});
