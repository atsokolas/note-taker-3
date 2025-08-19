import React, { useState } from 'react';
import api from '../api'; // UPDATED: Import the custom api instance
import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';

const Register = () => {
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
            // UPDATED: Use the 'api' instance and simplified URL
            await api.post('/api/auth/register', { username, password });
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
            <img src={logo} alt="Note Taker Logo" className="auth-logo" />
            <h2>Register</h2>
            <form onSubmit={handleRegister} className="auth-form">
                <div className="form-group">
                    <label htmlFor="username">Username:</label>
                    <input
                        type="text"
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
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
            {message && (<p className={`status-message ${isError ? 'error-message' : 'success-message'}`}>{message}</p>)}
            <p className="auth-link">Already have an account? <a onClick={() => navigate('/login')}>Login here</a></p>
        </div>
    );
};

export default Register;
