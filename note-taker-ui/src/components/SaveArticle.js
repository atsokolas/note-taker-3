/* global chrome */
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

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
      } catch (error) {
        console.error("Could not fetch folders", error);
        setStatusMessage('Error: Could not fetch folders.');
      }
    };
    fetchFolders();
  }, []);

  const handleCreateFolder = async (e) => {
    e.preventDefault(); // Prevent form submission
    if (!newFolderName.trim()) return;
    try {
        const response = await axios.post(`${BASE_URL}/folders`, 
            { name: newFolderName }, 
            { withCredentials: true }
        );
        const newFolder = response.data;
        setFolders([...folders, newFolder]);
        setSelectedFolder(newFolder._id);
        setNewFolderName('');
    } catch (error) {
        setStatusMessage('Error creating folder.');
    }
  };
  
  const handleSaveArticle = async () => {
    // ... (Your existing handleSaveArticle logic remains the same)
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
