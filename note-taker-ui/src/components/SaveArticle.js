/* global chrome */
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

const SaveArticle = () => {
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  // When the component loads, fetch the user's folders
  useEffect(() => {
    const fetchFolders = async () => {
      try {
        // The browser automatically sends the auth cookie with this request
        const response = await axios.get(`${BASE_URL}/folders`, { withCredentials: true });
        setFolders(response.data);
      } catch (error) {
        console.error("Could not fetch folders", error);
        setStatusMessage('Error: Could not fetch folders.');
      }
    };
    fetchFolders();
  }, []);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
        alert("Please enter a folder name.");
        return;
    }
    try {
        const response = await axios.post(`${BASE_URL}/folders`, 
            { name: newFolderName }, 
            { withCredentials: true }
        );
        
        const newFolder = response.data;
        // Add new folder to our list and automatically select it
        setFolders([...folders, newFolder]);
        setSelectedFolder(newFolder._id);
        setNewFolderName(''); // Clear input
        setStatusMessage(`Folder "${newFolder.name}" created!`);

    } catch (error) {
        setStatusMessage('Error creating folder.');
        console.error("Create folder error:", error);
    }
  };
  
  const handleSaveArticle = async () => {
    setStatusMessage('Parsing article...');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const articleResponse = await chrome.tabs.sendMessage(tab.id, { action: "getCleanArticle" });

      if (articleResponse.error) throw new Error(articleResponse.error);
      
      setStatusMessage('Saving article...');
      const payload = {
          action: "capture",
          tabId: tab.id,
          title: articleResponse.article.title,
          url: tab.url,
          content: articleResponse.article.content,
          folderId: selectedFolder || null
      };

      const backgroundResponse = await chrome.runtime.sendMessage(payload);
      if (!backgroundResponse || !backgroundResponse.success) {
          throw new Error(backgroundResponse?.error || "Failed to save article.");
      }

      setStatusMessage('Article Saved!');
      setTimeout(() => setStatusMessage(''), 3000);

    } catch (error) {
        setStatusMessage(`Error: ${error.message}`);
        console.error("Save article error:", error);
    }
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

        <div className="form-group folder-creation">
            <input 
              type="text" 
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="Or create a new folder..."
            />
            <button onClick={handleCreateFolder}>+</button>
        </div>

        <button onClick={handleSaveArticle} className="auth-button">Save Article</button>
        {statusMessage && <p className="status-message">{statusMessage}</p>}
    </div>
  );
};

export default SaveArticle;
