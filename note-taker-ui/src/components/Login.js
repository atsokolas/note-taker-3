/* global chrome */
import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { BASE_URL } from '../apiConfig';

const Login = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setMessage('');
        try {
            // 'withCredentials: true' tells the browser to handle the auth cookie
            await axios.post(`${BASE_URL}/api/auth/login`, { username, password }, { withCredentials: true });
            
            // This function updates the main app's state to show the logged-in view
            onLoginSuccess();

        } catch (error) {
            setMessage('Login failed. Please check your credentials.');
            console.error("Login Error:", error);
        }
    };

    return (
        <div className="auth-container">
            <h2>Login</h2>
            <form onSubmit={handleLogin} className="auth-form">
                {/* --- The missing form fields are now restored --- */}
                <div className="form-group">
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
                        autoComplete="current-password"
                    />
                </div>
                <button type="submit" className="auth-button">Login</button>
            </form>
            {message && <p className="status-message error-message">{message}</p>}
            <p className="auth-link">
                Don't have an account? <button type="button" className="link-button" onClick={() => navigate('/register')}>Register here</button>

            </p>
        </div>
    );
};

export default Login;
