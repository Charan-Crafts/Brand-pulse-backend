const userModel = require('../models/user.models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1d' });
}

const login = async (req, res) => {
    const { email, password } = req.body;

    const user = await userModel.findOne({ email });
    if (!user) {
        return res.status(401).json({ message: 'Invalid email or password' });
    }
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
        return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(user._id);

    const userData = await userModel.findById(user._id).select('-password');
    res.cookie('token', token, { httpOnly: true, secure: true, maxAge: 1000 * 60 * 60 * 24 });

    return res.status(200).json({ message: 'Login successful' ,data: userData,token: token});
}

const register = async (req, res) => {
    const { userName, email, password } = req.body;
    try {
        const user = await userModel.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUser = await userModel.create({ userName, email, password: hashedPassword });

        const token = generateToken(newUser._id);
        const userData = await userModel.findById(newUser._id).select('-password');
        res.cookie('token', token, { httpOnly: true, secure: true, maxAge: 1000 * 60 * 60 * 24 });
        return res.status(201).json({ message: 'User created successfully' ,data: userData,token: token});
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Internal server error' });
    }   
}


const logout = async (req, res) => {

    try {
        const user = req.user;
        if(!user){
            return res.status(401).json({ message: 'Unauthorized' });
        }
        res.cookie('token', '', { httpOnly: true, secure: true, maxAge: 0 });
        return res.status(200).json({ message: 'Logout successful' });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}
module.exports = { login ,register,logout};