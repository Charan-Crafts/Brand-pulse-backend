const express = require('express');
const router = express.Router();

const productController = require('../controller/product');

const authenticate = require('../middleware/auth.middleware');

// Create a new product
router.post('/', authenticate, productController.createProduct);

// Get all reviews across all products (with filters)
router.get('/reviews', authenticate, productController.getAllReviews);

// Get all reviews and comments for a product by product ID
router.get('/:productId/reviews', authenticate, productController.getProductReviews);

router.get("/categories", authenticate, productController.getProductCategories);

module.exports = router;

