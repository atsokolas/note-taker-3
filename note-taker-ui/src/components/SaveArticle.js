/* global chrome */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BASE_URL } from '../apiConfig';

const SaveArticle = () => {
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const fetchFolders = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/folders`, { withCredentials: true });
        setFolders(response.data);
        if (response.data.length > 0) {
            // Optional: pre-select the first folder
            setSelectedFolder(response.data[0]._id); 
        }
      } catch (error) {
        console.error("Could not fetch folders", error);
        setStatusMessage('Error: Could not fetch folders.');
      }
    };
    fetchFolders();
  }, []);

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setStatusMessage('Creating folder...');
    try {
        const response = await axios.post(`${BASE_URL}/folders`, 
            { name: newFolderName }, 
            { withCredentials: true }
        );
        const newFolder = response.data;
        setFolders([...folders, newFolder]);
        setSelectedFolder(newFolder._id);
        setNewFolderName('');
        setStatusMessage('Folder created!');
    } catch (error) {
        setStatusMessage('Error creating folder.');
        console.error("Folder creation error:", error);
    }
  };
  
  // --- THIS IS THE UPDATED FUNCTION ---
  const handleSaveArticle = async () => {
    setStatusMessage('Saving article...');
    console.log('[DEBUG - Popup] "Save Current Page" button clicked.');

    // 1. Get the current active tab to find its URL and title
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab) {
        console.error('[DEBUG - Popup] Could not get current tab.');
        setStatusMessage('Error: Could not find active tab.');
        return;
      }

      const articleDetails = {
        action: "capture", // This must match the listener in background.js
        title: currentTab.title,
        url: currentTab.url,
        tabId: currentTab.id,
        folderId: selectedFolder || null // Send selected folder ID or null
      };

      // 2. Send the message to background.js
      console.log('[DEBUG - Popup] Sending "capture" message to background script with details:', articleDetails);
      chrome.runtime.sendMessage(articleDetails, (response) => {
        if (chrome.runtime.lastError) {
          // This catches errors if the background script isn't available
          console.error('[DEBUG - Popup] Error sending message:', chrome.runtime.lastError.message);
          setStatusMessage(`Error: ${chrome.runtime.lastError.message}`);
          return;
        }

        // 3. Handle the response from background.js
        console.log('[DEBUG - Popup] Received response from background script:', response);
        if (response && response.success) {
          setStatusMessage('Article saved successfully!');
        } else {
          setStatusMessage(`Failed to save: ${response?.error || 'Unknown error'}`);
        }
      });
    });
  };

  return (
    <div className="save-article-container">
        <h3 className="title">Save Article</h3>
        
        <div className="form-group">
            <label htmlFor="folderSelect">Choose a Folder:</label>
            <select id="folderSelect" value={selectedFolder} onChange={e => setSelectedFolder(e.target.value)}>
                <option value="">Uncategorized</option>
                {folders.map(folder => (
                    <option key={folder._id} value={folder._id}>{folder.name}</option>
                ))}
            </select>
        </div>

        <form className="folder-creation-form" onSubmit={handleCreateFolder}>
            <input 
              type="text" 
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="New folder name"
            />
            <button type="submit">Create Folder</button>
        </form>

        <button onClick={handleSaveArticle} className="save-article-main-button">Save Current Page</button>
        {statusMessage && <p className="status-message">{statusMessage}</p>}
    </div>
  );
};

export default SaveArticle;
