document.addEventListener("DOMContentLoaded", function () {
    console.log("DOM fully loaded, attaching event listeners...");

    // Ensure saveButton exists before adding event listener
    const saveButton = document.querySelector("#saveArticleButton");
    if (!saveButton) {
        console.error("❌ saveButton not found in popup.html");
        return;
    }

    saveButton.addEventListener("click", function () {
        console.log("Save Article button clicked!");

        // Get active tab
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (chrome.runtime.lastError) {
                console.error("Error querying active tab:", chrome.runtime.lastError.message);
                return;
            }

            if (tabs.length === 0) {
                console.error("❌ No active tab found.");
                return;
            }

            // Send message to content script
            chrome.tabs.sendMessage(tabs[0].id, { action: "extractContent" }, function (response) {
                if (chrome.runtime.lastError) {
                    console.error("❌ Error sending message to content script:", chrome.runtime.lastError.message);
                    return;
                }

                console.log("Extracted content received:", response);

                if (response && response.content) {
                    saveArticle(response.title, response.content);
                } else {
                    console.error("❌ No content extracted.");
                }
            });
        });
    });

    // Load Mark.js dynamically
    loadMarkJS();
});

// Function to send article data to the backend
function saveArticle(title, content) {
    fetch("https://note-taker-3-unrg.onrender.com/save-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, userId: "exampleUserId" }) // Replace with actual user ID
    })
    .then(response => response.json())
    .then(data => console.log("✅ Server response:", data))
    .catch(error => console.error("❌ Error saving article:", error));
}

// Function to dynamically load Mark.js
async function loadMarkJS() {
    try {
        const response = await fetch("https://cdnjs.cloudflare.com/ajax/libs/mark.js/8.11.1/mark.min.js");
        const scriptText = await response.text();
        const scriptElement = document.createElement("script");
        scriptElement.textContent = scriptText;
        document.head.appendChild(scriptElement);
        console.log("✅ Mark.js loaded dynamically");
    } catch (error) {
        console.error("❌ Failed to load Mark.js:", error);
    }
}
