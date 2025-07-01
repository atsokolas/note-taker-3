// popup.js - UPDATED WITH FOLDER LOGIC

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
        }
    };

    // --- NEW: Function to add folders to the dropdown menu ---
    const populateFoldersDropdown = (folders) => {
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
            folderSelect.value = newFolder._id;

            newFolderNameInput.value = ""; // Clear the input field
        } catch (error) {
            alert(error.message);
        }
    });

    // --- UPDATED: The "Save Article" button logic ---
    saveButton.addEventListener("click", async () => {
        statusMessage.textContent = "Parsing article...";
        statusMessage.className = 'status';
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const articleResponse = await chrome.tabs.sendMessage(tab.id, { action: "getCleanArticle" });

            if (articleResponse.error) throw new Error(articleResponse.error);
            
            statusMessage.textContent = "Saving article...";
            
            // Get the selected folder ID from the dropdown
            const selectedFolderId = folderSelect.value;
            
            // Send the folderId along with the rest of the data
            const backgroundResponse = await chrome.runtime.sendMessage({
                action: "capture",
                tabId: tab.id,
                title: articleResponse.article.title,
                url: tab.url,
                content: articleResponse.article.content,
                folderId: selectedFolderId // <-- The new data point
            });

            if (!backgroundResponse.success) throw new Error(backgroundResponse.error);

            statusMessage.textContent = "Article Saved!";
            statusMessage.className = 'status success';
        } catch (error) {
            statusMessage.textContent = error.message;
            statusMessage.className = 'status error';
        }
    });

    // --- Load folders when the popup is opened ---
    fetchFolders();
});
