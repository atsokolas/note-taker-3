chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Received request:", request);
    console.log("Sender details:", sender);

    // Ensure the request contains an action
    if (!request.action) {
        console.warn("Request missing 'action'. Ignoring.");
        sendResponse({ success: false, error: "Invalid request. Missing 'action' field." });
        return;
    }

    // Handle ping action
    if (request.action === "ping") {
        console.log("Ping received. Background script is active!");
        sendResponse({ success: true, message: "Pong from background script" });
        return true;
    }

    // Check if the action is to capture a screenshot
    if (request.action === "capture") {
        // Use Chrome's `captureVisibleTab` to capture the current visible area
        chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                console.error("Error capturing visible tab:", chrome.runtime.lastError.message);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                console.log("Screenshot captured successfully");
                sendResponse({ success: true, dataUrl });
            }
        });

        // Indicate that the response will be sent asynchronously
        return true;
    }

    // Unknown action handling
    console.warn("Unknown action received:", request.action);
    sendResponse({ success: false, error: `Unknown action: ${request.action}` });
});
