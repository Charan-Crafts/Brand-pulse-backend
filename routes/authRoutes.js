const express = require('express');

const router = express.Router();

const authController = require('../controller/auth');

const authenticate = require('../middleware/auth.middleware');

router.post('/login', authController.login);

router.post('/register', authController.register);

router.post('/logout', authenticate, authController.logout);
module.exports = router;