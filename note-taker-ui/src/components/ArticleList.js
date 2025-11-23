import React, { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import api from '../api'; // UPDATED: Import the custom api instance

const AccordionIcon = ({ isOpen }) => (
    <svg className={`accordion-icon ${isOpen ? 'open' : ''}`} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const ArticleList = () => {
    const [groupedArticles, setGroupedArticles] = useState({});
    const [folders, setFolders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [openFolder, setOpenFolder] = useState(null);
    const [newFolderName, setNewFolderName] = useState('');
    const [pdfTitle, setPdfTitle] = useState('');
    const [pdfFile, setPdfFile] = useState(null);
    const [pdfFolder, setPdfFolder] = useState('uncategorized');
    const [pdfStatus, setPdfStatus] = useState('');
    const [pdfError, setPdfError] = useState('');
    const [pdfUploading, setPdfUploading] = useState(false);

    const fetchAndGroupArticles = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error("Authentication token not found.");
            const authHeaders = { headers: { 'Authorization': `Bearer ${token}` } };

            const articlesResponse = await api.get('/get-articles', authHeaders);
            const foldersResponse = await api.get('/folders', authHeaders);
            
            const articlesData = articlesResponse.data;
            const foldersData = foldersResponse.data;

            setFolders(foldersData); 

            const initialGroupedArticles = {};
            initialGroupedArticles['uncategorized'] = { id: 'uncategorized', name: 'Uncategorized', articles: [] };
            
            foldersData.forEach(folder => {
                initialGroupedArticles[folder._id] = { id: folder._id, name: folder.name, articles: [] };
            });

            articlesData.forEach(article => {
                const folderId = article.folder ? article.folder._id : 'uncategorized';
                if (initialGroupedArticles[folderId]) {
                    initialGroupedArticles[folderId].articles.push(article);
                } else {
                    initialGroupedArticles['uncategorized'].articles.push(article);
                }
            });

            setGroupedArticles(initialGroupedArticles);

        } catch (err) {
            console.error("Failed to fetch articles or folders:", err);
            // The interceptor will handle auth errors, so only set state for other errors.
            if (err.response?.status !== 401 && err.response?.status !== 403) {
                setError("Failed to load articles or folders. Please try logging in again.");
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAndGroupArticles();
    }, [fetchAndGroupArticles]);

    const handleFolderClick = (folderId) => {
        setOpenFolder(openFolder === folderId ? null : folderId);
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error("Authentication token not found.");
            const authHeaders = { headers: { 'Authorization': `Bearer ${token}` } };

            const response = await api.post('/folders', { name: newFolderName.trim() }, authHeaders);
            alert(`Folder "${response.data.name}" created successfully!`);
            setNewFolderName('');
            await fetchAndGroupArticles(); 
        } catch (err) {
            console.error("Error creating folder:", err);
            alert(err.response?.data?.error || "Failed to create folder.");
        }
    };

    const handleDeleteFolder = async (folderId, folderName) => {
        if (!window.confirm(`Are you sure you want to delete "${folderName}"?`)) return;
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error("Authentication token not found.");
            const authHeaders = { headers: { 'Authorization': `Bearer ${token}` } };

            await api.delete(`/folders/${folderId}`, authHeaders);
            alert(`Folder "${folderName}" deleted successfully!`);
            if (openFolder === folderId) setOpenFolder(null);
            await fetchAndGroupArticles(); 
        } catch (err) {
            console.error("Error deleting folder:", err);
            alert(err.response?.data?.error || "Failed to delete folder.");
        }
    };

    const handlePdfFileChange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.type !== 'application/pdf') {
            setPdfError('Please select a PDF file.');
            setPdfFile(null);
            event.target.value = '';
            return;
        }
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            setPdfError('PDF must be 10MB or smaller.');
            setPdfFile(null);
            event.target.value = '';
            return;
        }
        setPdfError('');
        setPdfStatus(`Ready to upload ${file.name}`);
        setPdfFile(file);
        if (!pdfTitle.trim()) {
            const nameWithoutExt = file.name.replace(/\\.pdf$/i, '');
            setPdfTitle(nameWithoutExt || 'Uploaded PDF');
        }
    };

    const handleUploadPdf = async () => {
        if (!pdfFile) {
            setPdfError('Choose a PDF to upload.');
            return;
        }
        const titleToUse = pdfTitle.trim() || pdfFile.name.replace(/\\.pdf$/i, '') || 'Uploaded PDF';
        setPdfUploading(true);
        setPdfError('');
        setPdfStatus('Uploading PDF...');
        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (e.target?.result) resolve(e.target.result);
                    else reject(new Error('Could not read file.'));
                };
                reader.onerror = () => reject(new Error('Could not read file.'));
                reader.readAsDataURL(pdfFile);
            });

            const token = localStorage.getItem('token');
            if (!token) throw new Error("Authentication token not found.");
            const authHeaders = { headers: { 'Authorization': `Bearer ${token}` } };

            const payload = {
                title: titleToUse,
                url: `uploaded://${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                content: '',
                folderId: pdfFolder === 'uncategorized' ? null : pdfFolder,
                pdfs: [{
                    id: `pdf-${Date.now()}`,
                    name: pdfFile.name,
                    dataUrl,
                    uploadedAt: new Date().toISOString(),
                    annotations: []
                }],
                author: '',
                publicationDate: '',
                siteName: ''
            };

            await api.post('/save-article', payload, authHeaders);
            setPdfStatus('PDF uploaded successfully.');
            setPdfFile(null);
            setPdfTitle('');
            setPdfFolder('uncategorized');
            await fetchAndGroupArticles();
        } catch (err) {
            console.error("Error uploading PDF:", err);
            setPdfError(err.response?.data?.error || err.message || "Failed to upload PDF.");
        } finally {
            setPdfUploading(false);
        }
    };

    if (loading) return <p className="status-message">Loading articles...</p>;
    if (error) return <p className="status-message" style={{ color: 'red' }}>{error}</p>;

    const sortedFolderKeys = Object.keys(groupedArticles).sort((a, b) => {
        if (a === 'uncategorized') return -1;
        if (b === 'uncategorized') return 1;
        return groupedArticles[a].name.localeCompare(groupedArticles[b].name);
    });

    return (
        <>
            <h1>Your Library</h1>
            <div className="upload-card">
                <div className="upload-card-header">
                    <div>
                        <p className="eyebrow">Upload PDF</p>
                        <h3>Drop research right into a folder</h3>
                        <p className="muted small">Select a PDF, give it a title, and choose where it lives.</p>
                    </div>
                    <label className="upload-pill">
                        <input type="file" accept="application/pdf" onChange={handlePdfFileChange} disabled={pdfUploading} />
                        {pdfUploading ? 'Uploading...' : 'Select PDF'}
                    </label>
                </div>
                <div className="upload-grid">
                    <div className="upload-field">
                        <label>Title</label>
                        <input
                            type="text"
                            placeholder="My PDF title"
                            value={pdfTitle}
                            onChange={(e) => setPdfTitle(e.target.value)}
                            disabled={pdfUploading}
                        />
                    </div>
                    <div className="upload-field">
                        <label>Folder</label>
                        <select
                            value={pdfFolder}
                            onChange={(e) => setPdfFolder(e.target.value)}
                            disabled={pdfUploading}
                        >
                            <option value="uncategorized">Uncategorized</option>
                            {folders.map(folder => (
                                <option key={folder._id} value={folder._id}>{folder.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="upload-field upload-actions">
                        <button onClick={handleUploadPdf} disabled={pdfUploading}>Upload</button>
                        {pdfStatus && !pdfError && <span className="pdf-status muted small">{pdfStatus}</span>}
                        {pdfError && <span className="status-message error-message">{pdfError}</span>}
                    </div>
                </div>
            </div>

            <div className="new-folder-section">
                <input
                    type="text"
                    placeholder="New folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyPress={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
                />
                <button onClick={handleCreateFolder}>Create Folder</button>
            </div>
            
            {sortedFolderKeys.length > 0 ? (
                sortedFolderKeys.map(folderId => {
                    const folder = groupedArticles[folderId];
                    const isOpen = openFolder === folderId;

                    return (
                        <div key={folderId} className="folder-group">
                            <button className="folder-header" onClick={() => handleFolderClick(folderId)}>
                                <AccordionIcon isOpen={isOpen} />
                                {folder.name}
                                {folderId !== 'uncategorized' && (
                                    <span 
                                        className="delete-folder-button" 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folderId, folder.name); }}
                                        title="Delete Folder"
                                    > &times; </span>
                                )}
                            </button>
                            <ul className={`article-list nested ${isOpen ? 'open' : ''}`}>
                                {folder.articles.map(article => (
                                    <li key={article._id} className="article-list-item">
                                        <NavLink to={`/articles/${article._id}`} className="article-title-link">
                                            {article.title}
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })
            ) : (
                <p className="status-message">No articles saved yet.</p>
            )}
        </>
    );
};

export default ArticleList;
