// src/components/Login.js
import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';

// Ensure this matches your backend URL
const BASE_URL = "https://note-taker-3-unrg.onrender.com"; 

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsError(false);

        try {
            const response = await axios.post(`${BASE_URL}/login`, { email, password });
            console.log('Login success:', response.data);

            if (response.data.token) {
                // Save token for the web app to use
                localStorage.setItem('token', response.data.token);

                // --- THE FIX: Save token for the extension to use ---
                // eslint-disable-next-line no-undef
                if (window.chrome && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ token: response.data.token }, () => {
                        console.log('Token saved to chrome.storage for extension use.');
                    });
                }

                // ----------------------------------------------------

                setMessage('Login successful!');
                setIsError(false);
                navigate('/');
            } else {
                setMessage('Login successful, but no token received.');
                setIsError(true);
            }
        } catch (error) {
            console.error('Login error:', error.response?.data || error.message);
            const errorMessage = error.response?.data?.error || 'Login failed. Invalid credentials or server error.';
            setMessage(errorMessage);
            setIsError(true);
        }
    };

    return (
        <div className="auth-container">
            <img src={logo} alt="Note Taker Logo" className="auth-logo" /> 
            <h2>Login</h2>
            <form onSubmit={handleLogin} className="auth-form">
                <div className="form-group">
                    <label htmlFor="email-login">Email:</label>
                    <input
                        type="email"
                        id="email-login"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="password-login">Password:</label>
                    <input
                        type="password"
                        id="password-login"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" className="auth-button">Login</button>
            </form>
            {message && (
                <p className={`status-message ${isError ? 'error-message' : 'success-message'}`}>
                    {message}
                </p>
            )}
            <p className="auth-link">
                Don't have an account? <a onClick={() => navigate('/register')}>Register here</a>
            </p>
        </div>
    );
};

export default Login;
