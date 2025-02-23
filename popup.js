document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("saveButton").addEventListener("click", function () {
        // Get active tab
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs.length === 0) {
                console.error("No active tab found.");
                return;
            }

            // Send message to content.js to extract article content
            chrome.tabs.sendMessage(tabs[0].id, { action: "extractContent" }, function (response) {
                if (chrome.runtime.lastError) {
                    console.error("Error sending message to content script:", chrome.runtime.lastError.message);
                    return;
                }

                console.log("Extracted content received:", response);

                if (response && response.content) {
                    saveArticle(response.title, response.content);
                } else {
                    console.error("No content extracted.");
                }
            });
        });
    });
});

// Function to send article data to the backend
function saveArticle(title, content) {
    fetch("https://note-taker-3-unrg.onrender.com/save-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, userId: "exampleUserId" }) // Replace with actual user ID
    })
    .then(response => response.json())
    .then(data => console.log("Server response:", data))
    .catch(error => console.error("Error saving article:", error));
}