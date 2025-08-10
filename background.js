// background.js
const BASE_URL = "https://note-taker-3-unrg.onrender.com";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "capture") {
    
    const handleCapture = async () => {
      // --- DEBUGGING LOGS ADDED ---
      console.log("[BACKGROUND.JS TRACE] 'capture' message received. Starting handleCapture.");
      
      try {
        if (!request.url || !request.title || !request.tabId) {
          throw new Error("Missing required fields in the capture request.");
        }

        // Let's see if we can get the token.
        const storageResult = await chrome.storage.local.get("token");
        const token = storageResult.token;
        
        // This is the most important log. Let's see what the token value is.
        console.log("[BACKGROUND.JS TRACE] Token retrieved from storage:", token);

        if (!token) {
          throw new Error("Authentication token not found. Please log in.");
        }

        const fetchOptions = {
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
          }),
        };

        // Let's log the options right before we send the request.
        console.log("[BACKGROUND.JS TRACE] Preparing to fetch with these options:", fetchOptions);

        const response = await fetch(`${BASE_URL}/save-article`, fetchOptions);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server Error: ${response.status} - ${errorText}`);
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
    return true; 
  }
  return false;
});
