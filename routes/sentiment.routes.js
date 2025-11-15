
const express = require('express');

const router = express.Router();

const sentimentController = require('../controller/sentiment');

// Analyze  comment
router.post('/analyze', sentimentController.sentiment);


module.exports = router;