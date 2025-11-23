import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import NoteEditor from './NoteEditor';

const NoteWorkspace = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [notes, setNotes] = useState([]);
    const [folders, setFolders] = useState([]);
    const [filterFolder, setFilterFolder] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedNoteId, setSelectedNoteId] = useState(id || null);
    const [savingNoteId, setSavingNoteId] = useState(null);
    const [isCreatingFresh, setIsCreatingFresh] = useState(!id);

    useEffect(() => {
        setSelectedNoteId(id || null);
    }, [id]);

    const authHeaders = useMemo(() => {
        const token = localStorage.getItem('token');
        return {
            headers: { 'Authorization': `Bearer ${token}` }
        };
    }, []);

    const fetchFolders = useCallback(async () => {
        try {
            const response = await api.get('/folders', authHeaders);
            setFolders(response.data);
        } catch (err) {
            console.error('Error loading folders', err);
            setError('Could not load notebooks.');
        }
    }, [authHeaders]);

    const fetchNotes = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {};
            if (filterFolder !== 'all') params.folderId = filterFolder;
            if (searchTerm.trim()) params.search = searchTerm.trim();

            const response = await api.get('/api/notes', { ...authHeaders, params });
            setNotes(response.data);

            const selectedExists = selectedNoteId && response.data.some(note => note._id === selectedNoteId);

            if (!selectedNoteId && response.data.length > 0 && !isCreatingFresh) {
                setSelectedNoteId(response.data[0]._id);
                navigate(`/notes/${response.data[0]._id}`);
            } else if (selectedNoteId && !selectedExists && response.data.length > 0) {
                setSelectedNoteId(response.data[0]._id);
                navigate(`/notes/${response.data[0]._id}`);
            } else if (selectedNoteId && !selectedExists && response.data.length === 0) {
                setSelectedNoteId(null);
                setIsCreatingFresh(true);
                navigate('/notes');
            }
        } catch (err) {
            console.error('Error loading notes', err);
            setError('Could not load your notes. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [authHeaders, filterFolder, navigate, searchTerm, selectedNoteId, isCreatingFresh]);

    useEffect(() => {
        fetchFolders();
    }, [fetchFolders]);

    useEffect(() => {
        fetchNotes();
    }, [fetchNotes]);

    const activeNote = selectedNoteId ? notes.find(n => n._id === selectedNoteId) : null;

    const handleSelectNote = (noteId) => {
        setIsCreatingFresh(false);
        setSelectedNoteId(noteId);
        navigate(noteId ? `/notes/${noteId}` : '/notes');
    };

    const handleCreateNewNote = () => {
        setIsCreatingFresh(true);
        setSelectedNoteId(null);
        navigate('/notes');
    };

    const handleSaveNote = async ({ title, content, folderId }) => {
        try {
            setSavingNoteId(selectedNoteId || 'new');
            const payload = {
                title: title?.trim() || 'Untitled Note',
                content: content || '',
                folderId: folderId || null
            };

            if (selectedNoteId) {
                await api.put(`/api/notes/${selectedNoteId}`, payload, authHeaders);
            } else {
                const response = await api.post('/api/notes', payload, authHeaders);
                handleSelectNote(response.data._id);
            }

            await fetchNotes();
        } catch (err) {
            console.error('Error saving note', err);
            setError(err.response?.data?.error || 'Could not save note.');
        } finally {
            setSavingNoteId(null);
        }
    };

    const handleDeleteNote = async (noteId) => {
        if (!noteId) return;
        const confirmDelete = window.confirm('Delete this note? This cannot be undone.');
        if (!confirmDelete) return;

        try {
            await api.delete(`/api/notes/${noteId}`, authHeaders);
            const remainingNotes = notes.filter(n => n._id !== noteId);
            setNotes(remainingNotes);
            if (remainingNotes.length > 0) {
                handleSelectNote(remainingNotes[0]._id);
            } else {
                handleSelectNote(null);
                setIsCreatingFresh(true);
            }
        } catch (err) {
            console.error('Error deleting note', err);
            setError('Could not delete note.');
        }
    };

    const renderNotePreview = (note) => {
        const text = note.content?.replace(/<[^>]+>/g, '') || '';
        return text.length > 120 ? `${text.slice(0, 120)}…` : text;
    };

    return (
        <div className="note-workspace">
            <div className="note-sidebar">
                <div className="note-sidebar-header">
                    <div>
                        <p className="eyebrow">Notebook</p>
                        <h2>All Notes</h2>
                    </div>
                    <button className="primary-button" onClick={handleCreateNewNote}>+ New</button>
                </div>

                <div className="note-sidebar-controls">
                    <input
                        type="search"
                        placeholder="Search notes"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <select
                        value={filterFolder}
                        onChange={(e) => setFilterFolder(e.target.value)}
                    >
                        <option value="all">All notebooks</option>
                        <option value="uncategorized">Uncategorized</option>
                        {folders.map(folder => (
                            <option key={folder._id} value={folder._id}>{folder.name}</option>
                        ))}
                    </select>
                </div>

                {loading && <p className="status-message">Loading your notes…</p>}
                {error && <p className="status-message" style={{ color: 'red' }}>{error}</p>}

                {!loading && !error && (
                    <ul className="note-list">
                        {notes.length === 0 ? (
                            <li className="status-message">No notes found. Start a new one!</li>
                        ) : (
                            notes.map(note => {
                                const isActive = note._id === selectedNoteId;
                                return (
                                    <li
                                        key={note._id}
                                        className={`note-list-item ${isActive ? 'active' : ''}`}
                                        onClick={() => handleSelectNote(note._id)}
                                    >
                                        <div className="note-list-item-title">{note.title || 'Untitled Note'}</div>
                                        <div className="note-list-item-meta">
                                            <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                                            {note.folder?.name && <span className="pill">{note.folder.name}</span>}
                                        </div>
                                        {note.content && (
                                            <p className="note-list-item-preview">{renderNotePreview(note)}</p>
                                        )}
                                    </li>
                                );
                            })
                        )}
                    </ul>
                )}
            </div>

            <div className="note-editor-pane">
                <NoteEditor
                    note={activeNote}
                    folders={folders}
                    onSave={handleSaveNote}
                    onDelete={handleDeleteNote}
                    onCreateNew={handleCreateNewNote}
                    isSaving={!!savingNoteId}
                />
            </div>
        </div>
    );
};

export default NoteWorkspace;
