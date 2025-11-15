const express = require('express');
const router = express.Router();

const productController = require('../controller/product');

const authenticate = require('../middleware/auth.middleware');

// Get all reviews and comments for a product by product ID
router.get('/:productId/reviews', authenticate, productController.getProductReviews);

router.get("/categories",authenticate, productController.getProductCategories);

module.exports = router;

