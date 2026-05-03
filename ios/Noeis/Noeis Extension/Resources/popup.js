document.addEventListener("DOMContentLoaded", () => {
    const PASSWORD_MIN_LENGTH = 8;
    const NATIVE_APP_ID = "com.atsokolas.noeis.extension";

    const validateRegistration = (username, password, confirmPassword) => {
        const cleanUsername = String(username || '').trim();
        const rawPassword = String(password || '');
        if (!cleanUsername || !rawPassword || !confirmPassword) {
            return "All fields are required.";
        }
        if (rawPassword !== confirmPassword) {
            return "Passwords do not match.";
        }
        if (rawPassword.length < PASSWORD_MIN_LENGTH) {
            return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
        }
        if (cleanUsername.toLowerCase() === rawPassword.trim().toLowerCase()) {
            return "Password cannot match your username.";
        }
        if (!/[A-Za-z]/.test(rawPassword) || !/\d/.test(rawPassword)) {
            return "Password must include at least one letter and one number.";
        }
        return "";
    };

    // --- Element Selectors ---
    const loggedInView = document.getElementById("loggedInView");
    const loggedOutView = document.getElementById("loggedOutView");

    // Logged Out Elements
    const loginView = document.getElementById("loginView");
    const loginForm = document.getElementById("loginForm");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const loginStatusMessage = document.getElementById("loginStatusMessage");
    const showRegisterLink = document.getElementById("showRegisterLink");

    // Register Form Elements
    const registerView = document.getElementById("registerView");
    const registerForm = document.getElementById("registerForm");
    const registerUsernameInput = document.getElementById("registerUsername");
    const registerPasswordInput = document.getElementById("registerPassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const registerStatusMessage = document.getElementById("registerStatusMessage");
    const showLoginLink = document.getElementById("showLoginLink");

    // --- ADD THIS BLOCK BACK ---
    // Logged In Elements (These were missing)
    const saveButton = document.getElementById("saveArticleButton");
    const statusMessage = document.getElementById("statusMessage");
    const folderSelect = document.getElementById("folderSelect");
    const newFolderNameInput = document.getElementById("newFolderName");
    const createFolderButton = document.getElementById("createFolderButton");
    const logoutButton = document.getElementById("logoutButton");
    // --- END BLOCK TO ADD ---


    const BASE_URL = "https://note-taker-3-unrg.onrender.com";
    const TOUR_EXTENSION_SIGNAL_TOKEN_KEY = "tourExtensionSignalToken";

    const sendNativeAuthMessage = async (message) => {
        if (typeof browser !== "undefined" && browser.runtime?.sendNativeMessage) {
            try {
                return await browser.runtime.sendNativeMessage(NATIVE_APP_ID, message);
            } catch (_error) {
                return null;
            }
        }

        if (chrome.runtime?.sendNativeMessage) {
            return await new Promise((resolve) => {
                try {
                    chrome.runtime.sendNativeMessage(NATIVE_APP_ID, message, (response) => {
                        if (chrome.runtime?.lastError) {
                            resolve(null);
                            return;
                        }
                        resolve(response || null);
                    });
                } catch (_error) {
                    resolve(null);
                }
            });
        }

        return null;
    };

    const getAuthToken = async () => {
        const stored = await chrome.storage.local.get("token");
        if (stored?.token) return stored.token;

        const nativeResponse = await sendNativeAuthMessage({ command: "getAuthToken" });
        const nativeToken = nativeResponse?.token || "";
        if (nativeToken) {
            await chrome.storage.local.set({ token: nativeToken });
            return nativeToken;
        }
        return "";
    };

    const saveAuthToken = async (token) => {
        await chrome.storage.local.set({ token });
        await sendNativeAuthMessage({ command: "setAuthToken", token });
    };

    const clearAuthToken = async () => {
        await chrome.storage.local.remove(["token", TOUR_EXTENSION_SIGNAL_TOKEN_KEY]);
        await sendNativeAuthMessage({ command: "clearAuthToken" });
    };

    const readJsonSafe = async (response) => {
        try {
            return await response.json();
        } catch (_error) {
            return null;
        }
    };

    const setStatus = (message, tone = '') => {
        statusMessage.textContent = message;
        statusMessage.className = tone ? `status ${tone}` : 'status';
    };

    const reportTourEvent = async (token, eventType, metadata = {}) => {
        try {
            const response = await fetch(`${BASE_URL}/api/tour/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ eventType, metadata })
            });
            return response.ok;
        } catch (error) {
            console.warn("[WARN - Popup.js] Failed to report tour event:", error);
            return false;
        }
    };

    const reportExtensionConnected = async (token) => {
        if (!token) return;
        const stored = await chrome.storage.local.get(TOUR_EXTENSION_SIGNAL_TOKEN_KEY);
        const sentForToken = stored?.[TOUR_EXTENSION_SIGNAL_TOKEN_KEY] || '';
        if (sentForToken === token) return;
        const ok = await reportTourEvent(token, 'extension_connected', { source: 'extension_popup' });
        if (ok) {
            chrome.storage.local.set({ [TOUR_EXTENSION_SIGNAL_TOKEN_KEY]: token });
        }
    };

    // --- Core Logic ---

    // This function checks for a token and shows the correct UI view.
    const updatePopupView = async () => {
        const token = await getAuthToken();
        if (token) {
            loggedInView.style.display = 'block';
            loggedOutView.style.display = 'none';
            fetchFolders(token); // Fetch folders now that we know we're logged in
            reportExtensionConnected(token);
        } else {
            loggedInView.style.display = 'none';
            loggedOutView.style.display = 'block';

            // --- ADD THESE TWO LINES ---
            loginView.style.display = 'block';    // Show login form by default
            registerView.style.display = 'none'; // Hide register form
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
                await saveAuthToken(data.token);
                console.log("Token saved. Switching to logged-in view.");
                updatePopupView(); // Switch to the main "Save Article" view
            } else {
                throw new Error("Login successful, but no token received.");
            }
        } catch (error) {
            loginStatusMessage.textContent = error.message;
            loginStatusMessage.className = 'status error';
            console.error("Login failed:", error);
        }
    };

        // --- NEW FUNCTION: Handle Account Registration ---
    const handleRegister = async (event) => {
        event.preventDefault();
        registerStatusMessage.textContent = "Creating account...";
        registerStatusMessage.className = 'status';

        const username = registerUsernameInput.value;
        const password = registerPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        const validationMessage = validateRegistration(username, password, confirmPassword);
        if (validationMessage) {
            registerStatusMessage.textContent = validationMessage;
            registerStatusMessage.className = 'status error';
            return;
        }

        // --- API Call ---
        try {
            const response = await fetch(`${BASE_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                // Handle errors like "Username already exists"
                throw new Error(data.error || `Error ${response.status}`);
            }

            registerView.style.display = 'none';
            loginView.style.display = 'block';
            loginStatusMessage.textContent = data.loginMessage || "Account created. Please log in.";
            loginStatusMessage.className = 'status success';
            usernameInput.value = username.trim();
            passwordInput.value = "";
            registerStatusMessage.textContent = "";
            registerForm.reset();

        } catch (error) {
            registerStatusMessage.textContent = error.message;
            registerStatusMessage.className = 'status error';
            console.error("Registration failed:", error);
        }
    };


    // Fetches folders from the server using a token.
    const fetchFolders = async (token) => {
        try {
            const response = await fetch(`${BASE_URL}/api/folders`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                 const errorData = await readJsonSafe(response);
                 throw new Error(errorData?.error || `Error ${response.status}`);
            }
            const folders = await readJsonSafe(response) || [];
            populateFoldersDropdown(folders);
        } catch (error) {
            setStatus(error.message, 'error');
            console.error("[ERROR - Popup.js] Failed to fetch folders:", error);
        }
    };
    
    // Populates the folder dropdown menu.
    const populateFoldersDropdown = (folders) => {
        folderSelect.innerHTML = '<option value="">Uncategorized</option>'; 
        [...folders]
            .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
            .forEach(folder => {
            const option = document.createElement("option");
            option.value = folder._id;
            option.textContent = folder.name;
            folderSelect.appendChild(option);
        });
    };

    // --- Event Listeners ---

    // Listener for the new login form
    loginForm.addEventListener("submit", handleLogin);
    
    // Listener for the new register form
    registerForm.addEventListener("submit", handleRegister);

    // Listener to show register form
    showRegisterLink.addEventListener("click", (e) => {
        e.preventDefault();
        loginView.style.display = 'none';
        registerView.style.display = 'block';
        loginStatusMessage.textContent = ''; // Clear any login errors
    });

    // Listener to show login form
    showLoginLink.addEventListener("click", (e) => {
        e.preventDefault();
        registerView.style.display = 'none';
        loginView.style.display = 'block';
        registerStatusMessage.textContent = ''; // Clear any register errors
    });

    // Listener for the logout button
    logoutButton.addEventListener("click", async () => {
        await clearAuthToken();
        console.log("Token removed, user logged out.");
        updatePopupView(); // Switch to the logged-out view
    });

    // Listener for the "Create Folder" button
    createFolderButton.addEventListener("click", async () => {
        const folderName = newFolderNameInput.value.trim();
        if (!folderName) {
            setStatus("Enter a folder name first.", 'error');
            return;
        }
        const originalLabel = createFolderButton.textContent;
        createFolderButton.disabled = true;
        createFolderButton.textContent = "…";
        try {
            const token = await getAuthToken();
            if (!token) throw new Error("Authentication token not found. Please log in.");

            const response = await fetch(`${BASE_URL}/api/folders`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ name: folderName })
            });
            if (!response.ok) {
                 const errorData = await readJsonSafe(response);
                 throw new Error(errorData?.error || "Failed to create folder.");
            }
            const newFolder = await readJsonSafe(response);
            populateFoldersDropdown([...(Array.from(folderSelect.options)
                .filter(option => option.value)
                .map(option => ({ _id: option.value, name: option.textContent }))), newFolder]);
            folderSelect.value = newFolder._id;

            newFolderNameInput.value = "";
            setStatus(`Folder "${newFolder.name}" created.`, 'success');
        } catch (error) {
            setStatus(error.message, 'error');
            console.error("[ERROR - Popup.js] Failed to create folder:", error);
        } finally {
            createFolderButton.disabled = false;
            createFolderButton.textContent = originalLabel;
        }
    });

    // Listener for the "Save Article" button
    saveButton.addEventListener("click", async () => {
        setStatus("Parsing article...");
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab || typeof tab.id === 'undefined') {
                throw new Error("No active tab found.");
            }

            const articleResponse = await chrome.tabs.sendMessage(tab.id, { action: "getCleanArticle" });
            
            if (!articleResponse || articleResponse.error) {
                throw new Error(articleResponse?.error || "Content script failed.");
            }
            
            setStatus("Saving article...");
            
            // --- MODIFIED MESSAGE PAYLOAD ---
            // Pass all the new data from the article object
            const messagePayload = {
                action: "capture",
                tabId: tab.id,
                url: tab.url,
                title: articleResponse.article.title,
                content: articleResponse.article.content,
                author: articleResponse.article.author,
                publicationDate: articleResponse.article.publicationDate,
                siteName: articleResponse.article.siteName,
                folderId: folderSelect.value
            };
            // --- END MODIFIED PAYLOAD ---
            
            const backgroundResponse = await chrome.runtime.sendMessage(messagePayload);

            if (!backgroundResponse || !backgroundResponse.success) {
                throw new Error(backgroundResponse?.error || "Background service failed.");
            }

            setStatus("Article saved.", 'success');
        } catch (error) {
            setStatus(error.message, 'error');
            console.error("[ERROR - Popup.js] Error saving article:", error);
        }
    });
    // --- Initial Setup ---
    // This will check if the user is logged in and show the correct view when the popup opens.
    updatePopupView();
});
