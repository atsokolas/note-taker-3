// note-taker-3-1/server/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Path relative to routes/auth.js

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
        return res.status(400).json({ error: 'Please enter all fields' });
    }

    try {
        // Check if user already exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ error: 'User with that email already exists' });
        }

        // Create new user (password will be hashed by pre-save hook in User model)
        user = new User({ email, password });
        await user.save();

        // Generate JWT token (optional, can send token immediately on register too)
        const payload = { userId: user.id };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }); // Token expires in 1 hour

        res.status(201).json({
            message: 'User registered successfully',
            token, // Send the token back to the frontend
            userId: user.id,
            email: user.email
        });

    } catch (err) {
        console.error('Registration error:', err);
        // Mongoose validation errors
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ error: messages.join(', ') });
        }
        res.status(500).json({ error: 'Server error during registration' });
    }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
        return res.status(400).json({ error: 'Please enter all fields' });
    }

    try {
        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Compare password
        const isMatch = await user.comparePassword(password); // Using the custom method on the User model
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const payload = { userId: user.id };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.json({
            message: 'Logged in successfully',
            token,
            userId: user.id,
            email: user.email
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login' });
    }
});

module.exports = router;
