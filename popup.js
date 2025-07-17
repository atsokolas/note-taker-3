/* global chrome */
document.addEventListener("DOMContentLoaded", () => {
    // Get all UI elements from popup.html
    const saveArticleContainer = document.getElementById("saveArticleContainer");
    const loginContainer = document.getElementById("loginContainer");
    const loginButton = document.getElementById("loginButton");
    const saveButton = document.getElementById("saveArticleButton");
    const statusMessage = document.getElementById("statusMessage");
    const folderSelect = document.getElementById("folderSelect");
    const newFolderNameInput = document.getElementById("newFolderName");
    const createFolderButton = document.getElementById("createFolderButton");

    // Define constants
    const BASE_URL = "https://note-taker-3-unrg.onrender.com";
    const WEB_LOGIN_URL = "https://note-taker-3-unrg.onrender.com/login";

    // --- NEW: Functions to show the correct view ---
    const showLoginView = () => {
        saveArticleContainer.classList.add('hidden');
        loginContainer.classList.remove('hidden');
    };

    const showSaveArticleView = () => {
        loginContainer.classList.add('hidden');
        saveArticleContainer.classList.remove('hidden');
    };

    // --- UPDATED: This function now checks for authentication ---
    const fetchFolders = async () => {
        try {
            // Add 'credentials: include' to send the auth cookie with the request
            const response = await fetch(`${BASE_URL}/folders`, { credentials: 'include' });

            // If status is 401, the user is not logged in
            if (response.status === 401) {
                showLoginView();
                return; // Stop execution
            }

            if (!response.ok) {
                throw new Error("Failed to fetch folders");
            }

            // If successful, show the main UI and populate data
            showSaveArticleView();
            const folders = await response.json();
            populateFoldersDropdown(folders);

        } catch (error) {
            statusMessage.textContent = error.message;
            statusMessage.className = 'status error';
            console.error("[ERROR] Failed to fetch folders:", error);
        }
    };

    const populateFoldersDropdown = (folders) => {
        folderSelect.innerHTML = '<option value="">Uncategorized</option>';
        folders.forEach(folder => {
            const option = document.createElement("option");
            option.value = folder._id;
            option.textContent = folder.name;
            folderSelect.appendChild(option);
        });
    };

    // --- NEW: Event listener for the login button ---
    loginButton.addEventListener('click', () => {
        chrome.tabs.create({ url: WEB_LOGIN_URL });
        window.close(); // Close the popup after opening the tab
    });

    // --- UPDATED: Logic for the "Create Folder" button ---
    createFolderButton.addEventListener("click", async () => {
        const folderName = newFolderNameInput.value.trim();
        if (!folderName) {
            alert("Please enter a folder name.");
            return;
        }
        try {
            // Add 'credentials: include' to this fetch call as well
            const response = await fetch(`${BASE_URL}/folders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: folderName }),
                credentials: 'include' // Important for authentication
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to create folder.");
            }
            const newFolder = await response.json();

            const option = document.createElement("option");
            option.value = newFolder._id;
            option.textContent = newFolder.name;
            folderSelect.appendChild(option);
            folderSelect.value = newFolder._id;

            newFolderNameInput.value = "";
            statusMessage.textContent = `Folder "${newFolder.name}" created!`;
            statusMessage.className = 'status success';
        } catch (error) {
            alert(error.message);
            statusMessage.textContent = error.message;
            statusMessage.className = 'status error';
            console.error("[ERROR] Failed to create folder:", error);
        }
    });

    // --- The "Save Article" button logic (no changes needed here) ---
    saveButton.addEventListener("click", async () => {
        statusMessage.textContent = "Parsing article...";
        statusMessage.className = 'status';

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || typeof tab.id === 'undefined') {
                throw new Error("No active tab found.");
            }

            const articleResponse = await chrome.tabs.sendMessage(tab.id, { action: "getCleanArticle" });
            if (!articleResponse || articleResponse.error) {
                throw new Error(articleResponse?.error || "Failed to parse article data.");
            }

            statusMessage.textContent = "Saving article...";
            const messagePayload = {
                action: "capture",
                tabId: tab.id,
                title: articleResponse.article.title,
                url: tab.url,
                content: articleResponse.article.content,
                folderId: folderSelect.value
            };

            const backgroundResponse = await chrome.runtime.sendMessage(messagePayload);
            if (!backgroundResponse || !backgroundResponse.success) {
                throw new Error(backgroundResponse?.error || "Failed to save article.");
            }

            statusMessage.textContent = "Article Saved!";
            statusMessage.className = 'status success';
        } catch (error) {
            statusMessage.textContent = error.message;
            statusMessage.className = 'status error';
            console.error("[ERROR] Error saving article:", error);
        }
    });

    // --- Initial check to see if user is logged in when popup opens ---
    fetchFolders();
});
