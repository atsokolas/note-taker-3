// src/components/Register.js
import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

// Ensure this matches your backend URL
const BASE_URL = "https://note-taker-3-unrg.onrender.com";

const Register = () => {
    // --- FIX: Use 'username' state to match the backend requirement ---
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsError(false);

        try {
            // --- FIX: Correct the API endpoint and send 'username' in the body ---
            const response = await axios.post(`${BASE_URL}/api/auth/register`, { username, password });
            
            setMessage('Registration successful! You can now log in.');
            setIsError(false);
            
            setTimeout(() => {
                navigate('/login');
            }, 2000);
        } catch (error) {
            console.error('Registration error:', error.response?.data || error.message);
            const errorMessage = error.response?.data?.error || 'Registration failed. Please try again.';
            setMessage(errorMessage);
            setIsError(true);
        }
    };

    return (
        <div className="auth-container">
            <img src="/Logo.png" alt="Note Taker Logo" className="auth-logo" />
            <h2>Register</h2>
            <form onSubmit={handleRegister} className="auth-form">
                <div className="form-group">
                    {/* --- FIX: Change label and input to handle username --- */}
                    <label htmlFor="username">Username:</label>
                    <input
                        type="text"
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        autoComplete="username"
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password:</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                    />
                </div>
                <button type="submit" className="auth-button">Register</button>
            </form>
            {message && (
                <p className={`status-message ${isError ? 'error-message' : 'success-message'}`}>
                    {message}
                </p>
            )}
            <p className="auth-link">
                Already have an account? <a onClick={() => navigate('/login')}>Login here</a>
            </p>
        </div>
    );
};

export default Register;
