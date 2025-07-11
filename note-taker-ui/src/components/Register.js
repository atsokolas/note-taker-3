// src/components/Register.js
import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import logo from '../Logo.png'; // <--- ADD THIS LINE: Import your logo image

const BASE_URL = "https://note-taker-3-unrg.onrender.com"; // Ensure this matches your backend URL

const Register = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        setMessage(''); // Clear previous messages
        setIsError(false); // Reset error state

        try {
            const response = await axios.post(`${BASE_URL}/register`, { email, password });
            setMessage('Registration successful! You can now log in.');
            setIsError(false);
            console.log('Registration success:', response.data);
            // Optionally redirect to login page after successful registration
            setTimeout(() => {
                navigate('/login');
            }, 2000); // Redirect after 2 seconds
        } catch (error) {
            console.error('Registration error:', error.response?.data || error.message);
            const errorMessage = error.response?.data?.error || 'Registration failed. Please try again.';
            setMessage(errorMessage);
            setIsError(true);
        }
    };

    return (
        <div className="auth-container">
            {/* ADD THIS LOGO ELEMENT */}
            <img src={logo} alt="Note Taker Logo" className="auth-logo" />
            <h2>Register</h2>
            <form onSubmit={handleRegister} className="auth-form">
                <div className="form-group">
                    <label htmlFor="email">Email:</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
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
                        required
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
