const Product = require('../models/products.model');
const Review = require('../models/review.models');

// Get all reviews and comments for a specific product
const getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;

        // Validate productId
        if (!productId) {
            return res.status(400).json({
                error: 'Product ID is required'
            });
        }

        // Find the product
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({
                error: 'Product not found'
            });
        }

        // Find all reviews for this product
        const reviews = await Review.find({ product: productId })
            .sort({ createdAtPlatform: -1 }); // Sort by platform creation date, newest first

        // Format the response
        const response = {
            success: true,
            product: {
                id: product._id,
                productName: product.productName,
                productUrl: product.productUrl,
                platform: product.platform,
                platformProductId: product.platformProductId,
                totalReviews: product.totalReviews,
                positiveCount: product.positiveCount,
                negativeCount: product.negativeCount,
                neutralCount: product.neutralCount,
                lastScraped: product.lastScraped,
                scrapeStatus: product.scrapeStatus
            },
            reviews: reviews.map(review => ({
                id: review._id,
                comment: review.comment,
                authorName: review.authorName,
                authorProfile: review.authorProfile,
                platform: review.platform,
                rating: review.rating,
                likes: review.likes,
                sentiment: review.sentiment,
                sentimentScore: review.sentimentScore,
                createdAtPlatform: review.createdAtPlatform,
                createdAt: review.createdAt,
                updatedAt: review.updatedAt
            })),
            totalReviews: reviews.length
        };

        res.json(response);

    } catch (error) {
        console.error("Error fetching product reviews:", error);
        res.status(500).json({
            error: 'Failed to fetch product reviews',
            details: error.message
        });
    }
};

module.exports = {
    getProductReviews
};
