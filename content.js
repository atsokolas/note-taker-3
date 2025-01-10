console.log("Content script is running and ready to extract content.");

// Define the function to extract content
function extractArticleContent() {
    try {
        // Attempt to find the main article container
        const articleContainer = document.querySelector(
            'article, [class*="content"], [class*="main"], [id*="content"], [id*="main"]'
        );

        if (articleContainer) {
            const articleHTML = articleContainer.innerHTML; // Extract structured HTML
            const articleText = articleContainer.innerText; // Extract plain text

            console.log("Article container found and content extracted.");
            return {
                content: articleHTML,
                text: articleText,
                title: document.title || "Untitled Article", // Use page title as fallback
            };
        } else {
            console.error("Main article container not found. Please inspect the DOM for better selectors.");
            return {
                content: "",
                text: "",
                title: "",
                error: "Main article container not found. Please inspect the DOM for better selectors.",
            };
        }
    } catch (error) {
        console.error("Error extracting article content:", error);
        return {
            content: "",
            text: "",
            title: "",
            error: error.message,
        };
    }
}

// Listen for incoming messages from popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "extractContent") {
        console.log("Message received in content.js:", message);

        // Extract content and send it back
        const extractedContent = extractArticleContent();
        sendResponse(extractedContent);
    }
    return true; // Keep the message port open for async responses
});