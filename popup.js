// popup.js - UPDATED WITH FOLDER LOGIC AND ENHANCED ERROR HANDLING FOR COMMUNICATION

document.addEventListener("DOMContentLoaded", () => {
    // Get all the new UI elements
    const saveButton = document.getElementById("saveArticleButton");
    const statusMessage = document.getElementById("statusMessage");
    const folderSelect = document.getElementById("folderSelect");
    const newFolderNameInput = document.getElementById("newFolderName");
    const createFolderButton = document.getElementById("createFolderButton");

    const BASE_URL = "https://note-taker-3-unrg.onrender.com";

    // --- NEW: Function to fetch folders from the API ---
    const fetchFolders = async () => {
        try {
            const response = await fetch(`${BASE_URL}/folders`);
            if (!response.ok) throw new Error("Failed to fetch folders");
            const folders = await response.json();
            populateFoldersDropdown(folders);
        } catch (error) {
            statusMessage.textContent = error.message;
            statusMessage.className = 'status error';
            console.error("[ERROR - Popup.js] Failed to fetch folders:", error); // Added debug log
        }
    };

    // --- NEW: Function to add folders to the dropdown menu ---
    const populateFoldersDropdown = (folders) => {
        // Clear existing options first to prevent duplicates on re-fetch
        folderSelect.innerHTML = '<option value="">Uncategorized</option>'; 
        folders.forEach(folder => {
            const option = document.createElement("option");
            option.value = folder._id;
            option.textContent = folder.name;
            folderSelect.appendChild(option);
        });
    };

    // --- NEW: Logic for the "Create Folder" button ---
    createFolderButton.addEventListener("click", async () => {
        const folderName = newFolderNameInput.value.trim();
        if (!folderName) {
            alert("Please enter a folder name.");
            return;
        }
        try {
            const response = await fetch(`${BASE_URL}/folders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: folderName })
            });
            if (!response.ok) {
                 const errorData = await response.json();
                 throw new Error(errorData.error || "Failed to create folder.");
            }
            const newFolder = await response.json();
            
            // Add the new folder to the dropdown and select it
            const option = document.createElement("option");
            option.value = newFolder._id;
            option.textContent = newFolder.name;
            folderSelect.appendChild(option);
            folderSelect.value = newFolder._id; // Select the newly created folder

            newFolderNameInput.value = ""; // Clear the input field
            statusMessage.textContent = `Folder "${newFolder.name}" created!`; // More descriptive status
            statusMessage.className = 'status success';
        } catch (error) {
            alert(error.message);
            statusMessage.textContent = error.message;
            statusMessage.className = 'status error';
            console.error("[ERROR - Popup.js] Failed to create folder:", error); // Added debug log
        }
    });

    // --- UPDATED: The "Save Article" button logic ---
    saveButton.addEventListener("click", async () => {
        statusMessage.textContent = "Parsing article...";
        statusMessage.className = 'status';
        console.log("[DEBUG - Popup.js] Save button clicked, initiating parsing."); // Added debug log
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Check if the tab.id is valid
            if (!tab || typeof tab.id === 'undefined') {
                throw new Error("No active tab found or tab ID is undefined.");
            }

            console.log(`[DEBUG - Popup.js] Sending 'getCleanArticle' message to tab ID: ${tab.id}`);
            const articleResponse = await chrome.tabs.sendMessage(tab.id, { action: "getCleanArticle" });
            
            // Handle potential errors or missing response from content script
            if (!articleResponse || articleResponse.error) {
                throw new Error(articleResponse?.error || "Content script failed to return article data.");
            }
            console.log("[DEBUG - Popup.js] Article data received from content script:", articleResponse.article.title);
            
            statusMessage.textContent = "Saving article...";
            
            const selectedFolderId = folderSelect.value;
            
            const messagePayload = {
                action: "capture",
                tabId: tab.id,
                title: articleResponse.article.title,
                url: tab.url,
                content: articleResponse.article.content,
                folderId: selectedFolderId
            };
            console.log("[DEBUG - Popup.js] Sending 'capture' message to background:", messagePayload);

            // Using a try-catch around sendMessage as it can throw directly if no listener is present
            let backgroundResponse;
            try {
                 backgroundResponse = await chrome.runtime.sendMessage(messagePayload);
            } catch (sendMessageError) {
                if (sendMessageError.message.includes("Receiving end does not exist")) {
                    throw new Error("Extension background service is not active or crashed. Please try reloading the extension in chrome://extensions/.");
                }
                throw sendMessageError; // Re-throw other errors
            }

            if (!backgroundResponse || !backgroundResponse.success) {
                throw new Error(backgroundResponse?.error || "Failed to save article: Background service did not respond or indicated failure.");
            }

            statusMessage.textContent = "Article Saved!";
            statusMessage.className = 'status success';
            console.log("[DEBUG - Popup.js] Article saved successfully by background service.");
        } catch (error) {
            statusMessage.textContent = error.message;
            statusMessage.className = 'status error';
            console.error("[ERROR - Popup.js] Error saving article:", error); // Added debug log
        }
    });

    // --- Load folders when the popup is opened ---
    fetchFolders();
});
