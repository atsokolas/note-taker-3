import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../api';
import { useParams, useNavigate } from 'react-router-dom';
import CitationGenerator from './CitationGenerator'; // <-- 1. IMPORT THE NEW COMPONENT
import { Page, Card } from './ui';

const getAuthConfig = () => {
    // ... (Your existing code)
    const token = localStorage.getItem('token');
    if (!token) {
        throw new Error("Authentication token not found. Please log in again.");
    }
    return { headers: { Authorization: `Bearer ${token}` } };
};

const processArticleContent = (articleData) => {
    // ... (Your existing code)
    const { content, highlights, url } = articleData;
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const articleOrigin = new URL(url).origin;

    doc.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        if (src && src.startsWith('/')) {
            img.src = `${articleOrigin}${src}`;
        }
    });
    
    (highlights || []).forEach(h => {
        const highlightId = `highlight-${h._id}`; 
        const escaped = h.text?.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(?<!<mark[^>]*>)${escaped}(?!<\\/mark>)`, 'gi'); 
        doc.body.innerHTML = doc.body.innerHTML.replace(regex, match => `<mark class="highlight" data-highlight-id="${highlightId}">${match}</mark>`);
    });

    return { ...articleData, content: doc.body.innerHTML };
};

const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const createClientId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
};

const normalizeAnnotations = (annotations = []) => (
    Array.isArray(annotations) ? annotations.map(a => ({
        id: a.id || createClientId(),
        text: a.text || '',
        note: a.note || '',
        page: a.page ?? '',
        color: a.color || '#f6c244',
        createdAt: a.createdAt || new Date().toISOString()
    })) : []
);

const normalizePdfs = (pdfs = []) => (
    Array.isArray(pdfs)
        ? pdfs
            .filter(pdf => pdf && pdf.dataUrl)
            .map(pdf => ({
                id: pdf.id || createClientId(),
                name: pdf.name || 'Attachment.pdf',
                dataUrl: pdf.dataUrl,
                uploadedAt: pdf.uploadedAt || new Date().toISOString(),
                annotations: normalizeAnnotations(pdf.annotations || [])
            }))
        : []
);

const ArticleViewer = ({ onArticleChange }) => {
    // ... (Your existing state and hooks)
    const { id } = useParams();
    const navigate = useNavigate();
    const [article, setArticle] = useState(null);
    const [error, setError] = useState(null);
    const [popup, setPopup] = useState({ visible: false, x: 0, y: 0, text: '' });
    const contentRef = useRef(null);
    const popupRef = useRef(null);
    const selectionRangeRef = useRef(null);
    const [folders, setFolders] = useState([]);
    
    const [editingHighlightId, setEditingHighlightId] = useState(null);
    const [editNote, setEditNote] = useState('');
    const [editTags, setEditTags] = useState('');

    const [newHighlightNote, setNewHighlightNote] = useState('');
    const [newHighlightTags, setNewHighlightTags] = useState('');

    const [isRecommendModalOpen, setIsRecommendModalOpen] = useState(false);
    const [selectedHighlights, setSelectedHighlights] = useState([]);
    const [pdfs, setPdfs] = useState([]);
    const [activePdfId, setActivePdfId] = useState(null);
    const [pdfUploadError, setPdfUploadError] = useState('');
    const [pdfUploading, setPdfUploading] = useState(false);
    const [annotationDraft, setAnnotationDraft] = useState({ text: '', note: '', page: '', color: '#f6c244' });
    const [pdfSaving, setPdfSaving] = useState(false);
    const [pdfStatus, setPdfStatus] = useState('');
    const activePdf = useMemo(() => {
        if (!pdfs || pdfs.length === 0) return null;
        return pdfs.find(pdf => pdf.id === activePdfId) || pdfs[0];
    }, [pdfs, activePdfId]);

    const fetchFolders = useCallback(async () => {
        // ... (Your existing code)
        try {
            const response = await api.get('/folders', getAuthConfig());
            const allFolders = [{ _id: 'uncategorized', name: 'Uncategorized' }, ...response.data];
            setFolders(allFolders);
        } catch (err) {
            console.error("Error fetching folders for move dropdown:", err);
        }
    }, []);

    const handlePdfFileSelect = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.type !== 'application/pdf') {
            setPdfUploadError('Please upload a PDF file.');
            event.target.value = '';
            return;
        }
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            setPdfUploadError('PDF must be 10MB or smaller.');
            event.target.value = '';
            return;
        }

        setPdfUploadError('');
        setPdfUploading(true);

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result;
            if (!dataUrl) {
                setPdfUploadError('Could not read that file. Please try again.');
                setPdfUploading(false);
                return;
            }
            const newPdf = {
                id: createClientId(),
                name: file.name,
                dataUrl,
                uploadedAt: new Date().toISOString(),
                annotations: []
            };
            setPdfs(prev => [...prev, newPdf]);
            setActivePdfId(newPdf.id);
            setPdfStatus('Unsaved PDF changes');
            setPdfUploading(false);
            event.target.value = '';
        };
        reader.onerror = () => {
            setPdfUploadError('Could not read that file. Please try again.');
            setPdfUploading(false);
            event.target.value = '';
        };
        reader.readAsDataURL(file);
    };

    const handleRemovePdf = (pdfId) => {
        setPdfs(prev => {
            const next = prev.filter(pdf => pdf.id !== pdfId);
            if (pdfId === activePdfId) {
                setActivePdfId(next[0]?.id || null);
            }
            return next;
        });
        setPdfStatus('Unsaved PDF changes');
    };

    const handleAddAnnotation = () => {
        if (!activePdf) return;
        const text = annotationDraft.text.trim();
        const note = annotationDraft.note.trim();
        if (!text && !note) return;

        const annotation = {
            id: createClientId(),
            text,
            note,
            page: annotationDraft.page ? Number(annotationDraft.page) : '',
            color: annotationDraft.color || '#f6c244',
            createdAt: new Date().toISOString()
        };

        setPdfs(prev => prev.map(pdf => (
            pdf.id === activePdf.id
                ? { ...pdf, annotations: [annotation, ...(pdf.annotations || [])] }
                : pdf
        )));
        setAnnotationDraft({ text: '', note: '', page: '', color: annotationDraft.color });
        setPdfStatus('Unsaved PDF changes');
    };

    const handleRemoveAnnotation = (pdfId, annotationId) => {
        setPdfs(prev => prev.map(pdf => (
            pdf.id === pdfId
                ? { ...pdf, annotations: (pdf.annotations || []).filter(a => a.id !== annotationId) }
                : pdf
        )));
        setPdfStatus('Unsaved PDF changes');
    };

    const handleSavePdfs = async () => {
        if (!article) return;
        setPdfSaving(true);
        setPdfStatus('Saving PDFs...');
        try {
            const payload = { pdfs: normalizePdfs(pdfs) };
            const res = await api.patch(`/articles/${article._id}/pdfs`, payload, getAuthConfig());
            const processedArticle = processArticleContent(res.data);
            const normalized = normalizePdfs(res.data.pdfs || []);
            setArticle(processedArticle);
            setPdfs(normalized);
            setActivePdfId(normalized[0]?.id || null);
            setPdfStatus('PDFs saved');
        } catch (err) {
            console.error("Error saving PDFs:", err);
            setPdfStatus(err.response?.data?.error || "Could not save PDFs.");
        } finally {
            setPdfSaving(false);
        }
    };

    useEffect(() => {
        // ... (Your existing code)
        if (id) {
            setArticle(null);
            setError(null);
            fetchFolders();

            const fetchArticle = async () => {
                try {
                    const res = await api.get(`/articles/${id}`, getAuthConfig());
                    console.log("Fetched article data:", res.data);
                    const processedArticle = processArticleContent(res.data);
                    setArticle(processedArticle);
                    const normalizedPdfs = normalizePdfs(res.data.pdfs || []);
                    setPdfs(normalizedPdfs);
                    setActivePdfId(normalizedPdfs[0]?.id || null);
                    setPdfStatus('');
                    setPdfUploadError('');

                } catch (err) {
                    console.error("Error fetching article:", err);
                    if (err.response?.status !== 401 && err.response?.status !== 403) {
                        setError("Could not load the selected article.");
                    }
                }
            };
            fetchArticle();
        }
    }, [id, fetchFolders]);

    useEffect(() => {
        // ... (Your existing mouseup/click logic)
        const handleMouseUp = (event) => {
            if (popupRef.current && popupRef.current.contains(event.target)) {
                return;
            }

            const selection = window.getSelection();
            const selectedText = selection?.toString().trim();

            if (selectedText && selectedText.length > 0 && selection.rangeCount > 0) {
                selectionRangeRef.current = selection.getRangeAt(0).cloneRange();
                
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                setPopup({ visible: true, x: rect.left + window.scrollX + (rect.width / 2), y: rect.top + window.scrollY, text: selectedText });
                setNewHighlightNote('');
                setNewHighlightTags('');
            }
        };

        const handleClickOutside = (event) => {
            if (popupRef.current && !popupRef.current.contains(event.target)) {
                setPopup({ visible: false, x: 0, y: 0, text: '' });
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("mouseup", handleMouseUp);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, []);

    useEffect(() => {
        // ... (Your existing popup logic)
        if (popup.visible && selectionRangeRef.current) {
            setTimeout(() => {
                const selection = window.getSelection();
                if (selection) {
                    selection.removeAllRanges();
                    selection.addRange(selectionRangeRef.current);
                }
            }, 0);
        }
    }, [popup.visible]);

    useEffect(() => {
        if (!pdfs || pdfs.length === 0) {
            setActivePdfId(null);
            return;
        }
        const exists = pdfs.find(pdf => pdf.id === activePdfId);
        if (!exists) {
            setActivePdfId(pdfs[0].id);
        }
    }, [pdfs, activePdfId]);

    useEffect(() => {
        setAnnotationDraft({ text: '', note: '', page: '', color: '#f6c244' });
    }, [activePdfId, id]);

    // ... (Your existing functions: handleHighlightSelectionChange, handleRecommendArticle, saveHighlight, etc.)
    const handleHighlightSelectionChange = (highlightId) => {
        // ...
        setSelectedHighlights(prevSelected => {
            if (prevSelected.includes(highlightId)) {
                return prevSelected.filter(id => id !== highlightId);
            } else {
                if (prevSelected.length < 10) {
                    return [...prevSelected, highlightId];
                }
                return prevSelected;
            }
        });
    };

    const handleRecommendArticle = async () => {
        // ...
        if (selectedHighlights.length === 0) {
            alert("Please select at least one highlight to recommend.");
            return;
        }
        try {
            const payload = { articleId: article._id, highlightIds: selectedHighlights };
            await api.post('/api/recommendations', payload, getAuthConfig());
            alert("Article recommended successfully!");
            setIsRecommendModalOpen(false);
            setSelectedHighlights([]);
        } catch (err) {
            console.error("Error recommending article:", err);
            alert(err.response?.data?.error || "Failed to recommend article.");
        }
    };

    const saveHighlight = async () => {
        if (!popup.text) return;
        const position = selectionRangeRef.current ? selectionRangeRef.current.startOffset : 0;
        const newHighlight = { 
            text: popup.text,
            note: '',
            tags: [],
            position
        }; 
        window.getSelection()?.removeAllRanges();
        setPopup({ visible: false, x: 0, y: 0, text: '' });
        try {
            const res = await api.post(`/articles/${id}/highlights`, newHighlight, getAuthConfig());
            const processedArticle = processArticleContent(res.data);
            setArticle(processedArticle);
        } catch (err) {
            console.error("Failed to save highlight:", err);
            alert("Error: Could not save highlight.");
        }
    };

    const handleDeleteArticle = async () => {
        // ...
        if (!article || !window.confirm(`Are you sure you want to delete "${article.title}"?`)) {
            return;
        }
        try {
            await api.delete(`/articles/${article._id}`, getAuthConfig());
            alert(`Article "${article.title}" deleted successfully!`);
            onArticleChange();
            navigate('/');
        } catch (err) {
            console.error("Error deleting article:", err);
            alert("Failed to delete article.");
        }
    };

    const handleMoveArticle = async (e) => {
        // ...
        const newFolderId = e.target.value;
        if (!article || !newFolderId) return;
        try {
            const response = await api.patch(`/articles/${article._id}/move`, { folderId: newFolderId }, getAuthConfig());
            setArticle(response.data);
            alert("Article moved successfully!");
            onArticleChange();
        } catch (err) {
            console.error("Error moving article:", err);
            alert(err.response?.data?.error || "Failed to move article.");
        }
    };

    const scrollToHighlight = (highlightId) => {
        // ...
        const targetElement = document.querySelector(`mark[data-highlight-id="${highlightId}"]`);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetElement.style.transition = 'background-color 0.3s ease-in-out';
            targetElement.style.backgroundColor = 'var(--primary-color-light, rgba(0, 122, 255, 0.3))';
            setTimeout(() => {
                targetElement.style.backgroundColor = ''; 
            }, 1000);
        }
    };

    const startEditHighlight = (highlight) => {
        // ...
        setEditingHighlightId(highlight._id);
        setEditNote(highlight.note || '');
        setEditTags(highlight.tags ? highlight.tags.join(', ') : '');
    };

    const cancelEditHighlight = () => {
        // ...
        setEditingHighlightId(null);
        setEditNote('');
        setEditTags('');
    };

    const updateHighlightOnBackend = async (highlightId, updatedNote, updatedTags) => {
        // ...
        try {
            const response = await api.patch(`/articles/${id}/highlights/${highlightId}`, {
                note: updatedNote,
                tags: updatedTags.split(',').map(tag => tag.trim()).filter(t => t)
            }, getAuthConfig());
            return response.data; 
        } catch (err) {
            console.error("Error updating highlight on backend:", err);
            throw new Error(err.response?.data?.error || "Failed to update highlight.");
        }
    };

    const saveHighlightEdits = async (highlightId) => {
        // ...
        try {
            const updatedArticleData = await updateHighlightOnBackend(highlightId, editNote, editTags);
            const processedArticle = processArticleContent(updatedArticleData);
            setArticle(processedArticle); 
            alert("Highlight updated successfully!");
            cancelEditHighlight(); 
            onArticleChange();
        } catch (err) {
            alert(err.message);
            console.error("Failed to save highlight edits:", err);
        }
    };

    const deleteHighlight = async (highlightId) => {
        // ...
        if (!window.confirm("Are you sure you want to delete this highlight?")) {
            return;
        }
        try {
            const response = await api.delete(`/articles/${id}/highlights/${highlightId}`, getAuthConfig());
            const processedArticle = processArticleContent(response.data);
            setArticle(processedArticle);
            alert("Highlight deleted successfully!");
            onArticleChange();
        } catch (err) {
            alert(err.response?.data?.error || "Failed to delete highlight.");
            console.error("Failed to delete highlight:", err);
        }
    };

    const preventFocusSteal = (e) => e.preventDefault();
    
    if (error) return <h2 style={{color: 'red'}}>{error}</h2>;
    if (!article) return <h2>Loading article...</h2>;

    const allFoldersIncludingUncategorized = [
        // ... (Your existing code)
        { _id: 'uncategorized', name: 'Uncategorized' },
        ...folders.filter(f => f.name !== 'Uncategorized' && f._id !== 'uncategorized')
    ];

    return (
        <Page className="article-viewer-shell">
            <div className="article-viewer-grid">
                <Card className="article-viewer-card">
                    <div className="article-viewer-main">
                        <div className="article-management-bar">
                            {/* ... (Your existing management bar buttons) ... */}
                            <button 
                                className="management-button" 
                                onClick={() => setIsRecommendModalOpen(true)}
                                title="Recommend Article"
                            >
                                Recommend
                            </button>
                            <button 
                                className="management-button delete-button" 
                                onClick={handleDeleteArticle}
                                title="Delete Article"
                            >
                                Delete Article
                            </button>
                            <select 
                                className="management-button move-select" 
                                onChange={handleMoveArticle}
                                value={article.folder ? article.folder._id : 'uncategorized'}
                                title="Move to Folder"
                            >
                                {allFoldersIncludingUncategorized.map(f => (
                                    <option key={f._id} value={f._id}>
                                        Move to {f.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="article-content">
                            <h1>{article.title}</h1>
                            
                            {/* --- 2. ADD THE CITATION COMPONENT HERE --- */}
                            <CitationGenerator article={article} />
                            
                            <div
                            ref={contentRef}
                            className="content-body"
                            dangerouslySetInnerHTML={{ __html: article.content }}
                            />
                            {popup.visible && (
                                <div
                                    ref={popupRef}
                                    onMouseDown={preventFocusSteal}
                                    className="highlight-popup-web-app-container"
                                    style={{ 
                                        top: popup.y, 
                                        left: popup.x, 
                                        position: 'absolute', 
                                        transform: 'translate(-50%, -100%)'
                                    }}
                                >
                                    <button
                                        className="pill-button primary"
                                        onClick={saveHighlight}
                                        title="Highlight"
                                        style={{ padding: '8px 12px', fontSize: '0.9em' }}
                                    >
                                        Highlight
                                    </button>
                                </div>
                            )}
                            <div className="pdf-card">
                                <div className="pdf-card-header">
                                    <div>
                                        <p className="eyebrow">PDF attachments</p>
                                        <h3>Upload & annotate</h3>
                                        <p className="muted small">Keep source PDFs with the article and capture highlights or page notes.</p>
                                    </div>
                                    <div className="pdf-actions">
                                        <label className="upload-pill">
                                            <input type="file" accept="application/pdf" onChange={handlePdfFileSelect} disabled={pdfUploading} />
                                            {pdfUploading ? 'Uploading...' : 'Upload PDF'}
                                        </label>
                                        <button className="notebook-button primary" onClick={handleSavePdfs} disabled={pdfSaving || !article}>
                                            {pdfSaving ? 'Saving...' : 'Save PDFs'}
                                        </button>
                                    </div>
                                </div>
                                {pdfUploadError && <p className="status-message error-message">{pdfUploadError}</p>}
                                {pdfStatus && !pdfUploadError && <p className="pdf-pill-meta">{pdfStatus}</p>}

                                {(!pdfs || pdfs.length === 0) && (
                                    <div className="pdf-empty">
                                        <p className="muted">Upload a PDF to preview it here and log your own highlights alongside the article.</p>
                                    </div>
                                )}

                                {pdfs && pdfs.length > 0 && (
                                    <>
                                        <div className="pdf-list">
                                            {pdfs.map(pdf => (
                                                <div key={pdf.id} className={`pdf-pill ${activePdf?.id === pdf.id ? 'active' : ''}`} onClick={() => setActivePdfId(pdf.id)}>
                                                    <div className="pdf-pill-text">
                                                        <span className="pdf-pill-name">{pdf.name}</span>
                                                        <span className="pdf-pill-meta">{pdf.annotations?.length || 0} notes · Added {formatDate(pdf.uploadedAt)}</span>
                                                    </div>
                                                    <button className="icon-button" onClick={(e) => { e.stopPropagation(); handleRemovePdf(pdf.id); }} title="Remove PDF">×</button>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="pdf-viewer-panel">
                                            <div className="pdf-viewer">
                                                {activePdf ? (
                                                    <object data={activePdf.dataUrl} type="application/pdf" width="100%" height="360">
                                                        <p className="muted">Your browser cannot display the PDF inline. <a href={activePdf.dataUrl} target="_blank" rel="noreferrer">Open in a new tab</a>.</p>
                                                    </object>
                                                ) : (
                                                    <p className="muted small">Select a PDF to preview.</p>
                                                )}
                                            </div>

                                            <div className="pdf-annotations">
                                                <div className="annotations-header">
                                                    <div>
                                                        <p className="eyebrow">Highlights</p>
                                                        <h4>Capture takeaways</h4>
                                                    </div>
                                                    {activePdf && <span className="pdf-pill-meta">{activePdf.annotations?.length || 0} saved</span>}
                                                </div>

                                                <div className="annotation-form">
                                                    <input
                                                        type="text"
                                                        placeholder="What stood out?"
                                                        value={annotationDraft.text}
                                                        onChange={(e) => setAnnotationDraft(prev => ({ ...prev, text: e.target.value }))}
                                                    />
                                                    <textarea
                                                        placeholder="Notes, reactions, or follow-ups"
                                                        value={annotationDraft.note}
                                                        onChange={(e) => setAnnotationDraft(prev => ({ ...prev, note: e.target.value }))}
                                                    />
                                                    <div className="annotation-row">
                                                        <label>
                                                            <span className="muted small">Page</span>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                value={annotationDraft.page}
                                                                onChange={(e) => setAnnotationDraft(prev => ({ ...prev, page: e.target.value }))}
                                                                placeholder="3"
                                                            />
                                                        </label>
                                                        <label className="color-picker">
                                                            <span className="muted small">Highlight color</span>
                                                            <input
                                                                type="color"
                                                                value={annotationDraft.color}
                                                                onChange={(e) => setAnnotationDraft(prev => ({ ...prev, color: e.target.value }))}
                                                            />
                                                        </label>
                                                        <button className="notebook-button" onClick={handleAddAnnotation} disabled={!activePdf}>Save</button>
                                                    </div>
                                                </div>

                                                <ul className="annotation-list">
                                                    {activePdf?.annotations?.map((annotation) => (
                                                        <li key={annotation.id} className="annotation-item">
                                                            <div className="annotation-badge" style={{ backgroundColor: annotation.color }}></div>
                                                            <div className="annotation-body">
                                                                <div className="annotation-top">
                                                                    <strong>{annotation.text || 'Untitled highlight'}</strong>
                                                                    <span className="annotation-meta">
                                                                        {annotation.page ? `Page ${annotation.page}` : 'No page'}
                                                                        <span className="annotation-dot">•</span>
                                                                        {formatDate(annotation.createdAt)}
                                                                    </span>
                                                                </div>
                                                                {annotation.note && <p className="annotation-note">{annotation.note}</p>}
                                                            </div>
                                                            <button className="icon-button" onClick={() => handleRemoveAnnotation(activePdf.id, annotation.id)} title="Remove annotation">×</button>
                                                        </li>
                                                    ))}
                                                    {(!activePdf?.annotations || activePdf.annotations.length === 0) && (
                                                        <li className="muted small">No highlights yet. Add your first takeaway.</li>
                                                    )}
                                                </ul>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </Card>

                <Card className="article-highlights-card">
                    {/* ... (Your existing highlights sidebar code) ... */}
                    <h2>Article Highlights</h2>
                    {article.highlights && article.highlights.length > 0 ? (
                        <ul className="highlights-list">
                            {article.highlights.map(h => (
                                <li key={h._id} className={`sidebar-highlight-item ${editingHighlightId === h._id ? 'editing' : ''}`}>
                                    {editingHighlightId === h._id ? (
                                        <>
                                            <textarea 
                                                className="edit-highlight-note-input"
                                                value={editNote}
                                                onChange={(e) => setEditNote(e.target.value)}
                                                placeholder="Note"
                                            />
                                            <input
                                                type="text"
                                                className="edit-highlight-tags-input"
                                                value={editTags}
                                                onChange={(e) => setEditTags(e.target.value)}
                                                placeholder="Tags (comma-separated)"
                                            />
                                            <div className="edit-highlight-actions">
                                                <button className="edit-save-button" onClick={() => saveHighlightEdits(h._id)}>Save</button>
                                                <button className="edit-cancel-button" onClick={cancelEditHighlight}>Cancel</button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <p className="sidebar-highlight-text" onClick={() => scrollToHighlight(`highlight-${h._id}`)}>
                                                {h.text}
                                            </p>
                                            {h.note && <p className="sidebar-highlight-note">Note: {h.note}</p>}
                                            {h.tags && h.tags.length > 0 && (
                                                <div className="sidebar-highlight-tags">
                                                    {h.tags.map(tag => (
                                                        <span key={tag} className="highlight-tag">{tag}</span>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="highlight-item-actions">
                                                <button className="edit-button" onClick={() => startEditHighlight(h)}>Edit</button>
                                                <button className="delete-button" onClick={() => deleteHighlight(h._id)}>Delete</button>
                                            </div>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="no-highlights-message">No highlights for this article yet.</p>
                    )}
                </Card>
            </div>

            {isRecommendModalOpen && (
                <div className="modal-overlay">
                    {/* ... (Your existing modal code) ... */}
                    <div className="modal-content">
                        <h2>Recommend Article</h2>
                        <p>Select up to 10 highlights to share with your recommendation.</p>
                        <p className="highlight-counter">{selectedHighlights.length} / 10 selected</p>
                        
                        <div className="highlight-selection-list">
                            {(article.highlights || []).map(h => (
                                <div key={h._id} className="highlight-selection-item">
                                    <input 
                                        type="checkbox"
                                        id={`cb-${h._id}`}
                                        checked={selectedHighlights.includes(h._id)}
                                        onChange={() => handleHighlightSelectionChange(h._id)}
                                        disabled={selectedHighlights.length >= 10 && !selectedHighlights.includes(h._id)}
                                    />
                                    <label htmlFor={`cb-${h._id}`}>{h.text}</label>
                                </div>
                            ))}
                        </div>

                        <div className="modal-actions">
                            <button className="secondary-button" onClick={() => { setIsRecommendModalOpen(false); setSelectedHighlights([]); }}>Cancel</button>
                            <button className="primary-button" onClick={handleRecommendArticle}>Confirm Recommendation</button>
                        </div>
                    </div>
                </div>
            )}
        </Page>
    );
};

export default ArticleViewer;
