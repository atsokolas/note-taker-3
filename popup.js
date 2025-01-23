// Debugging: Ensure the script is running
console.log("Popup script loaded and ready.");

document.addEventListener("DOMContentLoaded", () => {
    const saveButton = document.getElementById("saveArticleButton");
    const loadButton = document.getElementById("loadArticleButton");
    const highlightButton = document.getElementById("highlightButton");

    if (saveButton) {
        saveButton.addEventListener("click", handleSaveArticle);
    }

    if (loadButton) {
        loadButton.addEventListener("click", loadArticles);
    }

    if (highlightButton) {
        highlightButton.addEventListener("click", highlightTextInPreview);
    }
});

function handleSaveArticle() {
    const articleNameInput = document.getElementById("articleName");

    if (!articleNameInput || !articleNameInput.value.trim()) {
        alert("Please enter an article name.");
        return;
    }

    const articleName = articleNameInput.value.trim();

    // Request content from the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) {
            console.error("No active tab found.");
            return;
        }

        const activeTab = tabs[0];
        console.log("Active tab info:", activeTab);

        if (!activeTab.url || (!activeTab.url.startsWith("http://") && !activeTab.url.startsWith("https://"))) {
            console.error("Cannot run content script on this URL:", activeTab.url);
            return;
        }

        // Inject content script if not already loaded
        chrome.scripting.executeScript(
            {
                target: { tabId: activeTab.id },
                files: ["content.js"],
            },
            () => {
                if (chrome.runtime.lastError) {
                    console.error("Error injecting content script:", chrome.runtime.lastError.message);
                    return;
                }
                console.log("Content script injected successfully.");

                // Send message to extract content
                chrome.tabs.sendMessage(activeTab.id, { action: "extractContent" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Error initiating article extraction:", chrome.runtime.lastError.message);
                        return;
                    }

                    if (response && response.content) {
                        console.log("Article content extracted successfully:", response.content);
                        saveArticle(articleName, response.content);
                    } else {
                        console.warn("No response or content received.");
                    }
                });
            }
        );
    });
}

function saveArticle(title, content) {
    // Demo: Save the article to a local server
    saveArticleToServer(title, content);

    // Future: Replace this with Native Messaging Host integration for production
    // saveArticleLocally(title, content);
}

function saveArticleToServer(title, content) {
    const url = "https://note-taker-3-unrg.onrender.com/save-article";
    const userId = "exampleUserId"; // Replace with dynamic user ID logic if needed

    fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, content, userId }),
    })
        .then((response) => {
            if (response.ok) {
                alert(`Article "${title}" saved successfully!`);
            } else {
                throw new Error(`Failed to save article: ${response.status}`);
            }
        })
        .catch((error) => {
            console.error("Error saving article:", error);
            alert("Error saving article: " + error.message);
        });
}
// Save article locally via Native Messaging Host (production setup)
function saveArticleLocally(title, content) {
    const message = { name: title, content: content };

    chrome.runtime.sendNativeMessage(
        "com.example.save_articles",
        message,
        (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error communicating with native host:", chrome.runtime.lastError.message);
            } else {
                console.log("Article saved locally:", response);
                alert(`Article "${title}" saved successfully!`);
            }
        }
    );
}

function loadArticles() {
    const userId = "exampleUserId"; // Replace with dynamic user ID logic if needed
    const url = `https://note-taker-3-unrg.onrender.com/articles/${userId}`;

    fetch(url)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to load articles: ${response.status}`);
            }
            return response.json();
        })
        .then((articles) => {
            const savedArticlesList = document.getElementById("savedArticlesList");
            const savedArticleContainer = document.getElementById("savedArticleContainer");

            savedArticlesList.innerHTML = "";
            savedArticleContainer.innerHTML = "";

            articles.forEach((article) => {
                const listItem = document.createElement("li");
                listItem.textContent = article.title;
                listItem.addEventListener("click", () => {
                    savedArticleContainer.innerHTML = `<div>${article.content}</div>`;
                });
                savedArticlesList.appendChild(listItem);
            });
        })
        .catch((error) => {
            console.error("Error loading articles:", error);
            alert("Error loading articles: " + error.message);
        });
}

function highlightTextInPreview() {
    const highlightText = document.getElementById("highlightInput").value.trim();
    const articlePreview = document.getElementById("articlePreview");

    if (!highlightText) {
        alert("Please enter text to highlight.");
        return;
    }

    try {
        const markInstance = new Mark(articlePreview);
        markInstance.unmark(); // Remove previous highlights
        markInstance.mark(highlightText, {
            element: "span",
            className: "highlighted",
        });
    } catch (error) {
        console.error("Error during text highlighting:", error);
        alert("Highlighting failed.");
    }
}