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
    const [pdfParsing, setPdfParsing] = useState(false);
    const canUploadPdf = !!pdfFile && !pdfUploading;

    // Feedback state
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState('');
    const [feedbackEmail, setFeedbackEmail] = useState('');
    const [feedbackRating, setFeedbackRating] = useState(5);
    const [feedbackStatus, setFeedbackStatus] = useState('');
    const [feedbackError, setFeedbackError] = useState('');
    const [feedbackSending, setFeedbackSending] = useState(false);
    const [feedbackItems, setFeedbackItems] = useState([]);
    const [feedbackLoading, setFeedbackLoading] = useState(false);

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
        const titleToUse = pdfTitle.trim() || pdfFile.name.replace(/\.pdf$/i, '') || 'Uploaded PDF';
        setPdfUploading(true);
        setPdfError('');
        setPdfStatus('Preparing PDF...');
        try {
            const ensurePdfJs = () => new Promise((resolve, reject) => {
                if (window.pdfjsLib) return resolve(window.pdfjsLib);
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.js';
                script.onload = () => {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js';
                    resolve(window.pdfjsLib);
                };
                script.onerror = () => reject(new Error('Failed to load PDF.js'));
                document.head.appendChild(script);
            });

            const arrayBuffer = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (e.target?.result) resolve(e.target.result);
                    else reject(new Error('Could not read file.'));
                };
                reader.onerror = () => reject(new Error('Could not read file.'));
                reader.readAsArrayBuffer(pdfFile);
            });

            const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            const dataUrl = `data:application/pdf;base64,${base64Data}`;

            let extractedHtml = '';
            try {
                setPdfParsing(true);
                setPdfStatus('Extracting text for highlights...');
                const pdfjsLib = await ensurePdfJs();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const pageTexts = [];
                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    const page = await pdf.getPage(pageNum);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    pageTexts.push(pageText);
                }
                const combined = pageTexts.join('\\n\\n');
                extractedHtml = combined
                    .split(/\\n{2,}/)
                    .map(para => para.trim())
                    .filter(Boolean)
                    .map(para => `<p>${para}</p>`)
                    .join('\\n');
            } catch (parseErr) {
                console.warn('PDF text extraction failed, uploading without parsed text:', parseErr);
                extractedHtml = '';
            } finally {
                setPdfParsing(false);
            }

            const token = localStorage.getItem('token');
            if (!token) throw new Error('Authentication token not found.');
            const authHeaders = { headers: { 'Authorization': `Bearer ${token}` } };

            const payload = {
                title: titleToUse,
                url: `uploaded://${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                content: extractedHtml,
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
            setPdfStatus('PDF uploaded successfully. Refreshing...');
            setPdfFile(null);
            setPdfTitle('');
            setPdfFolder('uncategorized');
            await fetchAndGroupArticles();
            setPdfStatus('PDF uploaded successfully.');
        } catch (err) {
            console.error('Error uploading PDF:', err);
            setPdfError(err.response?.data?.error || err.message || 'Failed to upload PDF.');
        } finally {
            setPdfUploading(false);
        }
    };

    const submitFeedback = async () => {
        if (!feedbackMessage.trim()) {
            setFeedbackError('Tell us a bit about your experience.');
            return;
        }
        setFeedbackSending(true);
        setFeedbackStatus('');
        setFeedbackError('');
        try {
            const payload = {
                message: feedbackMessage.trim(),
                rating: feedbackRating,
                email: feedbackEmail.trim(),
                source: 'web-app'
            };
            await api.post('/api/feedback', payload);
            setFeedbackStatus('Thanks for sharing. We read every note.');
            setFeedbackMessage('');
            setFeedbackEmail('');
            setFeedbackRating(5);
            fetchFeedback();
        } catch (err) {
            console.error('Error sending feedback:', err);
            setFeedbackError(err.response?.data?.error || 'Could not send feedback. Please try again.');
        } finally {
            setFeedbackSending(false);
        }
    };

    const fetchFeedback = useCallback(async () => {
        try {
            setFeedbackLoading(true);
            const token = localStorage.getItem('token');
            if (!token) throw new Error("Authentication token not found.");
            const authHeaders = { headers: { 'Authorization': `Bearer ${token}` } };
            const res = await api.get('/api/feedback', authHeaders);
            setFeedbackItems(res.data || []);
        } catch (err) {
            console.error("Error fetching feedback:", err);
        } finally {
            setFeedbackLoading(false);
        }
    }, []);

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
                        <button type="button" onClick={handleUploadPdf} disabled={!canUploadPdf}>
                            {pdfUploading ? 'Uploading...' : 'Upload PDF'}
                        </button>
                        {pdfStatus && !pdfError && <span className="pdf-status muted small">{pdfStatus}</span>}
                        {pdfError && <span className="status-message error-message">{pdfError}</span>}
                    </div>
                </div>
            </div>

            <div className="feedback-card">
                <div className="feedback-header">
                    <div>
                        <p className="eyebrow">Feedback</p>
                        <h3>Help shape Note Taker</h3>
                        <p className="muted small">Share what works, what’s missing, or a quick idea.</p>
                    </div>
                    <button className="notebook-button" onClick={() => setFeedbackOpen(!feedbackOpen)}>
                        {feedbackOpen ? 'Hide' : 'Leave feedback'}
                    </button>
                </div>

                {feedbackOpen && (
                    <div className="feedback-body">
                        <label className="feedback-field">
                            <span>How do you feel?</span>
                            <div className="feedback-rating">
                                {[1,2,3,4,5].map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        className={`rating-dot ${feedbackRating === n ? 'active' : ''}`}
                                        onClick={() => setFeedbackRating(n)}
                                    >
                                        {n}
                                    </button>
                                ))}
                                <span className="muted small">{feedbackRating}/5</span>
                            </div>
                        </label>
                        <label className="feedback-field">
                            <span>Your thoughts</span>
                            <textarea
                                placeholder="Quick note, idea, or wish..."
                                value={feedbackMessage}
                                onChange={(e) => setFeedbackMessage(e.target.value)}
                                rows={3}
                            />
                        </label>
                        <label className="feedback-field">
                            <span>Contact (optional)</span>
                            <input
                                type="email"
                                placeholder="Where we can reach you"
                                value={feedbackEmail}
                                onChange={(e) => setFeedbackEmail(e.target.value)}
                            />
                        </label>
                        <div className="feedback-actions">
                            <button type="button" className="notebook-button primary" onClick={submitFeedback} disabled={feedbackSending}>
                                {feedbackSending ? 'Sending...' : 'Send feedback'}
                            </button>
                            {feedbackStatus && <span className="pdf-status muted small">{feedbackStatus}</span>}
                            {feedbackError && <span className="status-message error-message">{feedbackError}</span>}
                        </div>
                        <div className="feedback-list">
                            <div className="feedback-list-header">
                                <span className="eyebrow">Recent feedback</span>
                                <button type="button" className="notebook-button" onClick={fetchFeedback} disabled={feedbackLoading}>
                                    {feedbackLoading ? 'Loading...' : 'Refresh'}
                                </button>
                            </div>
                            {feedbackItems && feedbackItems.length > 0 ? (
                                <ul>
                                    {feedbackItems.slice(0, 10).map((item) => (
                                        <li key={item._id} className="feedback-list-item">
                                            <div className="feedback-list-top">
                                                <strong>{item.rating ? `${item.rating}/5` : 'No rating'}</strong>
                                                <span className="feedback-date">{new Date(item.createdAt).toLocaleString()}</span>
                                            </div>
                                            <p className="feedback-message">{item.message}</p>
                                            <p className="feedback-meta">
                                                {item.email ? `Contact: ${item.email}` : 'No contact provided'}
                                                {item.source ? ` · Source: ${item.source}` : ''}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="muted small">No feedback yet.</p>
                            )}
                        </div>
                    </div>
                )}
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
