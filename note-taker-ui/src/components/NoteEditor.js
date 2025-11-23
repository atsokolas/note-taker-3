import React, { useEffect, useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css'; // Import styles

const NoteEditor = ({ note, folders = [], onSave, onDelete, onCreateNew, isSaving }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [folderId, setFolderId] = useState('');

    useEffect(() => {
        setTitle(note?.title || 'Untitled Note');
        setContent(note?.content || '');
        setFolderId(note?.folder?._id || note?.folder || '');
    }, [note]);

    const handleSave = () => {
        if (!onSave) return;
        onSave({ title, content, folderId });
    };

    const handleDelete = () => {
        if (note?._id && onDelete) {
            onDelete(note._id);
        }
    };

    return (
        <div className="note-editor-container">
            <div className="note-editor-toolbar">
                <div className="note-meta">
                    <p className="eyebrow">{note?._id ? 'Continue writing' : 'New note'}</p>
                    <h1>{title || 'Untitled Note'}</h1>
                    {note?.updatedAt && (
                        <span className="subtext">Last updated {new Date(note.updatedAt).toLocaleString()}</span>
                    )}
                </div>
                <div className="note-actions">
                    <button className="ghost-button" onClick={onCreateNew}>New note</button>
                    <button
                        className="danger-button"
                        onClick={handleDelete}
                        disabled={!note?._id}
                        title={note?._id ? 'Delete note' : 'Save before deleting'}
                    >
                        Delete
                    </button>
                    <button className="primary-button" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving…' : 'Save note'}
                    </button>
                </div>
            </div>

            <div className="note-editor-controls">
                <input
                    type="text"
                    placeholder="Note title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />

                <select value={folderId || ''} onChange={(e) => setFolderId(e.target.value)}>
                    <option value="">Uncategorized</option>
                    {folders.map(folder => (
                        <option key={folder._id} value={folder._id}>{folder.name}</option>
                    ))}
                </select>
            </div>

            <div className="rich-editor">
                <ReactQuill
                    theme="snow"
                    value={content}
                    onChange={setContent}
                    style={{ height: '100%' }}
                />
            </div>
        </div>
    );
};

export default NoteEditor;
