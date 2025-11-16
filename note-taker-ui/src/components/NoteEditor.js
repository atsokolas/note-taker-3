import React, { useState, useEffect } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css'; // Import styles
import api from '../api';
import { useParams, useNavigate } from 'react-router-dom';

const NoteEditor = () => {
    const { id } = useParams(); // If ID exists, we are editing. If not, creating new.
    const navigate = useNavigate();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Load note if ID is present
    useEffect(() => {
        if (id) {
            const fetchNote = async () => {
                try {
                    const token = localStorage.getItem('token');
                    const res = await api.get(`/api/notes/${id}`, {
                         headers: { Authorization: `Bearer ${token}` }
                    });
                    setTitle(res.data.title);
                    setContent(res.data.content);
                } catch (err) {
                    console.error("Error loading note", err);
                }
            };
            fetchNote();
        }
    }, [id]);

    const handleSave = async () => {
        setIsSaving(true);
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        
        try {
            if (id) {
                // Update existing
                await api.put(`/api/notes/${id}`, { title, content }, { headers });
            } else {
                // Create new
                const res = await api.post('/api/notes', { title, content }, { headers });
                navigate(`/notes/${res.data._id}`); // Redirect to edit mode
            }
            alert('Note Saved!');
        } catch (err) {
            console.error("Error saving note", err);
            alert("Failed to save.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="note-editor-container" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <input 
                type="text" 
                placeholder="Note Title..." 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ 
                    width: '100%', fontSize: '2em', border: 'none', outline: 'none', 
                    marginBottom: '20px', fontWeight: 'bold', backgroundColor: 'transparent' 
                }}
            />
            
            <div style={{ height: '500px', marginBottom: '50px' }}>
                <ReactQuill 
                    theme="snow" 
                    value={content} 
                    onChange={setContent} 
                    style={{ height: '100%' }}
                />
            </div>

            <button 
                onClick={handleSave} 
                style={{ 
                    padding: '10px 20px', backgroundColor: '#007aff', color: 'white', 
                    border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '1em'
                }}
                disabled={isSaving}
            >
                {isSaving ? 'Saving...' : 'Save Note'}
            </button>
        </div>
    );
};

export default NoteEditor;
