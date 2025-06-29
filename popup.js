// popup.js - FINAL VERSION

document.addEventListener("DOMContentLoaded", () => {
    const saveButton = document.getElementById("saveArticleButton");
    const statusMessage = document.getElementById("statusMessage");

    saveButton.addEventListener("click", async () => {
        statusMessage.textContent = "Parsing article...";
        statusMessage.className = 'status';
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            const articleResponse = await chrome.tabs.sendMessage(tab.id, { action: "getCleanArticle" });

            if (articleResponse.error || !articleResponse.article) {
                throw new Error(articleResponse.error || "Could not parse article.");
            }
            
            statusMessage.textContent = "Saving article...";
            
            // Send the clean data AND the tab's ID to the background script
            const backgroundResponse = await chrome.runtime.sendMessage({
                action: "capture",
                tabId: tab.id, // THE FIX: Explicitly send the tab ID
                title: articleResponse.article.title,
                url: tab.url,
                content: articleResponse.article.content
            });

            if (!backgroundResponse.success) {
                throw new Error(backgroundResponse.error || "Failed to save article.");
            }

            statusMessage.textContent = "Article Saved! You can now highlight text.";
            statusMessage.className = 'status success';

        } catch (error) {
            statusMessage.textContent = error.message;
            statusMessage.className = 'status error';
            console.error("Save Article Error:", error);
        }
    });
});
