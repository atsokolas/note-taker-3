import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";

const Register = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [isSuccess, setIsSuccess] = useState(false); // State to track success
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        setMessage('');
        setIsSuccess(false);

        try {
            await axios.post(`${BASE_URL}/api/auth/register`, { username, password });
            setMessage('Registration successful! Please log in.');
            setIsSuccess(true); // Set success to true
        } catch (error) {
            const errorMessage = error.response?.data?.error || 'Registration failed. Please try again.';
            setMessage(errorMessage);
            setIsSuccess(false);
        }
    };

    // If registration was successful, show a different view
    if (isSuccess) {
        return (
            <div className="auth-container">
                <h2>Success!</h2>
                <p>{message}</p>
                <button className="auth-button" onClick={() => navigate('/login')}>
                    Go to Login
                </button>
            </div>
        );
    }

    // Otherwise, show the registration form
    return (
        <div className="auth-container">
            <h2>Register</h2>
            <form onSubmit={handleRegister} className="auth-form">
                <div className="form-group">
                    <label htmlFor="username">Username:</label>
                    <input type="text" id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password:</label>
                    <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <button type="submit" className="auth-button">Register</button>
            </form>
            {message && <p className="status-message error-message">{message}</p>}
        </div>
    );
};

export default Register;
