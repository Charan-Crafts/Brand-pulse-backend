
const express = require('express');

const router = express.Router();

const sentimentController = require('../controller/sentiment');

const webscraperController = require('../controller/webscraper.js');
// Analyze  comment
router.post('/analyze', sentimentController.sentiment);

// get the comments from instagram post
router.post('/scrape-comments', webscraperController.scrapeComments);


module.exports = router;