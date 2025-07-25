// note-taker-3-1/server/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/.+@.+\..+/, 'Please enter a valid email address'] // Basic email validation
    },
    password: {
        type: String,
        required: true,
        minlength: [6, 'Password must be at least 6 characters long']
    }
}, { timestamps: true }); // Adds createdAt and updatedAt fields automatically

// Pre-save hook to hash password before saving
UserSchema.pre('save', async function(next) {
    if (this.isModified('password')) { // Only hash if password has been modified (or is new)
        const salt = await bcrypt.genSalt(10); // Generate a salt with 10 rounds
        this.password = await bcrypt.hash(this.password, salt); // Hash the password
    }
    next();
});

// Method to compare password for login
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
