const express = require('express');
const router = express.Router();

const productController = require('../controller/product');

// Get all reviews and comments for a product by product ID
router.get('/:productId/reviews', productController.getProductReviews);

module.exports = router;

