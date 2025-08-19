import React, { useState } from 'react';
import api from '../api'; // UPDATED: Import the custom api instance
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';

const Login = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsError(false);

        try {
            // UPDATED: Use the 'api' instance and simplified URL
            const response = await api.post('/api/auth/login', { username, password });
            console.log('Login success:', response.data);

            if (response.data.token) {
                localStorage.setItem('token', response.data.token);

                if (window.chrome && window.chrome.storage && window.chrome.storage.local) {
                    window.chrome.storage.local.set({ token: response.data.token }, () => {
                        console.log('Token saved to chrome.storage for extension use.');
                    });
                }

                setMessage('Login successful!');
                setIsError(false);
                
                if (typeof onLoginSuccess === 'function') {
                    onLoginSuccess();
                }
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
                    <label htmlFor="username-login">Username:</label>
                    <input
                        type="text"
                        id="username-login"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
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
            {message && (<p className={`status-message ${isError ? 'error-message' : 'success-message'}`}>{message}</p>)}
            <p className="auth-link">Don't have an account? <a onClick={() => navigate('/register')}>Register here</a></p>
        </div>
    );
};

export default Login;
