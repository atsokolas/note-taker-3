import React, { useState } from 'react';
import api, { clearStoredTokens } from '../api';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';

const PASSWORD_MIN_LENGTH = 8;

const validateRegistration = ({ username, password, confirmPassword }) => {
    const cleanUsername = username.trim();

    if (!cleanUsername || !password) {
        return 'Username and password are required.';
    }
    if (password !== confirmPassword) {
        return 'Passwords do not match.';
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
        return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    }
    if (cleanUsername.toLowerCase() === password.trim().toLowerCase()) {
        return 'Password cannot match your username.';
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        return 'Password must include at least one letter and one number.';
    }
    return '';
};

const Register = ({ chromeStoreLink }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsError(false);
        setSubmitting(true);
        const validationMessage = validateRegistration({ username, password, confirmPassword });
        if (validationMessage) {
            setMessage(validationMessage);
            setIsError(true);
            setSubmitting(false);
            return;
        }
        try {
            const cleanUsername = username.trim();
            clearStoredTokens();
            const response = await api.post('/api/auth/register', { username: cleanUsername, password }, { skipAuthHandling: true });
            try {
                sessionStorage.setItem('registration_notice', response.data?.loginMessage || 'Account created. You can log in now.');
                sessionStorage.setItem('registration_username', cleanUsername);
            } catch (_error) {
                // ignore storage failures
            }
            navigate('/login');
        } catch (error) {
            console.error('Registration error:', error.response?.data || error.message);
            const errorMessage = error.response?.data?.error || 'Registration failed. Please try again.';
            setMessage(errorMessage);
            setIsError(true);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="auth-container">
            <img src={logo} alt="Note Taker Logo" className="auth-logo" loading="lazy" decoding="async" />
            <h2>Register</h2>

            <p className="get-extension-link">
                This web app works without extensions using manual notes, direct paste, and CSV/markdown imports.
                For one-click web clipping, install the free
                <a href={chromeStoreLink} target="_blank" rel="noopener noreferrer"> Chrome Extension</a>.
            </p>

            <form onSubmit={handleRegister} className="auth-form">
                <div className="form-group">
                    <label htmlFor="username">Username:</label>
                    <input
                        type="text"
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password:</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                    />
                    <p className="muted small">Use at least 8 characters with one letter and one number.</p>
                </div>
                <div className="form-group">
                    <label htmlFor="confirm-password">Confirm Password:</label>
                    <input
                        type="password"
                        id="confirm-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                    />
                </div>
                <button type="submit" className="auth-button" disabled={submitting}>
                    {submitting ? 'Registering…' : 'Register'}
                </button>
            </form>
            {message && (<p className={`status-message ${isError ? 'error-message' : 'success-message'}`}>{message}</p>)}
            <p className="auth-link">Already have an account? <button type="button" className="link-button" onClick={() => navigate('/login')}>Login here</button></p>
        </div>
    );
};

export default Register;
