chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("📩 Background received request:", request);

    if (!request.action) {
        const errorMsg = "Missing 'action' field in request.";
        console.warn("⚠️", errorMsg);
        sendResponse({ success: false, error: errorMsg });
        return;
    }

    switch (request.action) {
        case "ping":
            console.log("🏓 Ping received.");
            sendResponse({ success: true, message: "Pong from background script" });
            break;

        case "capture":
            chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
                if (chrome.runtime.lastError) {
                    console.error("❌ Capture error:", chrome.runtime.lastError.message);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    console.log("📸 Screenshot captured.");
                    sendResponse({ success: true, dataUrl });
                }
            });
            return true; // Async response

        case "saveHighlight":
            console.log("📝 Saving highlight:", request.text);

            fetch("https://note-taker-3-unrg.onrender.com/save-highlight", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: request.text,
                    url: request.url,
                    title: request.title,
                    timestamp: request.timestamp,
                    userId: "exampleUserId", // TODO: Replace with actual user ID logic
                }),
            })
            .then(res => res.json())
            .then(data => {
                console.log("✅ Highlight saved to backend:", data);
                sendResponse({ success: true, data });
            })
            .catch(error => {
                console.error("❌ Error saving highlight:", error);
                sendResponse({ success: false, error: error.message });
            });

            return true; // Async response

        default:
            const unknownMsg = `Unknown action: ${request.action}`;
            console.warn("⚠️", unknownMsg);
            sendResponse({ success: false, error: unknownMsg });
    }
});