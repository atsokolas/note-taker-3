document.addEventListener("DOMContentLoaded", () => {
    // --- Element Selectors ---
    const loggedInView = document.getElementById("loggedInView");
    const loggedOutView = document.getElementById("loggedOutView");

    // Logged Out Elements
    const loginForm = document.getElementById("loginForm");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const loginStatusMessage = document.getElementById("loginStatusMessage");

    // Logged In Elements
    const saveButton = document.getElementById("saveArticleButton");
    const statusMessage = document.getElementById("statusMessage");
    const folderSelect = document.getElementById("folderSelect");
    const newFolderNameInput = document.getElementById("newFolderName");
    const createFolderButton = document.getElementById("createFolderButton");
    const logoutButton = document.getElementById("logoutButton");

    const BASE_URL = "https://note-taker-3-unrg.onrender.com";

    // --- Core Logic ---

    // This function checks for a token and shows the correct UI view.
    const updatePopupView = async () => {
        const { token } = await chrome.storage.local.get("token");
        if (token) {
            loggedInView.style.display = 'block';
            loggedOutView.style.display = 'none';
            fetchFolders(token); // Fetch folders now that we know we're logged in
        } else {
            loggedInView.style.display = 'none';
            loggedOutView.style.display = 'block';
        }
    };

    // This function handles the new login form inside the popup.
    const handleLogin = async (event) => {
        event.preventDefault();
        loginStatusMessage.textContent = "Logging in...";
        loginStatusMessage.className = 'status';

        const username = usernameInput.value;
        const password = passwordInput.value;

        try {
            const response = await fetch(`${BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `Error ${response.status}`);
            }

            if (data.token) {
                chrome.storage.local.set({ token: data.token }, () => {
                    console.log("Token saved. Switching to logged-in view.");
                    updatePopupView(); // Switch to the main "Save Article" view
                });
            } else {
                throw new Error("Login successful, but no token received.");
            }
        } catch (error) {
            loginStatusMessage.textContent = error.message;
            loginStatusMessage.className = 'status error';
            console.error("Login failed:", error);
        }
    };

    // Fetches folders from the server using a token.
    const fetchFolders = async (token) => {
        try {
            const response = await fetch(`${BASE_URL}/folders`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                 const errorData = await response.json();
                 throw new Error(errorData.error || `Error ${response.status}`);
            }
            const folders = await response.json();
            populateFoldersDropdown(folders);
        } catch (error) {
            statusMessage.textContent = error.message;
            statusMessage.className = 'status error';
            console.error("[ERROR - Popup.js] Failed to fetch folders:", error);
        }
    };
    
    // Populates the folder dropdown menu.
    const populateFoldersDropdown = (folders) => {
        folderSelect.innerHTML = '<option value="">Uncategorized</option>'; 
        folders.forEach(folder => {
            const option = document.createElement("option");
            option.value = folder._id;
            option.textContent = folder.name;
            folderSelect.appendChild(option);
        });
    };

    // --- Event Listeners ---

    // Listener for the new login form
    loginForm.addEventListener("submit", handleLogin);

    // Listener for the logout button
    logoutButton.addEventListener("click", () => {
        chrome.storage.local.remove("token", () => {
            console.log("Token removed, user logged out.");
            updatePopupView(); // Switch to the logged-out view
        });
    });

    // Listener for the "Create Folder" button
    createFolderButton.addEventListener("click", async () => {
        const folderName = newFolderNameInput.value.trim();
        if (!folderName) {
            alert("Please enter a folder name.");
            return;
        }
        try {
            const { token } = await chrome.storage.local.get("token");
            if (!token) throw new Error("Authentication token not found. Please log in.");

            const response = await fetch(`${BASE_URL}/folders`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ name: folderName })
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
            console.error("[ERROR - Popup.js] Failed to create folder:", error);
        }
    });

    // Listener for the "Save Article" button
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
                throw new Error(articleResponse?.error || "Content script failed.");
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
                throw new Error(backgroundResponse?.error || "Background service failed.");
            }

            statusMessage.textContent = "Article Saved!";
            statusMessage.className = 'status success';
        } catch (error) {
            statusMessage.textContent = error.message;
            statusMessage.className = 'status error';
            console.error("[ERROR - Popup.js] Error saving article:", error);
        }
    });

    // --- Initial Setup ---
    // This will check if the user is logged in and show the correct view when the popup opens.
    updatePopupView();
});
