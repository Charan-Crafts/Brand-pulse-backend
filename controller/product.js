const Product = require('../models/products.model');
const Review = require('../models/review.models');
const webscraperController = require('./webscraper');

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

const getProductCategories = async (req, res) => {
    try {
        const categories = await Product.find().select('productName _id');
        res.json(categories);
    } catch (error) {
        console.error("Error fetching product categories:", error);
        res.status(500).json({ error: "Failed to fetch product categories" });
    }
};

const createProduct = async (req, res) => {
    try {
        const { productName, productUrls, platform } = req.body;

        // Validate required fields
        if (!productName) {
            return res.status(400).json({ error: 'Product name is required' });
        }

        if (!productUrls || !Array.isArray(productUrls) || productUrls.length === 0) {
            return res.status(400).json({ error: 'At least one product URL is required' });
        }

        if (!platform) {
            return res.status(400).json({ error: 'Platform is required' });
        }

        // Validate platform
        const validPlatforms = ['instagram', 'amazon'];
        if (!validPlatforms.includes(platform.toLowerCase())) {
            return res.status(400).json({ error: `Platform must be one of: ${validPlatforms.join(', ')}` });
        }

        const createdProducts = [];
        const errors = [];

        // Create a product for each URL
        for (const productUrl of productUrls) {
            try {
                // Extract platform product ID based on platform
                let platformProductId = null;

                if (platform.toLowerCase() === 'instagram' && productUrl.includes('/p/')) {
                    platformProductId = productUrl.replace(/\/$/, '').split('/p/')[1].split('/')[0];
                } else if (platform.toLowerCase() === 'amazon') {
                    // Extract ASIN from Amazon URL
                    const asinMatch = productUrl.match(/\/dp\/([A-Z0-9]{10})/);
                    if (asinMatch) {
                        platformProductId = asinMatch[1];
                    }
                }

                // Check if product already exists
                const existingProduct = await Product.findOne({
                    platform: platform.toLowerCase(),
                    platformProductId: platformProductId || productUrl
                });

                if (existingProduct) {
                    errors.push({
                        url: productUrl,
                        error: 'Product with this URL already exists'
                    });
                    continue;
                }

                // Create new product
                const product = await Product.create({
                    productName: productName,
                    productUrl: productUrl,
                    platform: platform.toLowerCase(),
                    platformProductId: platformProductId,
                    totalReviews: 0,
                    positiveCount: 0,
                    negativeCount: 0,
                    neutralCount: 0,
                    scrapeStatus: 'pending'
                });

                createdProducts.push({
                    id: product._id,
                    productName: product.productName,
                    productUrl: product.productUrl,
                    platform: product.platform,
                    platformProductId: product.platformProductId
                });

                // Automatically trigger scraping for Instagram products
                if (platform.toLowerCase() === 'instagram' && productUrl.includes('/p/')) {
                    // Trigger scraping asynchronously (don't wait for it to complete)
                    // This ensures product creation is fast and scraping happens in background
                    setImmediate(async () => {
                        try {
                            const mockReq = {
                                body: {
                                    instagramUrl: productUrl,
                                    resultsLimit: 50,
                                    productName: productName
                                }
                            };

                            const mockRes = {
                                json: (data) => {
                                    console.log('✅ Scraping completed for product:', product._id, productName);
                                    if (data.success) {
                                        console.log(`   - New comments: ${data.newCommentsCount || 0}`);
                                        console.log(`   - Total comments: ${data.totalCommentsInPost || 0}`);
                                    }
                                },
                                status: (code) => ({
                                    json: (data) => {
                                        console.error('❌ Scraping error for product:', product._id, data);
                                    }
                                })
                            };

                            await webscraperController.scrapeComments(mockReq, mockRes);
                        } catch (scrapeError) {
                            // Log error but don't fail product creation
                            console.error('❌ Error triggering scrape for product:', product._id, scrapeError.message);
                        }
                    });
                }
            } catch (error) {
                errors.push({
                    url: productUrl,
                    error: error.message
                });
            }
        }

        if (createdProducts.length === 0) {
            return res.status(400).json({
                error: 'Failed to create any products',
                details: errors
            });
        }

        res.status(201).json({
            success: true,
            message: `Successfully created ${createdProducts.length} product(s)`,
            products: createdProducts,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error("Error creating product:", error);
        res.status(500).json({
            error: 'Failed to create product',
            details: error.message
        });
    }
};

const getAllReviews = async (req, res) => {
    try {
        const { platform, sentiment, productId, search, sortBy = 'newest', limit = 100 } = req.query;

        // Build query
        const query = {};

        if (platform && platform !== 'all') {
            query.platform = platform.toLowerCase();
        }

        if (sentiment && sentiment !== 'all') {
            query.sentiment = sentiment.toLowerCase();
        }

        if (productId && productId !== 'all') {
            query.product = productId;
        }

        if (search) {
            query.comment = { $regex: search, $options: 'i' };
        }

        // Build sort
        let sort = { createdAtPlatform: -1 }; // Default: newest first
        if (sortBy === 'oldest') {
            sort = { createdAtPlatform: 1 };
        } else if (sortBy === 'hour') {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            query.createdAtPlatform = { $gte: oneHourAgo };
        } else if (sortBy === 'day') {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            query.createdAtPlatform = { $gte: oneDayAgo };
        } else if (sortBy === 'week') {
            const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            query.createdAtPlatform = { $gte: oneWeekAgo };
        }

        // Find reviews
        const reviews = await Review.find(query)
            .populate('product', 'productName platform')
            .sort(sort)
            .limit(parseInt(limit))
            .lean();

        // Format response
        const formattedReviews = reviews.map(review => ({
            id: review._id,
            comment: review.comment,
            authorName: review.authorName || 'Anonymous',
            authorProfile: review.authorProfile,
            platform: review.platform,
            rating: review.rating,
            likes: review.likes || 0,
            sentiment: review.sentiment || 'neutral',
            sentimentScore: review.sentimentScore,
            createdAtPlatform: review.createdAtPlatform,
            createdAt: review.createdAt,
            product: review.product ? {
                id: review.product._id,
                name: review.product.productName,
                platform: review.product.platform
            } : null
        }));

        res.json({
            success: true,
            reviews: formattedReviews,
            total: formattedReviews.length,
            filters: {
                platform,
                sentiment,
                productId,
                search,
                sortBy
            }
        });

    } catch (error) {
        console.error("Error fetching all reviews:", error);
        res.status(500).json({
            error: 'Failed to fetch reviews',
            details: error.message
        });
    }
};

module.exports = {
    getProductReviews,
    getProductCategories,
    createProduct,
    getAllReviews
};
